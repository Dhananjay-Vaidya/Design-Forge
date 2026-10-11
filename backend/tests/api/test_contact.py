"""Contact intake uses the real isolated PostgreSQL and Redis test instances, never SMTP."""

import logging
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
import redis.asyncio as aioredis
from prometheus_client import REGISTRY
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from starlette.requests import Request

from app.api.dependencies import get_db
from app.core.config import get_settings
from app.main import app
from app.models.contact import ContactMessage
from app.services import contact_guard

pytestmark = pytest.mark.asyncio
URL = "/api/v1/contact"
GOOD = {
    "name": "Contact Test Visitor",
    "email": "contact-test@example.com",
    "reason": "feedback",
    "message": "A private message for the inbox, not application logs.",
    "consent": True,
    "website": "",
}


def metric(result: str) -> float:
    return (
        REGISTRY.get_sample_value("decisionforge_contact_submissions_total", {"result": result})
        or 0
    )


@pytest_asyncio.fixture(autouse=True)
async def contact_keys() -> AsyncGenerator[None, None]:
    async def clean():
        client = aioredis.from_url(get_settings().redis_url)
        try:
            keys = [key async for key in client.scan_iter("df:contact:*")]
            if keys:
                await client.delete(*keys)
        finally:
            await client.aclose()

    await clean()
    yield
    await clean()
    app.dependency_overrides.pop(get_db, None)


async def test_valid_public_submission_is_stored_without_pii_in_logs(client, db_session, caplog):
    before = metric("ok")
    with caplog.at_level(logging.INFO):
        response = await client.post(URL, json=GOOD)
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    row = (await db_session.scalars(select(ContactMessage))).one()
    assert row.name == GOOD["name"]
    assert row.email == GOOD["email"]
    assert row.message == GOOD["message"]
    assert row.consent and not row.handled
    assert len(row.ip_hash) == 64 and "127.0.0.1" not in row.ip_hash
    assert metric("ok") == before + 1
    for field in ("name", "email", "message"):
        assert GOOD[field] not in caplog.text


@pytest.mark.parametrize(
    "patch,field",
    [
        ({"name": " "}, "name"),
        ({"email": "bad email"}, "email"),
        ({"message": ""}, "message"),
        ({"message": "x" * 2001}, "message"),
        ({"name": "x" * 81}, "name"),
        ({"reason": "unsupported"}, "reason"),
        ({"consent": False}, "consent"),
        ({"consent": "true"}, "consent"),
    ],
)
async def test_invalid_fields_have_400_field_errors(client, db_session, patch, field):
    before = metric("invalid")
    response = await client.post(URL, json=GOOD | patch)
    assert response.status_code == 400
    assert field in response.json()["error"]["fields"]
    assert await db_session.scalar(select(func.count()).select_from(ContactMessage)) == 0
    assert metric("invalid") == before + 1


async def test_missing_fields_and_invalid_json_are_rejected(client):
    response = await client.post(URL, json={})
    assert response.status_code == 400
    assert {"name", "email", "message", "consent"} <= response.json()["error"]["fields"].keys()
    response = await client.post(URL, content="{", headers={"Content-Type": "application/json"})
    assert response.status_code == 400


async def test_honeypot_is_accepted_but_not_stored(client, db_session):
    before = metric("spam")
    response = await client.post(URL, json=GOOD | {"website": "https://spam.example"})
    assert response.status_code == 200 and response.json() == {"ok": True}
    assert await db_session.scalar(select(func.count()).select_from(ContactMessage)) == 0
    assert metric("spam") == before + 1


async def test_per_ip_rate_limit_has_friendly_retry_and_does_not_store(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(get_settings(), "contact_rate_per_minute", 1)
    await client.post(URL, json=GOOD)
    before = metric("rate_limited")
    response = await client.post(URL, json=GOOD)
    assert response.status_code == 429
    assert 1 <= response.json()["error"]["retry_after_seconds"] <= 60
    assert int(response.headers["Retry-After"]) > 0
    assert await db_session.scalar(select(func.count()).select_from(ContactMessage)) == 1
    assert metric("rate_limited") == before + 1


async def test_global_limit_applies_across_visitors(monkeypatch):
    monkeypatch.setattr(get_settings(), "contact_global_per_minute", 1)
    assert await contact_guard.rate_limited("anonymous-a") is None
    assert await contact_guard.rate_limited("anonymous-b") is not None


async def test_forwarded_ip_is_ignored_until_a_trusted_proxy_is_enabled(monkeypatch):
    request = Request(
        {
            "type": "http",
            "client": ("127.0.0.1", 4000),
            "headers": [(b"x-forwarded-for", b"203.0.113.4")],
        }
    )
    direct = contact_guard.ip_hash(request)
    monkeypatch.setattr(get_settings(), "contact_trust_forwarded_for", True)
    assert contact_guard.ip_hash(request) != direct


async def test_redis_outage_fails_closed(client, db_session, monkeypatch):
    from redis.exceptions import ConnectionError

    async def unavailable(visitor):
        raise ConnectionError("offline")

    monkeypatch.setattr(contact_guard, "rate_limited", unavailable)
    response = await client.post(URL, json=GOOD)
    assert response.status_code == 429
    assert await db_session.scalar(select(func.count()).select_from(ContactMessage)) == 0


async def test_large_body_is_rejected_before_parsing(client, db_session):
    response = await client.post(
        URL, content="x" * 17000, headers={"Content-Type": "application/json"}
    )
    assert response.status_code == 400
    assert "message" in response.json()["error"]["fields"]
    assert await db_session.scalar(select(func.count()).select_from(ContactMessage)) == 0


async def test_database_errors_do_not_log_sql_parameters(client, caplog):
    class FailingSession:
        def add(self, row):
            pass

        async def commit(self):
            raise SQLAlchemyError(str(GOOD))

        async def rollback(self):
            pass

    async def fail_db():
        yield FailingSession()

    app.dependency_overrides[get_db] = fail_db
    with caplog.at_level(logging.INFO):
        response = await client.post(URL, json=GOOD)
    assert response.status_code == 500
    assert GOOD["email"] not in caplog.text
    assert GOOD["message"] not in caplog.text
    assert GOOD["message"] not in response.text
