import pytest
from rest_framework.test import APIClient

from tests.factories import UserFactory


@pytest.fixture
def api_client() -> APIClient:
    return APIClient()


@pytest.fixture
def user(db):
    return UserFactory()


@pytest.fixture
def auth_client(api_client, user):
    from rest_framework_simplejwt.tokens import RefreshToken

    access = str(RefreshToken.for_user(user).access_token)
    api_client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
    return api_client


@pytest.fixture
def csrf_enforcing_client() -> APIClient:
    """
    A client that does NOT set Django test Client's `_dont_enforce_csrf_checks` bypass,
    for tests that must exercise the real CSRF check on refresh/logout (ADR-0001).
    """
    return APIClient(enforce_csrf_checks=True)
