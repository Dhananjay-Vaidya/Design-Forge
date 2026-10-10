"""
Guardrails for the PUBLIC, pre-auth AI lane (doc 20 AX-22; the "public lane" of doc 19).

Deliberately separate from `app/ai/guard.py` (the signed-in lane): its own Redis keys, its own daily
budget and its own circuit breaker, so abuse of the public page can never use up a signed-in
person's quota or pause their AI features.

Visitors are identified only by a keyed hash of their IP address (HMAC with the server secret). The
raw IP is never stored, logged or used as a metric label. All keys hold counts only and expire.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac

import redis.asyncio as aioredis
from starlette.requests import Request

from app.core.config import get_settings

_PREFIX = "df:guide"


def _client() -> aioredis.Redis:
    return aioredis.from_url(get_settings().redis_url, socket_connect_timeout=2, socket_timeout=2)


def _today() -> str:
    return dt.datetime.now(dt.UTC).date().isoformat()


def seconds_until_utc_midnight() -> int:
    now = dt.datetime.now(dt.UTC)
    tomorrow = (now + dt.timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(int((tomorrow - now).total_seconds()), 1)


def client_ip(request: Request) -> str:
    """The caller's address. X-Forwarded-For is trusted only when the deployment says a proxy sets it."""
    if get_settings().guide_trust_forwarded_for:
        forwarded = request.headers.get("x-forwarded-for", "")
        if forwarded:
            return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def visitor_key(ip: str) -> str:
    secret = get_settings().jwt_secret_key.encode()
    return hmac.new(secret, ip.encode(), hashlib.sha256).hexdigest()[:32]


async def _incr_window(client: aioredis.Redis, key: str, ttl: int) -> int:
    count = await client.incr(key)
    if count == 1:
        await client.expire(key, ttl)
    return int(count)


async def rate_limited(visitor: str) -> int | None:
    """Per-visitor and global per-minute limits. Returns seconds to wait, or None if allowed."""
    settings = get_settings()
    minute = dt.datetime.now(dt.UTC).strftime("%Y%m%d%H%M")
    client = _client()
    try:
        mine = await _incr_window(client, f"{_PREFIX}:rate:{visitor}:{minute}", 120)
        everyone = await _incr_window(client, f"{_PREFIX}:rate:all:{minute}", 120)
    finally:
        await client.aclose()
    if mine > settings.guide_rate_per_minute or everyone > settings.guide_global_per_minute:
        return 60 - dt.datetime.now(dt.UTC).second or 1
    return None


def _drafts_key(visitor: str) -> str:
    return f"{_PREFIX}:drafts:{visitor}:{_today()}"


async def drafts_used(visitor: str) -> int:
    client = _client()
    try:
        return int(await client.get(_drafts_key(visitor)) or 0)
    finally:
        await client.aclose()


async def reserve_draft(visitor: str) -> int | None:
    """Reserve one free draft for today. Returns drafts left after this one, or None if capped."""
    cap = get_settings().guide_free_drafts
    client = _client()
    try:
        used = await _incr_window(client, _drafts_key(visitor), 2 * 86400)
        if used > cap:
            await client.decr(_drafts_key(visitor))
            return None
        return cap - used
    finally:
        await client.aclose()


async def release_draft(visitor: str) -> None:
    """A draft that produced nothing usable doesn't count against the visitor."""
    client = _client()
    try:
        if int(await client.get(_drafts_key(visitor)) or 0) > 0:
            await client.decr(_drafts_key(visitor))
    finally:
        await client.aclose()


def _budget_key() -> str:
    return f"{_PREFIX}:budget:{_today()}"


async def budget_remaining() -> int:
    client = _client()
    try:
        used = int(await client.get(_budget_key()) or 0)
    finally:
        await client.aclose()
    return max(get_settings().guide_daily_budget - used, 0)


async def spend_budget() -> bool:
    """Take one model call from the public lane's global daily budget. False when it is used up."""
    budget = get_settings().guide_daily_budget
    client = _client()
    try:
        used = await _incr_window(client, _budget_key(), 2 * 86400)
        if used > budget:
            await client.decr(_budget_key())
            return False
        return True
    finally:
        await client.aclose()


async def refund_budget() -> None:
    client = _client()
    try:
        if int(await client.get(_budget_key()) or 0) > 0:
            await client.decr(_budget_key())
    finally:
        await client.aclose()


# ---- circuit breaker (public lane only) ---------------------------------------------------------


async def breaker_open() -> bool:
    client = _client()
    try:
        ttl = await client.ttl(f"{_PREFIX}:breaker:open")
    finally:
        await client.aclose()
    return ttl is not None and ttl > 0


async def record_failure() -> None:
    settings = get_settings()
    client = _client()
    try:
        fails = await _incr_window(
            client, f"{_PREFIX}:breaker:fails", settings.gemini_breaker_window_seconds
        )
        if fails >= settings.gemini_breaker_failure_threshold:
            await client.set(
                f"{_PREFIX}:breaker:open", "1", ex=settings.gemini_breaker_cooldown_seconds
            )
            await client.delete(f"{_PREFIX}:breaker:fails")
    finally:
        await client.aclose()


async def record_success() -> None:
    client = _client()
    try:
        await client.delete(f"{_PREFIX}:breaker:fails")
    finally:
        await client.aclose()


# ---- single-use draft tokens ------------------------------------------------------------------


async def claim_token(jti: str, ttl_seconds: int) -> bool:
    """Mark a draft token as used. True only the first time (SET NX)."""
    client = _client()
    try:
        return bool(await client.set(f"{_PREFIX}:used:{jti}", "1", nx=True, ex=ttl_seconds))
    finally:
        await client.aclose()
