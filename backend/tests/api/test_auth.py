"""
Auth API tests — direct port of backend/tests/accounts/test_auth.py's intent (Step 17: "Do not
remove meaningful tests merely because they were written for Django. Recreate their intent for
FastAPI."). Same assertions, same status codes, same error envelope shape.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models.user import User

settings = get_settings()

pytestmark = pytest.mark.asyncio


async def test_register_creates_user_and_profile(client: AsyncClient, db_session: AsyncSession):
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": "New.User@Example.com", "password": "StrongPassw0rd!"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["user"]["email"] == "new.user@example.com"
    assert "access" in body
    assert settings.jwt_refresh_cookie_name in response.cookies

    result = await db_session.execute(select(User).where(User.email == "new.user@example.com"))
    user = result.scalar_one()
    assert user is not None


async def test_register_duplicate_email_returns_409(client: AsyncClient, user: User):
    response = await client.post(
        "/api/v1/auth/register", json={"email": user.email, "password": "StrongPassw0rd!"}
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "conflict"


async def test_register_weak_password_returns_400_validation_error(client: AsyncClient):
    response = await client.post(
        "/api/v1/auth/register", json={"email": "weak@example.com", "password": "123"}
    )
    assert response.status_code == 400
    body = response.json()
    assert body["error"]["code"] == "validation_error"
    assert "password" in body["error"]["fields"]


async def test_login_success_returns_access_and_sets_refresh_cookie(
    client: AsyncClient, user: User
):
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "TestPassw0rd!23"}
    )
    assert response.status_code == 200
    assert "access" in response.json()
    assert settings.jwt_refresh_cookie_name in response.cookies


async def test_login_invalid_credentials_returns_401(client: AsyncClient, user: User):
    response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "WrongPassword!"}
    )
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "authentication_required"


async def test_me_requires_authentication(client: AsyncClient):
    response = await client.get("/api/v1/me")
    assert response.status_code == 401


async def test_me_returns_current_user(client: AsyncClient, user: User, auth_headers: dict):
    response = await client.get("/api/v1/me", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["email"] == user.email


async def test_me_profile_patch_updates_display_name(client: AsyncClient, auth_headers: dict):
    response = await client.patch(
        "/api/v1/me/profile", json={"display_name": "Aditi"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["profile"]["display_name"] == "Aditi"


async def test_refresh_without_cookie_returns_401(client: AsyncClient):
    # Seed a valid CSRF cookie/header first so this isolates "missing refresh cookie" from
    # "missing CSRF" (unlike Django's test client, httpx has no CSRF-bypass flag to lean on).
    csrf_response = await client.get("/api/v1/auth/csrf")
    csrf_token = csrf_response.cookies[settings.csrf_cookie_name]
    response = await client.post(
        "/api/v1/auth/refresh", headers={settings.csrf_header_name: csrf_token}
    )
    assert response.status_code == 401


async def test_login_then_refresh_rotates_cookie(client: AsyncClient, user: User):
    login_response = await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "TestPassw0rd!23"}
    )
    old_refresh = login_response.cookies[settings.jwt_refresh_cookie_name]

    csrf_response = await client.get("/api/v1/auth/csrf")
    csrf_token = csrf_response.cookies[settings.csrf_cookie_name]

    refresh_response = await client.post(
        "/api/v1/auth/refresh", headers={settings.csrf_header_name: csrf_token}
    )
    assert refresh_response.status_code == 200
    assert "access" in refresh_response.json()
    new_refresh = refresh_response.cookies[settings.jwt_refresh_cookie_name]
    assert new_refresh != old_refresh


async def test_refresh_without_csrf_header_returns_403(client: AsyncClient, user: User):
    await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "TestPassw0rd!23"}
    )
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 403


async def test_logout_requires_csrf_header(client: AsyncClient, auth_headers: dict):
    response = await client.post("/api/v1/auth/logout", headers=auth_headers)
    assert response.status_code == 403


async def test_logout_with_csrf_clears_cookie(client: AsyncClient, user: User, auth_headers: dict):
    await client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": "TestPassw0rd!23"}
    )
    csrf_response = await client.get("/api/v1/auth/csrf")
    csrf_token = csrf_response.cookies[settings.csrf_cookie_name]
    response = await client.post(
        "/api/v1/auth/logout", headers={**auth_headers, settings.csrf_header_name: csrf_token}
    )
    assert response.status_code == 204


async def test_delete_account_removes_user(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    response = await client.post("/api/v1/me/delete", headers=auth_headers)
    assert response.status_code == 204
    result = await db_session.execute(select(User).where(User.id == user.id))
    assert result.scalar_one_or_none() is None
