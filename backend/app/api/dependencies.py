"""Shared FastAPI dependencies: DB session, current-user resolution, CSRF enforcement."""

import uuid
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import AuthenticationError
from app.core.security import TokenType, decode_token, verify_csrf
from app.models.user import User
from app.repositories import user_repository

_bearer_scheme = HTTPBearer(auto_error=False)

DbSession = Annotated[AsyncSession, Depends(get_db)]


async def get_current_user(
    db: DbSession,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
) -> User:
    if credentials is None:
        raise AuthenticationError("Authentication credentials were not provided.")
    payload = decode_token(credentials.credentials, expected_type=TokenType.ACCESS)
    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise AuthenticationError("Token is invalid or expired.") from exc

    user = await user_repository.get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise AuthenticationError("Token is invalid or expired.")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_csrf(request: Request) -> None:
    """Dependency for the two cookie-authenticated endpoints (docs/adr/ADR-fastapi-authentication.md)."""
    verify_csrf(request)
