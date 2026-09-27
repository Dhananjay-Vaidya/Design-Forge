"""
Per-user daily quota (docs/06 §13, BR-013) and a global circuit breaker (docs/06 §14), both in
Redis so they hold across Gunicorn workers. Keys contain the user id only as a Redis key, never
as a metric label, and hold counts only (no prompt text).
"""

from __future__ import annotations

import datetime as dt
import uuid

import redis.asyncio as aioredis

from app.core.config import get_settings
from app.observability import metrics

_QUOTA_PREFIX = "df:ai:quota"
_BREAKER_FAILS = "df:ai:breaker:failures"
_BREAKER_OPEN = "df:ai:breaker:open"


def _client() -> aioredis.Redis:
    return aioredis.from_url(get_settings().redis_url, socket_connect_timeout=2, socket_timeout=2)


def _quota_key(user_id: uuid.UUID) -> str:
    return f"{_QUOTA_PREFIX}:{user_id}:{dt.datetime.now(dt.UTC).date().isoformat()}"


def seconds_until_utc_midnight() -> int:
    now = dt.datetime.now(dt.UTC)
    tomorrow = (now + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((tomorrow - now).total_seconds()), 1)


async def used_today(user_id: uuid.UUID) -> int:
    client = _client()
    try:
        value = await client.get(_quota_key(user_id))
        return int(value or 0)
    finally:
        await client.aclose()


async def consume(user_id: uuid.UUID) -> int | None:
    """Reserve one request. Returns the remaining count, or None when the limit is reached."""
    limit = get_settings().gemini_daily_user_quota
    client = _client()
    try:
        key = _quota_key(user_id)
        count = await client.incr(key)
        if count == 1:
            await client.expire(key, 2 * 86400)
        if count > limit:
            await client.decr(key)
            return None
        return limit - count
    finally:
        await client.aclose()


async def refund(user_id: uuid.UUID) -> None:
    """A request that failed before producing any output does not count against the user."""
    client = _client()
    try:
        key = _quota_key(user_id)
        if int(await client.get(key) or 0) > 0:
            await client.decr(key)
    finally:
        await client.aclose()


async def breaker_open() -> int | None:
    """Seconds until the breaker closes again, or None when it is closed."""
    client = _client()
    try:
        ttl = await client.ttl(_BREAKER_OPEN)
    finally:
        await client.aclose()
    is_open = ttl is not None and ttl > 0
    metrics.set_circuit_breaker_open("gemini", is_open)
    return ttl if is_open else None


async def record_failure() -> None:
    settings = get_settings()
    client = _client()
    try:
        fails = await client.incr(_BREAKER_FAILS)
        if fails == 1:
            await client.expire(_BREAKER_FAILS, settings.gemini_breaker_window_seconds)
        if fails >= settings.gemini_breaker_failure_threshold:
            await client.set(_BREAKER_OPEN, "1", ex=settings.gemini_breaker_cooldown_seconds)
            await client.delete(_BREAKER_FAILS)
            metrics.set_circuit_breaker_open("gemini", True)
    finally:
        await client.aclose()


async def record_success() -> None:
    client = _client()
    try:
        await client.delete(_BREAKER_FAILS)
    finally:
        await client.aclose()
    metrics.set_circuit_breaker_open("gemini", False)
