"""Minimal contact inbox. No raw IP, browser fingerprint, or account association."""

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class ContactMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "contact_messages"
    __table_args__ = (
        CheckConstraint("consent = true", name="contact_consent_required"),
        CheckConstraint(
            "reason IN ('general', 'feedback', 'partnership', 'support', 'press')",
            name="contact_reason_valid",
        ),
    )

    name: Mapped[str] = mapped_column(String(80))
    email: Mapped[str] = mapped_column(String(254))
    reason: Mapped[str] = mapped_column(String(16))
    message: Mapped[str] = mapped_column(Text)
    consent: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    ip_hash: Mapped[str] = mapped_column(String(64))
    handled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
