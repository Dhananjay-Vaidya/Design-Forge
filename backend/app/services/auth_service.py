"""
Auth business rules — UC-01 Register, UC-02 Authenticate (docs/fastapi-migration-audit.md §6).
Mirrors apps/accounts/views.py (Django) behavior exactly: duplicate email -> 409 (not 400),
invalid credentials -> 401, refresh rotation blacklists the previous token.
"""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AuthenticationError, ConflictError
from app.core.security import (
    TokenType,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)
from app.models.user import User
from app.repositories import user_repository


async def register(db: AsyncSession, *, email: str, password: str) -> tuple[User, str, str]:
    """Returns (user, access_token, refresh_token). Raises ConflictError on duplicate email."""
    existing = await user_repository.get_by_email(db, email)
    if existing is not None:
        raise ConflictError("An account with this email already exists.")

    user = await user_repository.create_user(db, email=email, password_hash=hash_password(password))
    access = create_access_token(user.id)
    refresh, jti, expires_at = create_refresh_token(user.id)
    await user_repository.create_refresh_token(db, user_id=user.id, jti=jti, expires_at=expires_at)
    await db.commit()
    await db.refresh(user, attribute_names=["profile"])
    return user, access, refresh


async def authenticate(db: AsyncSession, *, email: str, password: str) -> tuple[User, str, str]:
    """Returns (user, access_token, refresh_token). Raises AuthenticationError on failure."""
    user = await user_repository.get_by_email(db, email)
    if user is None or not user.is_active:
        raise AuthenticationError("Invalid email or password.")

    is_valid, rehash = verify_password(password, user.password_hash)
    if not is_valid:
        raise AuthenticationError("Invalid email or password.")
    if rehash:
        await user_repository.update_password_hash(db, user, rehash)

    access = create_access_token(user.id)
    refresh, jti, expires_at = create_refresh_token(user.id)
    await user_repository.create_refresh_token(db, user_id=user.id, jti=jti, expires_at=expires_at)
    await db.commit()
    return user, access, refresh


async def refresh_tokens(db: AsyncSession, *, raw_refresh_token: str) -> tuple[str, str]:
    """Returns (new_access_token, new_refresh_token). Raises AuthenticationError on failure."""
    payload = decode_token(raw_refresh_token, expected_type=TokenType.REFRESH)
    jti = payload.get("jti")
    stored = await user_repository.get_refresh_token_by_jti(db, jti) if jti else None
    if stored is None or stored.revoked_at is not None:
        raise AuthenticationError("Refresh token is invalid or expired.")
    if stored.expires_at.replace(tzinfo=UTC) < datetime.now(UTC):
        raise AuthenticationError("Refresh token is invalid or expired.")

    user = await user_repository.get_by_id(db, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise AuthenticationError("Refresh token is invalid or expired.")

    await user_repository.revoke_refresh_token(db, stored)
    new_access = create_access_token(user.id)
    new_refresh, new_jti, new_expires_at = create_refresh_token(user.id)
    await user_repository.create_refresh_token(
        db, user_id=user.id, jti=new_jti, expires_at=new_expires_at
    )
    await db.commit()
    return new_access, new_refresh


async def logout(db: AsyncSession, *, raw_refresh_token: str | None) -> None:
    if not raw_refresh_token:
        return
    try:
        payload = decode_token(raw_refresh_token, expected_type=TokenType.REFRESH)
    except AuthenticationError:
        return
    jti = payload.get("jti")
    stored = await user_repository.get_refresh_token_by_jti(db, jti) if jti else None
    if stored is not None and stored.revoked_at is None:
        await user_repository.revoke_refresh_token(db, stored)
        await db.commit()


async def update_profile(
    db: AsyncSession,
    user: User,
    *,
    display_name: str | None,
    timezone: str | None,
    preferences: dict | None,
) -> User:
    await user_repository.update_profile(
        db, user.profile, display_name=display_name, timezone=timezone, preferences=preferences
    )
    await db.commit()
    await db.refresh(user, attribute_names=["profile"])
    return user


async def delete_account(db: AsyncSession, user: User) -> None:
    await user_repository.delete_user(db, user)
    await db.commit()
