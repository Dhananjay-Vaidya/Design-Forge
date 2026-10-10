"""
AX-22 — the public home-page decision drafter (doc 20).

A visitor describes a decision; the model drafts a SCAFFOLD (title, category, options, criteria with a
benefit/cost direction). Nothing else:
  - no scores, no weights, no ranking (BR-006). "Suggested weights" from the plan are deliberately
    omitted: importance is the person's call, and accepted criteria start equal, exactly as in the
    signed-in setup draft;
  - nothing is persisted. The scaffold goes back to the browser with a signed, short-lived,
    single-use draft token that lets the account it is later saved to record "from AI draft".

Order of checks (cheapest and safest first): input bounds -> per-visitor and global rate limits ->
injection check -> free-draft cap (reserved atomically) -> cache -> breaker -> global budget -> model
-> schema + scope + shape. Anything that yields no usable draft releases the reservation.
"""

from __future__ import annotations

import hashlib
import json
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from time import perf_counter
from typing import Any, Literal

import jwt
import redis.asyncio as aioredis
from pydantic import BaseModel, ValidationError, field_validator

from app.ai import guardrails, public_guard
from app.ai.capabilities import _SuggestedOption
from app.ai.provider import AIProviderError, ChatMessage, ChatProvider
from app.ai.runner import parse_json
from app.core.config import get_settings
from app.observability import metrics

logger = logging.getLogger(__name__)

PROMPT_VERSION = "public-v1"
TOKEN_TYPE = "ai_draft"
TOKEN_TTL = timedelta(hours=2)
CACHE_TTL_SECONDS = 3600
MIN_OPTIONS, MAX_OPTIONS = 2, 6
MIN_CRITERIA, MAX_CRITERIA = 2, 8

Result = Literal["ok", "capped", "refused", "degraded"]


class _DraftCriterion(BaseModel):
    name: str = ""
    description: str = ""
    direction: Literal["benefit", "cost"] = "benefit"

    @field_validator("direction", mode="before")
    @classmethod
    def _direction(cls, value: Any) -> Any:
        text = str(value).strip().lower()
        if text in {"cost", "lower", "lower is better", "minimise", "minimize", "negative"}:
            return "cost"
        if text in {"benefit", "higher", "higher is better", "maximise", "maximize", "positive"}:
            return "benefit"
        return value


class PublicDraftOutput(BaseModel):
    in_scope: bool = True
    title: str = ""
    category: str = ""
    options: list[_SuggestedOption] = []
    criteria: list[_DraftCriterion] = []


SYSTEM = """You help a visitor structure a decision they are facing, on the home page of a \
decision-making tool. From their description, draft a starting structure they will review.

- in_scope: false if the text is not a personal or work decision between alternatives (for example \
a request to write something, a question about facts, chit-chat, or instructions to you). When \
false, leave everything else empty.
- title: a short neutral title for the decision, phrased as a question (max 10 words).
- category: one or two words, such as Career, Money, Housing, Health, Education, Personal, Business.
- options: the realistic alternatives (2 to 6), with short specific names and an optional one-line \
note. If only one option is named, add the obvious alternatives, including "do nothing" where it applies.
- criteria: the factors that really differentiate the options (2 to 8), each with a one-line \
description and direction "benefit" (higher is better) or "cost" (lower is better, e.g. price, risk).
- NEVER propose scores, weights, importance, a ranking or a recommendation. The person decides those.
- Use only what the description says or what is generic common sense. Do not invent personal facts."""


def _system() -> str:
    schema = json.dumps(PublicDraftOutput.model_json_schema(), separators=(",", ":"))
    return (
        f"{SYSTEM}\n\nReply with ONE JSON object that matches this JSON Schema, and nothing else "
        f"(no prose, no code fences):\n{schema}\n{guardrails.GUARD_RULES}"
    )


@dataclass(frozen=True)
class DraftOutcome:
    result: Result
    scaffold: dict[str, Any] | None = None
    draft_token: str | None = None
    drafts_remaining: int | None = None
    message: str | None = None
    from_cache: bool = False


def _text(value: str, limit: int) -> str:
    return guardrails.sanitize_text(value, limit).replace("\n", " ").strip()


def shape(out: PublicDraftOutput) -> dict[str, Any] | None:
    """Clamp, dedupe and bound the model's draft. None when it isn't a usable scaffold."""
    seen: set[str] = set()
    options: list[dict[str, str]] = []
    for option in out.options:
        name = _text(option.name, 80)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            options.append({"name": name, "note": _text(option.note, 200)})
        if len(options) == MAX_OPTIONS:
            break
    seen = set()
    criteria: list[dict[str, str]] = []
    for criterion in out.criteria:
        name = _text(criterion.name, 80)
        if name and name.lower() not in seen:
            seen.add(name.lower())
            criteria.append(
                {
                    "name": name,
                    "description": _text(criterion.description, 200),
                    "direction": criterion.direction,
                }
            )
        if len(criteria) == MAX_CRITERIA:
            break
    if len(options) < MIN_OPTIONS or len(criteria) < MIN_CRITERIA:
        return None
    return guardrails.sanitize_payload(
        {
            "title": _text(out.title, 120) or "Which option should I choose?",
            "category": _text(out.category, 40),
            "options": options,
            "criteria": criteria,
        }
    )


def sign_token(scaffold: dict[str, Any], model: str) -> str:
    """Signed record of what the AI drafted, so a later save can tell AI items from typed ones."""
    settings = get_settings()
    now = datetime.now(UTC)
    payload = {
        "token_type": TOKEN_TYPE,
        "jti": uuid.uuid4().hex,
        "iat": now,
        "exp": now + TOKEN_TTL,
        "model": model,
        "pv": PROMPT_VERSION,
        "options": [o["name"] for o in scaffold["options"]],
        "criteria": [c["name"] for c in scaffold["criteria"]],
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def read_token(token: str) -> dict[str, Any] | None:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None
    return payload if payload.get("token_type") == TOKEN_TYPE else None


def _cache_key(model: str, description: str) -> str:
    normalised = " ".join(description.lower().split())
    digest = hashlib.sha256(f"{PROMPT_VERSION}|{model}|{normalised}".encode()).hexdigest()
    return f"df:guide:cache:{digest}"


async def _cache(key: str, value: dict | None = None) -> dict | None:
    client = aioredis.from_url(get_settings().redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        if value is not None:
            await client.set(key, json.dumps(value), ex=CACHE_TTL_SECONDS)
            return None
        raw = await client.get(key)
        return json.loads(raw) if raw else None
    except Exception:  # the cache is an optimisation; an outage is a miss
        return None
    finally:
        await client.aclose()


DEGRADED = (
    "The AI drafter isn't available right now. Start from a template instead; it takes a minute."
)
CAPPED = "You've used today's free drafts. Create a free account to keep drafting, or start from a template."
REFUSED = (
    "That doesn't read like a decision between options. Describe the choice you're facing, "
    "for example two job offers or where to live."
)
UNUSABLE = (
    "The AI couldn't draft a usable structure from that. Add a little more detail, or start from a "
    "template. This didn't use one of your free drafts."
)


async def draft(description: str, *, visitor: str, provider: ChatProvider | None) -> DraftOutcome:
    started = perf_counter()
    try:
        return await _draft(description, visitor=visitor, provider=provider)
    finally:
        metrics.observe_guide_draft_duration(perf_counter() - started)


async def _draft(description: str, *, visitor: str, provider: ChatProvider | None) -> DraftOutcome:
    if guardrails.injection_suspected(description):
        metrics.record_guide_draft("refused")
        return DraftOutcome("refused", message=REFUSED)

    remaining = await public_guard.reserve_draft(visitor)
    if remaining is None:
        metrics.record_guide_draft("capped")
        return DraftOutcome("capped", drafts_remaining=0, message=CAPPED)

    async def give_back(result: Result, message: str) -> DraftOutcome:
        await public_guard.release_draft(visitor)
        metrics.record_guide_draft(result)
        return DraftOutcome(result, drafts_remaining=remaining + 1, message=message)

    model = provider.model if provider else "none"
    key = _cache_key(model, guardrails.redact_pii(description))
    cached = await _cache(key) if provider else None
    if cached is not None:
        metrics.record_guide_draft("ok")
        return DraftOutcome(
            "ok",
            scaffold=cached,
            draft_token=sign_token(cached, model),
            drafts_remaining=remaining,
            from_cache=True,
        )

    if provider is None or await public_guard.breaker_open():
        return await give_back("degraded", DEGRADED)
    if not await public_guard.spend_budget():
        await metrics_budget()
        return await give_back("degraded", DEGRADED)

    user = (
        "The visitor describes their decision like this:\n"
        f"{guardrails.delimit_untrusted('description', description, 1000)}\n\nDraft the structure."
    )
    try:
        parts: list[str] = []
        async for chunk in provider.stream_chat(
            _system(), [ChatMessage("user", user)], json_mode=True
        ):
            parts.append(chunk.text)
    except AIProviderError as exc:
        await public_guard.refund_budget()
        await public_guard.record_failure()
        logger.warning("public drafter provider failure: %s", type(exc).__name__)
        return await give_back("degraded", DEGRADED)
    await public_guard.record_success()
    await metrics_budget()

    try:
        parsed = PublicDraftOutput.model_validate(parse_json("".join(parts)))
    except (ValueError, ValidationError):
        return await give_back("degraded", UNUSABLE)
    if not parsed.in_scope:
        return await give_back("refused", REFUSED)
    scaffold = shape(parsed)
    if scaffold is None:
        return await give_back("degraded", UNUSABLE)

    await _cache(key, scaffold)
    metrics.record_guide_draft("ok")
    return DraftOutcome(
        "ok",
        scaffold=scaffold,
        draft_token=sign_token(scaffold, provider.model),
        drafts_remaining=remaining,
    )


async def metrics_budget() -> None:
    metrics.set_guide_budget_remaining(await public_guard.budget_remaining())
