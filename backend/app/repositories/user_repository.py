"""Data access for User/UserProfile/RefreshToken — no business rules here (Step 6)."""

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import RefreshToken, User, UserProfile


async def get_by_id(db: AsyncSession, user_id: uuid.UUID) -> User | None:
    stmt = select(User).options(selectinload(User.profile)).where(User.id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = select(User).options(selectinload(User.profile)).where(User.email == email.lower())
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_user(db: AsyncSession, *, email: str, password_hash: str) -> User:
    user = User(email=email.lower(), password_hash=password_hash)
    db.add(user)
    await db.flush()
    db.add(UserProfile(user_id=user.id))
    await db.flush()
    await db.refresh(user, attribute_names=["profile"])
    return user


async def update_password_hash(db: AsyncSession, user: User, new_hash: str) -> None:
    user.password_hash = new_hash
    await db.flush()


async def update_profile(
    db: AsyncSession,
    profile: UserProfile,
    *,
    display_name: str | None = None,
    timezone: str | None = None,
    preferences: dict | None = None,
) -> UserProfile:
    if display_name is not None:
        profile.display_name = display_name
    if timezone is not None:
        profile.timezone = timezone
    if preferences is not None:
        profile.preferences = preferences
    await db.flush()
    return profile


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)


async def create_refresh_token(
    db: AsyncSession, *, user_id: uuid.UUID, jti: str, expires_at: datetime
) -> RefreshToken:
    token = RefreshToken(user_id=user_id, jti=jti, expires_at=expires_at)
    db.add(token)
    await db.flush()
    return token


async def get_refresh_token_by_jti(db: AsyncSession, jti: str) -> RefreshToken | None:
    stmt = select(RefreshToken).where(RefreshToken.jti == jti)
    return (await db.execute(stmt)).scalar_one_or_none()


async def revoke_refresh_token(db: AsyncSession, token: RefreshToken) -> None:
    token.revoked_at = datetime.now(UTC)
    await db.flush()
