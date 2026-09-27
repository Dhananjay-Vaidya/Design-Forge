"""
"Ask AI" decision assistant: GET /ai/status and POST /decisions/{id}/chat (Server-Sent Events).

Every guard (feature enabled, circuit breaker, daily quota) and the provider's first chunk are
resolved BEFORE the response starts, so those failures arrive as the standard JSON error envelope
with a proper status code. Only failures after text has started streaming use an SSE `error` event.
"""

import json
import logging
import uuid
from collections.abc import AsyncIterator
from time import perf_counter
from typing import Annotated, Literal

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ai import guard
from app.ai.chat_service import DISCLAIMER, MAX_MESSAGE_CHARS, MAX_MESSAGES, build_system_prompt
from app.ai.context import build_decision_context
from app.ai.provider import (
    AIProviderError,
    AIRateLimitError,
    AIUnavailableError,
    ChatChunk,
    ChatMessage,
    ChatProvider,
    build_default_provider,
)
from app.api.dependencies import CurrentUser, DbSession
from app.core.config import get_settings
from app.core.exceptions import ProviderUnavailableError, QuotaExceededError, RateLimitedError
from app.observability import metrics
from app.services import decision_service

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ai"])


class ChatMessageIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_MESSAGE_CHARS)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: list[ChatMessageIn] = Field(min_length=1, max_length=MAX_MESSAGES)

    @field_validator("messages")
    @classmethod
    def _last_is_user(cls, value: list[ChatMessageIn]) -> list[ChatMessageIn]:
        if value[-1].role != "user":
            raise ValueError("The last message must be from the user.")
        return value


class AIStatusResponse(BaseModel):
    enabled: bool
    model: str | None
    daily_limit: int
    remaining_today: int
    disclaimer: str


def get_chat_provider() -> ChatProvider | None:
    """Dependency so tests can swap in FakeChatProvider (no network, no quota)."""
    return build_default_provider()


ChatProviderDep = Annotated[ChatProvider | None, Depends(get_chat_provider)]


@router.get("/ai/status", response_model=AIStatusResponse)
async def ai_status(current_user: CurrentUser, provider: ChatProviderDep) -> AIStatusResponse:
    limit = get_settings().gemini_daily_user_quota
    used = await guard.used_today(current_user.id)
    return AIStatusResponse(
        enabled=provider is not None,
        model=provider.model if provider else None,
        daily_limit=limit,
        remaining_today=max(limit - used, 0),
        disclaimer=DISCLAIMER,
    )


def _sse(event: str, payload: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n".encode()


async def _open_stream(
    provider: ChatProvider, system: str, messages: list[ChatMessage]
) -> tuple[ChatProvider, AsyncIterator[ChatChunk], ChatChunk]:
    """Start the stream and pull the first chunk; on a transient failure try the fallback model once."""
    try:
        stream = provider.stream_chat(system, messages)
        return provider, stream, await anext(stream)
    except AIUnavailableError:
        fallback_model = get_settings().gemini_fallback_model
        if provider.name != "gemini" or not fallback_model or fallback_model == provider.model:
            raise
        metrics.record_ai_fallback("provider")
        fallback = build_default_provider(model=fallback_model)
        if fallback is None:
            raise
        stream = fallback.stream_chat(system, messages)
        return fallback, stream, await anext(stream)


def _to_app_error(exc: BaseException) -> Exception:
    if isinstance(exc, AIRateLimitError):
        return RateLimitedError(
            "The AI provider is receiving too many requests. Please try again in a minute.",
            retry_after_seconds=exc.retry_after_seconds or 60,
        )
    return ProviderUnavailableError(
        "The AI assistant couldn't answer right now. Your decision and ranking are unaffected; "
        "please try again shortly."
    )


@router.post(
    "/decisions/{decision_id}/chat",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}, "description": "SSE: delta*, done"}},
)
async def chat_about_decision(
    decision_id: uuid.UUID,
    payload: ChatRequest,
    current_user: CurrentUser,
    db: DbSession,
    provider: ChatProviderDep,
) -> StreamingResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    if provider is None:
        raise ProviderUnavailableError(
            "The AI assistant isn't enabled on this server (set GEMINI_ENABLED and GEMINI_API_KEY)."
        )
    retry_in = await guard.breaker_open()
    if retry_in is not None:
        metrics.record_ai_fallback("provider")
        raise ProviderUnavailableError(
            "The AI assistant is paused after repeated provider errors. Please try again shortly.",
            retry_after_seconds=retry_in,
        )
    remaining = await guard.consume(current_user.id)
    if remaining is None:
        metrics.record_quota_rejection()
        raise QuotaExceededError(
            f"You've used today's {get_settings().gemini_daily_user_quota} AI questions. "
            "The limit resets at midnight UTC; everything else keeps working.",
            retry_after_seconds=guard.seconds_until_utc_midnight(),
        )

    context = await build_decision_context(db, decision)
    system = build_system_prompt(context)
    messages = [ChatMessage(role=m.role, content=m.content) for m in payload.messages]

    started = perf_counter()
    try:
        active, stream, first = await _open_stream(provider, system, messages)
    except (AIProviderError, StopAsyncIteration) as exc:
        await guard.refund(current_user.id)
        await guard.record_failure()
        if isinstance(exc, AIRateLimitError):
            metrics.AI_RATE_LIMITS.labels(provider=provider.name).inc()
        metrics.record_ai_request(
            provider=provider.name,
            analysis_type="chat",
            status="failure",
            duration_seconds=perf_counter() - started,
        )
        logger.warning("ai chat failed before streaming: %s", type(exc).__name__)
        raise _to_app_error(exc) from exc

    async def events() -> AsyncIterator[bytes]:
        status = "success"
        input_tokens = output_tokens = None
        try:
            chunk: ChatChunk | None = first
            while chunk is not None:
                if chunk.text:
                    yield _sse("delta", {"text": chunk.text})
                input_tokens = chunk.input_tokens or input_tokens
                output_tokens = chunk.output_tokens or output_tokens
                chunk = await anext(stream, None)
            await guard.record_success()
            yield _sse(
                "done",
                {"model": active.model, "remaining_today": remaining, "disclaimer": DISCLAIMER},
            )
        except AIProviderError as exc:
            status = "failure"
            await guard.record_failure()
            logger.warning("ai chat failed mid-stream: %s", type(exc).__name__)
            yield _sse("error", {"message": str(_to_app_error(exc))})
        finally:
            metrics.record_ai_request(
                provider=active.name,
                analysis_type="chat",
                status=status,
                duration_seconds=perf_counter() - started,
            )
            metrics.record_ai_tokens(active.name, input_tokens, output_tokens)

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
