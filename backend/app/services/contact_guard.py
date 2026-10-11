"""Shared, atomic per-IP and global limits. Redis stores only expiring anonymous counters."""

import hashlib
import hmac
from datetime import UTC, datetime

import redis.asyncio as aioredis
from starlette.requests import Request

from app.core.config import get_settings

# One script makes both counters and their expiration atomic across API workers.
RATE_SCRIPT = """
local mine = redis.call('INCR', KEYS[1])
local all = redis.call('INCR', KEYS[2])
if mine == 1 then redis.call('EXPIRE', KEYS[1], 120) end
if all == 1 then redis.call('EXPIRE', KEYS[2], 120) end
if mine > tonumber(ARGV[1]) or all > tonumber(ARGV[2]) then return 1 end
return 0
"""


def ip_hash(request: Request) -> str:
    settings = get_settings()
    address = request.client.host if request.client else "unknown"
    if settings.contact_trust_forwarded_for:
        address = request.headers.get("x-forwarded-for", address).split(",")[0].strip()
    return hmac.new(
        settings.jwt_secret_key.encode(), f"contact:{address}".encode(), hashlib.sha256
    ).hexdigest()


async def rate_limited(visitor: str) -> int | None:
    settings = get_settings()
    now = datetime.now(UTC)
    minute = now.strftime("%Y%m%d%H%M")
    client = aioredis.from_url(settings.redis_url, socket_connect_timeout=2, socket_timeout=2)
    try:
        blocked = await client.eval(
            RATE_SCRIPT,
            2,
            f"df:contact:rate:{visitor}:{minute}",
            f"df:contact:rate:all:{minute}",
            settings.contact_rate_per_minute,
            settings.contact_global_per_minute,
        )
    finally:
        await client.aclose()
    return max(60 - now.second, 1) if blocked else None
