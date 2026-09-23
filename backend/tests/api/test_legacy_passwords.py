"""
Users created under the Django backend must keep working after the cutover. DJANGO_HASH was
produced by the real Django `make_password('Legacy-Passw0rd!')` (Django 5.0.9, PBKDF2-SHA256), not
by our own code, so this proves compatibility with genuine legacy data.
"""

import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import verify_password
from app.models.user import User, UserProfile

DJANGO_HASH = (
    "pbkdf2_sha256$720000$SMKt8Pkerrad3uRr3ue6Wn$1s34VD6Zuk+RLkIZ5XNuKbV0w8E9mPZwDSznUuT2bx4="
)
PASSWORD = "Legacy-Passw0rd!"


def test_django_pbkdf2_hash_verifies_and_requests_argon2_upgrade():
    ok, rehash = verify_password(PASSWORD, DJANGO_HASH)
    assert ok is True
    assert rehash is not None and rehash.startswith("$argon2id$")


def test_wrong_password_against_django_hash_fails_without_rehash():
    assert verify_password("wrong-password", DJANGO_HASH) == (False, None)


async def test_legacy_user_can_log_in_and_hash_is_upgraded(
    client: AsyncClient, db_session: AsyncSession
):
    email = f"legacy-{uuid.uuid4().hex[:8]}@example.com"
    legacy = User(email=email, password_hash=DJANGO_HASH)
    db_session.add(legacy)
    await db_session.commit()
    db_session.add(UserProfile(user_id=legacy.id))
    await db_session.commit()

    await client.get("/api/v1/auth/csrf")
    csrf = {"X-CSRFToken": client.cookies.get("df_csrftoken") or ""}
    bad = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "nope-nope-nope"}, headers=csrf
    )
    assert bad.status_code == 401

    ok = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": PASSWORD}, headers=csrf
    )
    assert ok.status_code == 200 and "access" in ok.json()

    await db_session.refresh(legacy)
    assert legacy.password_hash.startswith("$argon2id$")
    again = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": PASSWORD}, headers=csrf
    )
    assert again.status_code == 200  # still works with the upgraded hash
    row = (await db_session.execute(select(User).where(User.email == email))).scalar_one()
    assert row.password_hash.startswith("$argon2id$")
