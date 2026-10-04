"""Immutable decision snapshots (docs/04-database-design.md §4.8, BR-007). Insert-only by design."""

import uuid
from datetime import datetime

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class SnapshotReason:
    """`manual` (a user-saved version) is an addition to the doc's analysis/commitment reasons."""

    MANUAL = "manual"
    ANALYSIS = "analysis"
    COMMITMENT = "commitment"
    ALL = (MANUAL, ANALYSIS, COMMITMENT)


class DecisionSnapshot(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "decision_snapshots"
    __table_args__ = (
        UniqueConstraint("decision_id", "version", name="unique_snapshot_version"),
        CheckConstraint(f"reason IN {SnapshotReason.ALL!r}", name="snapshot_reason_valid"),
        Index("decision_snapshots_decision_version_idx", "decision_id", "version"),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(16), nullable=False)
    label: Mapped[str] = mapped_column(String(120), default="")
    snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
