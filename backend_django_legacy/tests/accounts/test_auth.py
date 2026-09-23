import pytest
from django.conf import settings

from apps.accounts.models import User
from tests.factories import UserFactory

pytestmark = pytest.mark.django_db


def test_register_creates_user_and_profile(api_client):
    response = api_client.post(
        "/api/v1/auth/register",
        {"email": "New.User@Example.com", "password": "StrongPassw0rd!"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["user"]["email"] == "new.user@example.com"
    assert "access" in response.data
    assert settings.JWT_REFRESH_COOKIE_NAME in response.cookies

    user = User.objects.get(email="new.user@example.com")
    assert hasattr(user, "profile")


def test_register_duplicate_email_returns_409(api_client):
    UserFactory(email="taken@example.com")
    response = api_client.post(
        "/api/v1/auth/register",
        {"email": "taken@example.com", "password": "StrongPassw0rd!"},
        format="json",
    )
    assert response.status_code == 409
    assert response.data["error"]["code"] == "conflict"


def test_register_weak_password_returns_400_validation_error(api_client):
    response = api_client.post(
        "/api/v1/auth/register",
        {"email": "weak@example.com", "password": "123"},
        format="json",
    )
    assert response.status_code == 400
    assert response.data["error"]["code"] == "validation_error"
    assert "password" in response.data["error"]["fields"]


def test_login_success_returns_access_and_sets_refresh_cookie(api_client):
    UserFactory(email="login@example.com", password="CorrectHorse9!")
    response = api_client.post(
        "/api/v1/auth/login",
        {"email": "login@example.com", "password": "CorrectHorse9!"},
        format="json",
    )
    assert response.status_code == 200
    assert "access" in response.data
    assert settings.JWT_REFRESH_COOKIE_NAME in response.cookies


def test_login_invalid_credentials_returns_401(api_client):
    UserFactory(email="login2@example.com", password="CorrectHorse9!")
    response = api_client.post(
        "/api/v1/auth/login",
        {"email": "login2@example.com", "password": "WrongPassword!"},
        format="json",
    )
    assert response.status_code == 401
    assert response.data["error"]["code"] == "authentication_required"


def test_me_requires_authentication(api_client):
    response = api_client.get("/api/v1/me")
    assert response.status_code == 401


def test_me_returns_current_user(auth_client, user):
    response = auth_client.get("/api/v1/me")
    assert response.status_code == 200
    assert response.data["email"] == user.email


def test_me_profile_patch_updates_display_name(auth_client):
    response = auth_client.patch("/api/v1/me/profile", {"display_name": "Aditi"}, format="json")
    assert response.status_code == 200
    assert response.data["profile"]["display_name"] == "Aditi"


def test_refresh_without_cookie_returns_401(api_client):
    response = api_client.post("/api/v1/auth/refresh")
    assert response.status_code == 401


def test_login_then_refresh_rotates_cookie(csrf_enforcing_client):
    UserFactory(email="refresh@example.com", password="CorrectHorse9!")
    login_response = csrf_enforcing_client.post(
        "/api/v1/auth/login",
        {"email": "refresh@example.com", "password": "CorrectHorse9!"},
        format="json",
    )
    old_refresh = login_response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value

    csrf_response = csrf_enforcing_client.get("/api/v1/auth/csrf")
    csrf_token = csrf_response.cookies[settings.CSRF_COOKIE_NAME].value

    refresh_response = csrf_enforcing_client.post(
        "/api/v1/auth/refresh", HTTP_X_CSRFTOKEN=csrf_token
    )
    assert refresh_response.status_code == 200
    assert "access" in refresh_response.data
    new_refresh = refresh_response.cookies[settings.JWT_REFRESH_COOKIE_NAME].value
    assert new_refresh != old_refresh


def test_refresh_without_csrf_header_returns_403(csrf_enforcing_client):
    UserFactory(email="nocsrf@example.com", password="CorrectHorse9!")
    csrf_enforcing_client.post(
        "/api/v1/auth/login",
        {"email": "nocsrf@example.com", "password": "CorrectHorse9!"},
        format="json",
    )
    response = csrf_enforcing_client.post("/api/v1/auth/refresh")
    assert response.status_code == 403


def test_logout_requires_csrf_header(csrf_enforcing_client, user):
    from rest_framework_simplejwt.tokens import RefreshToken

    access = str(RefreshToken.for_user(user).access_token)
    csrf_enforcing_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    response = csrf_enforcing_client.post("/api/v1/auth/logout")
    assert response.status_code == 403


def test_delete_account_removes_user(auth_client, user):
    response = auth_client.post("/api/v1/me/delete")
    assert response.status_code == 204
    assert not User.objects.filter(id=user.id).exists()
