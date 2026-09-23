"""Security negative tests: token abuse, ownership on every child resource, input limits, leakage."""

import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import jwt
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.security import create_access_token, create_refresh_token
from app.models.decision import Alternative, AlternativeScore, Criterion, Decision
from app.models.user import User, UserProfile

settings = get_settings()
DECISIONS = "/api/v1/decisions"


def _token(user_id: uuid.UUID, **overrides) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "token_type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    } | overrides
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


@pytest.mark.parametrize(
    "header", ["Bearer not-a-jwt", "Bearer ", "Token abc", "Basic dXNlcjpwYXNz"]
)
async def test_malformed_authorization_headers_are_401(client: AsyncClient, header: str):
    r = await client.get(DECISIONS, headers={"Authorization": header})
    assert r.status_code == 401


async def test_expired_token_is_401(client: AsyncClient, user: User):
    expired = _token(user.id, exp=datetime.now(UTC) - timedelta(seconds=5))
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {expired}"})
    assert r.status_code == 401


async def test_token_signed_with_wrong_key_is_401(client: AsyncClient, user: User):
    forged = jwt.encode(
        {
            "sub": str(user.id),
            "token_type": "access",
            "exp": datetime.now(UTC) + timedelta(hours=1),
        },
        "some-other-secret-key-of-sufficient-length!!",
        algorithm="HS256",
    )
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {forged}"})
    assert r.status_code == 401


async def test_alg_none_token_is_401(client: AsyncClient, user: User):
    unsigned = jwt.encode({"sub": str(user.id), "token_type": "access"}, key=None, algorithm="none")
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {unsigned}"})
    assert r.status_code == 401


async def test_refresh_token_cannot_be_used_as_access_token(client: AsyncClient, user: User):
    refresh, _jti, _exp = create_refresh_token(user.id)
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {refresh}"})
    assert r.status_code == 401


async def test_token_for_nonexistent_user_is_401(client: AsyncClient):
    token = create_access_token(uuid.uuid4())
    r = await client.get("/api/v1/me", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 401


async def test_disabled_user_is_rejected(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    assert (await client.get("/api/v1/me", headers=auth_headers)).status_code == 200
    user.is_active = False
    db_session.add(user)
    await db_session.commit()
    assert (await client.get("/api/v1/me", headers=auth_headers)).status_code == 401


_ID = uuid.uuid4()


@pytest.mark.parametrize(
    "method,path",
    [
        ("GET", DECISIONS),
        ("POST", DECISIONS),
        ("GET", f"{DECISIONS}/{_ID}"),
        ("PATCH", f"{DECISIONS}/{_ID}"),
        ("DELETE", f"{DECISIONS}/{_ID}"),
        ("GET", f"{DECISIONS}/{_ID}/alternatives"),
        ("POST", f"{DECISIONS}/{_ID}/alternatives"),
        ("PATCH", f"/api/v1/alternatives/{_ID}"),
        ("DELETE", f"/api/v1/alternatives/{_ID}"),
        ("GET", f"{DECISIONS}/{_ID}/criteria"),
        ("POST", f"{DECISIONS}/{_ID}/criteria"),
        ("PATCH", f"/api/v1/criteria/{_ID}"),
        ("DELETE", f"/api/v1/criteria/{_ID}"),
        ("GET", f"{DECISIONS}/{_ID}/scores"),
        ("PUT", f"{DECISIONS}/{_ID}/scores"),
        ("GET", f"{DECISIONS}/{_ID}/ranking"),
        ("GET", "/api/v1/me"),
        ("PATCH", "/api/v1/me/profile"),
        ("POST", "/api/v1/me/delete"),
    ],
)
async def test_every_protected_route_requires_authentication(
    client: AsyncClient, method: str, path: str
):
    r = await client.request(method, path)
    assert r.status_code == 401, (method, path, r.status_code)


async def _victim_graph(db: AsyncSession) -> tuple[Decision, Alternative, Alternative, Criterion]:
    victim = User(email=f"victim-{uuid.uuid4().hex[:6]}@example.com", password_hash="x")
    db.add(victim)
    await db.commit()
    db.add(UserProfile(user_id=victim.id))
    decision = Decision(owner_id=victim.id, title="Private")
    db.add(decision)
    await db.commit()
    a1 = Alternative(decision_id=decision.id, name="A", position=0)
    a2 = Alternative(decision_id=decision.id, name="B", position=1)
    c = Criterion(decision_id=decision.id, name="C", weight=Decimal("1"), direction="benefit")
    db.add_all([a1, a2, c])
    await db.commit()
    return decision, a1, a2, c


async def test_cross_user_access_is_404_on_every_child_resource(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    decision, a1, _a2, c = await _victim_graph(db_session)
    d = f"{DECISIONS}/{decision.id}"
    attempts = [
        ("GET", d, None),
        ("PATCH", d, {"title": "pwned"}),
        ("DELETE", d, None),
        ("GET", f"{d}/alternatives", None),
        ("POST", f"{d}/alternatives", {"name": "X"}),
        ("PATCH", f"/api/v1/alternatives/{a1.id}", {"name": "pwned"}),
        ("DELETE", f"/api/v1/alternatives/{a1.id}", None),
        ("GET", f"{d}/criteria", None),
        ("POST", f"{d}/criteria", {"name": "X", "weight": "1", "direction": "benefit"}),
        ("PATCH", f"/api/v1/criteria/{c.id}", {"name": "pwned"}),
        ("DELETE", f"/api/v1/criteria/{c.id}", None),
        ("GET", f"{d}/scores", None),
        (
            "PUT",
            f"{d}/scores",
            {"scores": [{"alternative_id": str(a1.id), "criterion_id": str(c.id), "score": 5}]},
        ),
        ("GET", f"{d}/ranking", None),
    ]
    for method, path, body in attempts:
        r = await client.request(method, path, json=body, headers=auth_headers)
        assert r.status_code == 404, (method, path, r.status_code, r.text)

    await db_session.refresh(decision)
    assert decision.title == "Private"  # untouched


async def test_score_cells_for_another_users_alternative_are_ignored_and_never_written(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    mine = Decision(owner_id=user.id, title="Mine")
    db_session.add(mine)
    await db_session.commit()
    my_crit = Criterion(decision_id=mine.id, name="C", weight=Decimal("1"), direction="benefit")
    db_session.add(my_crit)
    await db_session.commit()
    _d, foreign_alt, _a2, _c = await _victim_graph(db_session)

    r = await client.put(
        f"{DECISIONS}/{mine.id}/scores",
        json={
            "scores": [
                {"alternative_id": str(foreign_alt.id), "criterion_id": str(my_crit.id), "score": 5}
            ]
        },
        headers=auth_headers,
    )
    # Same contract as the Django backend: out-of-scope cells are skipped, not written.
    assert r.status_code == 200
    assert r.json()["updated"] == 0
    rows = (await db_session.execute(select(AlternativeScore))).scalars().all()
    assert rows == []


async def test_malformed_uuid_is_404_json_not_500(client: AsyncClient, auth_headers: dict):
    r = await client.get(f"{DECISIONS}/not-a-uuid", headers=auth_headers)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


async def test_unknown_sensitive_fields_are_rejected_on_register(client: AsyncClient):
    await client.get("/api/v1/auth/csrf")
    r = await client.post(
        "/api/v1/auth/register",
        json={"email": "mass@example.com", "password": "Sup3rSecret!pass", "is_staff": True},
        headers={"X-CSRFToken": client.cookies.get("df_csrftoken")},
    )
    assert r.status_code == 400


async def test_responses_never_contain_password_material(client: AsyncClient, auth_headers: dict):
    body = (await client.get("/api/v1/me", headers=auth_headers)).text.lower()
    for leak in ("password", "argon2", "hash", "jti", "secret"):
        assert leak not in body


async def test_internal_errors_do_not_leak_details(monkeypatch, auth_headers: dict):
    from app.main import app
    from app.services import decision_service

    async def boom(*_a, **_k):
        raise RuntimeError("SECRET-INTERNAL-DETAIL postgres://user:pw@db/x")

    monkeypatch.setattr(decision_service, "list_decisions", boom)

    transport = ASGITransport(app=app, raise_app_exceptions=False)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        r = await c.get(DECISIONS, headers=auth_headers)
    assert r.status_code == 500
    assert "SECRET-INTERNAL-DETAIL" not in r.text
    assert "postgres://" not in r.text
    assert r.json()["error"]["request_id"]


async def test_security_headers_and_request_id(client: AsyncClient):
    r = await client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff"
    assert r.headers["x-frame-options"] == "DENY"
    assert r.headers["x-request-id"].startswith("req_")


async def test_untrusted_host_is_rejected(client: AsyncClient):
    r = await client.get("/health", headers={"Host": "evil.example"})
    assert r.status_code == 400


async def test_cors_only_allows_configured_origins(client: AsyncClient):
    ok = await client.options(
        DECISIONS,
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"},
    )
    bad = await client.options(
        DECISIONS,
        headers={"Origin": "http://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-origin" not in bad.headers
