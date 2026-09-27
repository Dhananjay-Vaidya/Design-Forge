"""
Chat provider abstraction (docs/06 §2). Only this module imports the Google Gen AI SDK, so the
provider can be swapped for FakeChatProvider in tests without any network access or quota use.

Exception class names are deliberate: app.observability.metrics.categorize_error() buckets errors
by class name, so AIRateLimitError / AITimeoutError land in the rate_limit / timeout categories.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from dataclasses import dataclass
from typing import Literal, Protocol

from app.core.config import get_settings

Role = Literal["user", "assistant"]


@dataclass(frozen=True)
class ChatMessage:
    role: Role
    content: str


@dataclass(frozen=True)
class ChatChunk:
    text: str = ""
    input_tokens: int | None = None
    output_tokens: int | None = None


class AIProviderError(Exception):
    """Non-retryable provider failure (bad request, blocked content, unexpected response)."""


class AIRateLimitError(AIProviderError):
    def __init__(self, retry_after_seconds: int | None = None) -> None:
        super().__init__("rate limited")
        self.retry_after_seconds = retry_after_seconds


class AITimeoutError(AIProviderError):
    pass


class AIUnavailableError(AIProviderError):
    """Transient: 5xx or network. Eligible for one fallback-model attempt."""


class ChatProvider(Protocol):
    name: str
    model: str

    def stream_chat(
        self, system: str, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[ChatChunk]: ...


class GeminiChatProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout_seconds: int) -> None:
        from google import genai
        from google.genai import types

        self._types = types
        self.model = model
        self._client = genai.Client(
            api_key=api_key, http_options=types.HttpOptions(timeout=timeout_seconds * 1000)
        )

    async def stream_chat(
        self, system: str, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[ChatChunk]:
        from google.genai import errors

        types = self._types
        contents = [
            types.Content(
                role="user" if m.role == "user" else "model",
                parts=[types.Part.from_text(text=m.content)],
            )
            for m in messages
        ]
        config = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.6,
            # Thinking models count their reasoning against this budget; too small a budget ends
            # the stream before any visible text (verified with gemini-3.8-flash).
            max_output_tokens=4096,
            thinking_config=_thinking_config(types, self.model),
            # No tools are declared; disabling AFC avoids its per-request warning and overhead.
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        )
        try:
            stream = await self._client.aio.models.generate_content_stream(
                model=self.model, contents=contents, config=config
            )
            usage = None
            produced = False
            async for chunk in stream:
                usage = chunk.usage_metadata or usage
                if chunk.text:
                    produced = True
                    yield ChatChunk(text=chunk.text)
            if not produced:
                # e.g. reasoning exhausted the budget or the answer was blocked: never report an
                # empty answer as a success.
                raise AIProviderError("provider returned no text")
        except errors.APIError as exc:
            raise _map_api_error(exc) from exc
        except TimeoutError as exc:
            raise AITimeoutError("provider timed out") from exc
        except OSError as exc:  # network-level failures (httpx/httpcore raise OSError subclasses)
            raise AIUnavailableError("provider unreachable") from exc
        except Exception as exc:
            # httpx timeouts are not TimeoutError subclasses; classify by name without reading
            # the message (which may echo request content).
            if "timeout" in type(exc).__name__.lower():
                raise AITimeoutError("provider timed out") from exc
            raise
        if usage is not None:
            yield ChatChunk(
                input_tokens=usage.prompt_token_count, output_tokens=usage.candidates_token_count
            )


def _thinking_config(types, model: str):
    """Gemini 3 models: low thinking keeps chat replies fast; other models use their default."""
    if model.startswith("gemini-3"):
        return types.ThinkingConfig(thinking_level="low")
    return None


def _map_api_error(exc) -> AIProviderError:
    code = getattr(exc, "code", None)
    if code == 429:
        return AIRateLimitError()
    if code is not None and (code >= 500 or code == 404):
        # 404 usually means the configured model id was retired; the fallback model may work.
        return AIUnavailableError(f"provider returned {code}")
    return AIProviderError(f"provider returned {code}")


class FakeChatProvider:
    """Deterministic stand-in for tests and local demos. Never touches the network."""

    name = "fake"
    model = "fake-chat"

    def __init__(self, reply: str | None = None, error: Exception | None = None) -> None:
        self.reply = reply
        self.error = error
        self.calls: list[tuple[str, list[ChatMessage]]] = []

    async def stream_chat(
        self, system: str, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[ChatChunk]:
        self.calls.append((system, list(messages)))
        if self.error is not None:
            raise self.error
        text = self.reply or f"(fake) You asked: {messages[-1].content[:80]}"
        for i in range(0, len(text), 12):
            yield ChatChunk(text=text[i : i + 12])
        yield ChatChunk(input_tokens=42, output_tokens=len(text.split()))


def build_default_provider(model: str | None = None) -> ChatProvider | None:
    """The real provider, or None when AI is disabled/unconfigured (the feature then says so)."""
    settings = get_settings()
    if not settings.gemini_enabled or not settings.gemini_api_key:
        return None
    return GeminiChatProvider(
        api_key=settings.gemini_api_key,
        model=model or settings.gemini_model,
        timeout_seconds=settings.gemini_timeout_seconds,
    )
