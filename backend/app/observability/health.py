"""
Health/readiness. Contracts unchanged from the Django backend (`{"status":"ok"}` and
`{"status","checks":{database,redis}}`, 200/503); `optional` is an additive, non-blocking section.

* /health: process liveness only.
* /ready: bounded-time checks of the *required* dependencies (Postgres, Redis). Gemini is reported
  as informational state and never affects the status code: the deterministic features work
  without it. No connection strings, credentials or exception text are ever returned.
"""

import asyncio

import redis.asyncio as aioredis
from fastapi import APIRouter, Response, status
from sqlalchemy import text

from app.core.config import get_settings
from app.core.database import get_engine

router = APIRouter(tags=["observability"])
settings = get_settings()

CHECK_TIMEOUT_SECONDS = 2.0


async def _check_database() -> bool:
    async def probe() -> bool:
        async with get_engine().connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True

    try:
        return await asyncio.wait_for(probe(), CHECK_TIMEOUT_SECONDS)
    except Exception:
        return False


async def _check_redis() -> bool:
    async def probe() -> bool:
        client = aioredis.from_url(settings.redis_url, socket_connect_timeout=CHECK_TIMEOUT_SECONDS)
        try:
            return bool(await client.ping())
        finally:
            await client.aclose()

    try:
        return await asyncio.wait_for(probe(), CHECK_TIMEOUT_SECONDS)
    except Exception:
        return False


def _gemini_state() -> str:
    if not settings.gemini_enabled:
        return "disabled"
    return "configured" if settings.gemini_api_key else "misconfigured"


@router.get("/healthz")
@router.get("/health")
async def healthz() -> dict:
    return {"status": "ok"}


@router.get("/readyz")
@router.get("/ready")
async def readyz(response: Response) -> dict:
    database, redis = await asyncio.gather(_check_database(), _check_redis())
    checks = {"database": database, "redis": redis}
    healthy = all(checks.values())
    response.status_code = status.HTTP_200_OK if healthy else status.HTTP_503_SERVICE_UNAVAILABLE
    return {
        "status": "ok" if healthy else "unavailable",
        "checks": checks,
        "optional": {"gemini": _gemini_state()},
    }
