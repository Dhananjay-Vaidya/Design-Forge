"""
AX-INF-1/5/6/8 — runs one registered AI action end to end (doc 18, doc 06 §12-§15).

Order of operations, and why:
  1. Validate the action's input (400 with field errors, before anything costs money).
  2. AI disabled -> a clear "advisory unavailable" error; the deterministic app is untouched (BR-011).
  3. Build the minimised decision context and the prompt (untrusted text delimited and scrubbed).
  4. Cache lookup keyed by hash(action + prompt version + model + prompt): a hit costs no quota.
  5. Breaker, then the per-user daily quota; the model is called (one fallback attempt on 5xx/network).
  6. Parse -> schema check -> the action's referential checks -> output sanitising. If any of that
     fails the answer is DISCARDED, the quota is refunded and nothing is stored (AC-007).
  7. Store an `AIProposal` (READY) with the prompt version and model. Nothing else is written.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import perf_counter
from typing import Any

import redis.asyncio as aioredis
from pydantic import BaseModel, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import actions, guard, guardrails
from app.ai.context import build_decision_context
from app.ai.provider import (
    AIProviderError,
    AIRateLimitError,
    AIUnavailableError,
    ChatMessage,
    ChatProvider,
    build_default_provider,
)
from app.core.config import get_settings
from app.core.exceptions import (
    ProviderUnavailableError,
    QuotaExceededError,
    RateLimitedError,
    ValidationAppError,
)
from app.models.ai_proposal import AIProposal, ProposalStatus
from app.models.decision import Decision
from app.models.snapshot import SnapshotReason
from app.observability import metrics
from app.services import snapshot_service

logger = logging.getLogger(__name__)

PROPOSAL_TTL = timedelta(days=7)
_CACHE_PREFIX = "df:ai:cache"
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


@dataclass(frozen=True)
class Completion:
    text: str
    input_tokens: int | None
    output_tokens: int | None
    model: str
    provider: str


@dataclass(frozen=True)
class RunOutcome:
    status: str  # "READY" | "FAILED"
    proposal: AIProposal | None
    failure_code: str | None
    message: str | None
    remaining_today: int | None


def to_app_error(exc: BaseException) -> Exception:
    if isinstance(exc, AIRateLimitError):
        return RateLimitedError(
            "The AI provider is receiving too many requests. Please try again in a minute.",
            retry_after_seconds=exc.retry_after_seconds or 60,
        )
    return ProviderUnavailableError(
        "AI suggestions aren't available right now. Your decision and ranking are unaffected; "
        "please try again shortly."
    )


def provider_for_tier(provider: ChatProvider, tier: str) -> ChatProvider:
    """AX-INF-5: the light tier uses the cheaper model from configuration (never a hardcoded name)."""
    if tier == "light" and provider.name == "gemini":
        fallback = get_settings().gemini_fallback_model
        if fallback and fallback != provider.model:
            return build_default_provider(model=fallback) or provider
    return provider


async def _collect(provider: ChatProvider, system: str, user: str) -> Completion:
    parts: list[str] = []
    input_tokens = output_tokens = None
    async for chunk in provider.stream_chat(system, [ChatMessage("user", user)], json_mode=True):
        parts.append(chunk.text)
        input_tokens = chunk.input_tokens or input_tokens
        output_tokens = chunk.output_tokens or output_tokens
    return Completion("".join(parts), input_tokens, output_tokens, provider.model, provider.name)


async def _complete(provider: ChatProvider, system: str, user: str) -> Completion:
    try:
        return await _collect(provider, system, user)
    except AIUnavailableError:
        fallback_model = get_settings().gemini_fallback_model
        if provider.name != "gemini" or not fallback_model or fallback_model == provider.model:
            raise
        metrics.record_ai_fallback("provider")
        fallback = build_default_provider(model=fallback_model)
        if fallback is None:
            raise
        return await _collect(fallback, system, user)


def _system_prompt(action: actions.AIAction) -> str:
    """The action's instructions, the exact JSON shape wanted, then the always-on safety rules."""
    schema = json.dumps(action.response_model.model_json_schema(), separators=(",", ":"))
    return (
        f"{action.system_prompt}\n\nReply with ONE JSON object that matches this JSON Schema, and "
        f"nothing else (no prose before or after, no code fences):\n{schema}\n"
        f"{guardrails.GUARD_RULES}"
    )


def parse_json(text: str) -> Any:
    return json.loads(_FENCE.sub("", text.strip()))


# ---- cache (doc 06 §15) -----------------------------------------------------------------------------


def cache_key(action: actions.AIAction, model: str, system: str, user: str) -> str:
    digest = hashlib.sha256(
        f"{action.name}|{action.prompt_version}|{model}|{system}|{user}".encode()
    ).hexdigest()
    return f"{_CACHE_PREFIX}:{action.name}:{digest}"


async def _cache_get(key: str) -> dict | None:
    started = perf_counter()
    client = aioredis.from_url(get_settings().redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        raw = await client.get(key)
    except Exception:  # a cache outage is a miss, never an error for the user
        metrics.record_cache_operation("ai", "failure", "get", perf_counter() - started)
        return None
    finally:
        await client.aclose()
    metrics.record_cache_operation("ai", "hit" if raw else "miss", "get", perf_counter() - started)
    return json.loads(raw) if raw else None


async def _cache_set(key: str, value: dict) -> None:
    started = perf_counter()
    client = aioredis.from_url(get_settings().redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        await client.set(key, json.dumps(value), ex=get_settings().gemini_cache_ttl_seconds)
        metrics.record_cache_operation("ai", "success", "set", perf_counter() - started)
    except Exception:
        metrics.record_cache_operation("ai", "failure", "set", perf_counter() - started)
    finally:
        await client.aclose()


# ---- the run ----------------------------------------------------------------------------------------


def _validate_input(action: actions.AIAction, raw: dict[str, Any] | None) -> BaseModel:
    try:
        return action.input_model.model_validate(raw or {})
    except ValidationError as exc:
        fields: dict[str, list[str]] = {}
        for err in exc.errors():
            key = ".".join(str(p) for p in err["loc"]) or "input"
            fields.setdefault(key, []).append(err["msg"])
        raise ValidationAppError("One or more fields are invalid.", fields=fields) from exc


def _scan_for_injection(action: actions.AIAction, input_model: BaseModel) -> None:
    for value in input_model.model_dump().values():
        if isinstance(value, str) and guardrails.injection_suspected(value):
            metrics.record_ai_injection_flag(action.name)
            return


async def _snapshot_for(db: AsyncSession, decision: Decision, action: actions.AIAction):
    """The version of the decision the model saw. Best effort: a full version list never blocks AI."""
    try:
        return await snapshot_service.create_snapshot(
            db,
            decision,
            reason=SnapshotReason.ANALYSIS,
            label=f"AI: {action.title}"[:120],
            commit=False,
        )
    except ValidationAppError:
        return None


async def run_action(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    decision: Decision,
    action: actions.AIAction,
    raw_input: dict[str, Any] | None,
    provider: ChatProvider | None,
) -> RunOutcome:
    input_model = _validate_input(action, raw_input)
    if provider is None:
        metrics.record_ai_proposal(action.name, "failed")
        raise ProviderUnavailableError(
            "AI suggestions aren't enabled on this server (set GEMINI_ENABLED and GEMINI_API_KEY). "
            "Everything else works without them."
        )

    context = await build_decision_context(db, decision)
    if action.requires_ranking and not context["ranking"]["available"]:
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"scores": ["Finish scoring first; this analysis needs a calculated ranking."]},
        )
    if action.prepare is not None:
        await action.prepare(db, decision, context)
    _scan_for_injection(action, input_model)
    ctx = actions.ActionContext(decision=decision, context=context, input=input_model)
    system = _system_prompt(action)
    user = action.build_user_prompt(ctx)
    active = provider_for_tier(provider, action.model_tier)

    started = perf_counter()
    key = cache_key(action, active.model, system, user)
    cached = await _cache_get(key) if action.cacheable else None
    parsed: BaseModel | None = None
    completion: Completion | None = None
    remaining: int | None = None
    cache_hit = False

    if cached is not None:
        try:
            parsed = action.response_model.model_validate(cached)
            cache_hit = True
        except ValidationError:
            parsed = None  # schema moved on without a version bump: treat as a miss

    if parsed is None:
        retry_in = await guard.breaker_open()
        if retry_in is not None:
            metrics.record_ai_fallback("provider")
            raise ProviderUnavailableError(
                "AI suggestions are paused after repeated provider errors. Please try again shortly.",
                retry_after_seconds=retry_in,
            )
        remaining = await guard.consume(user_id)
        if remaining is None:
            metrics.record_quota_rejection()
            raise QuotaExceededError(
                f"You've used today's {get_settings().gemini_daily_user_quota} AI actions. "
                "The limit resets at midnight UTC; everything else keeps working.",
                retry_after_seconds=guard.seconds_until_utc_midnight(),
            )
        try:
            completion = await _complete(active, system, user)
        except AIProviderError as exc:
            await guard.refund(user_id)
            await guard.record_failure()
            if isinstance(exc, AIRateLimitError):
                metrics.AI_RATE_LIMITS.labels(provider=active.name).inc()
            metrics.record_ai_request(
                provider=active.name,
                analysis_type=action.name,
                status="failure",
                duration_seconds=perf_counter() - started,
            )
            metrics.record_ai_proposal(action.name, "failed")
            logger.warning("ai action %s failed: %s", action.name, type(exc).__name__)
            raise to_app_error(exc) from exc
        await guard.record_success()
        metrics.record_ai_tokens(
            completion.provider, completion.input_tokens, completion.output_tokens
        )
        try:
            parsed = action.response_model.model_validate(parse_json(completion.text))
        except (ValueError, ValidationError):
            return await _discard(
                user_id,
                action,
                active,
                started,
                "schema_invalid",
                "The AI response could not be validated and was discarded. No suggestion is shown.",
            )

    try:
        payload = guardrails.sanitize_payload(action.build_payload(parsed, ctx))
    except actions.ActionOutputError as exc:
        if not cache_hit:
            return await _discard(user_id, action, active, started, exc.code, exc.message)
        metrics.record_ai_proposal(action.name, "failed")
        return RunOutcome("FAILED", None, exc.code, exc.message, remaining)

    if action.cacheable and not cache_hit:
        await _cache_set(key, parsed.model_dump(mode="json"))

    snapshot = await _snapshot_for(db, decision, action)
    proposal = AIProposal(
        decision_id=decision.id,
        snapshot_id=snapshot.id if snapshot else None,
        action=action.name,
        kind=action.kind,
        status=ProposalStatus.READY,
        prompt_version=action.prompt_version,
        model=active.model,
        payload_json=payload,
        resolution_json={},
        input_tokens=completion.input_tokens if completion else None,
        output_tokens=completion.output_tokens if completion else None,
        cache_hit=cache_hit,
        expires_at=datetime.now(UTC) + PROPOSAL_TTL,
    )
    db.add(proposal)
    await db.flush()
    await db.commit()
    await db.refresh(proposal)
    if snapshot:
        metrics.record_snapshot_created(SnapshotReason.ANALYSIS)
    metrics.record_ai_request(
        provider=active.name,
        analysis_type=action.name,
        status="success",
        duration_seconds=perf_counter() - started,
    )
    metrics.record_ai_proposal(action.name, "created")
    return RunOutcome("READY", proposal, None, None, remaining)


async def _discard(
    user_id: uuid.UUID,
    action: actions.AIAction,
    provider: ChatProvider,
    started: float,
    code: str,
    message: str,
) -> RunOutcome:
    """AC-007: an unusable answer is thrown away, costs the user nothing, and shows nothing."""
    await guard.refund(user_id)
    metrics.record_ai_schema_failure(action.name)
    metrics.record_ai_request(
        provider=provider.name,
        analysis_type=action.name,
        status="rejected",
        duration_seconds=perf_counter() - started,
    )
    metrics.record_ai_proposal(action.name, "failed")
    remaining = max(
        get_settings().gemini_daily_user_quota - await guard.used_today(user_id),
        0,
    )
    return RunOutcome("FAILED", None, code, message, remaining)
