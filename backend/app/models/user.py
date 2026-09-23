"""
Maps to the EXISTING Postgres tables created by Django (docs/fastapi-migration-audit.md §3):
`accounts_user`, `accounts_userprofile`. Table/column names are preserved exactly so an
already-populated database can be adopted without any data migration
(docs/adr/ADR-fastapi-database-migration.md). `refresh_tokens` is new (Django used a third-party
app's tables for this; see docs/adr/ADR-fastapi-authentication.md).
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, column, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts_user"
    __table_args__ = (
        # Case-insensitive uniqueness, matching Django's UniqueConstraint(Lower("email")) exactly
        # (verified against the live DB: `unique_lower_email` UNIQUE btree (lower(email))).
        Index("unique_lower_email", func.lower(column("email")), unique=True),
    )

    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    # Django's AbstractBaseUser names this field/column "password"; kept as-is for DB
    # compatibility, exposed on the Python side as `password_hash` for clarity.
    password_hash: Mapped[str] = mapped_column("password", String(128), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    profile: Mapped["UserProfile"] = relationship(
        back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


class UserProfile(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "accounts_userprofile"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), unique=True
    )
    display_name: Mapped[str] = mapped_column(String(120), default="")
    timezone: Mapped[str] = mapped_column(String(64), default="UTC")
    quota_tier: Mapped[str] = mapped_column(String(32), default="free")
    preferences: Mapped[dict] = mapped_column(JSONB, default=dict)

    user: Mapped[User] = relationship(back_populates="profile")


class RefreshToken(UUIDPrimaryKeyMixin, Base):
    """New table (docs/adr/ADR-fastapi-authentication.md) — replaces simplejwt's token_blacklist."""

    __tablename__ = "refresh_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), nullable=False
    )
    jti: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
