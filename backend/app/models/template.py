"""User-saved decision templates (FX-16). Built-in templates live in code (app/domain/templates.py)."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class UserTemplate(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "decision_templates"
    __table_args__ = (UniqueConstraint("owner_id", "name", name="unique_template_name_per_owner"),)

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="")
    title_hint: Mapped[str] = mapped_column(String(200), default="")
    # [{"name": str, "description": str, "weight": "3", "direction": "benefit"|"cost"}, ...]
    criteria_json: Mapped[list] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
