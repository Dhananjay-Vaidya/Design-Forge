"""Commitments and outcome reviews (docs/04-database-design.md §4.11/4.12, BR-009/BR-010)."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class OutcomeStatus:
    SCHEDULED = "SCHEDULED"
    DUE = "DUE"
    SUBMITTED = "SUBMITTED"
    CANCELLED = "CANCELLED"
    ALL = (SCHEDULED, DUE, SUBMITTED, CANCELLED)


class Commitment(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "commitments"
    __table_args__ = (
        CheckConstraint("confidence BETWEEN 0 AND 100", name="confidence_range"),
        # BR-009: one active commitment per decision, history kept.
        Index(
            "unique_active_commitment",
            "decision_id",
            unique=True,
            postgresql_where=text("is_active"),
        ),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    # Spec says RESTRICT. NO ACTION blocks the same deletes but is checked at statement end, so
    # deleting a whole decision (which cascades to its options) still works; the service also
    # refuses to delete a committed option with a clear message.
    alternative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_alternative.id"), nullable=False
    )
    snapshot_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decision_snapshots.id"), nullable=False
    )
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    rationale: Mapped[str] = mapped_column(Text, default="")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class OutcomeReview(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "outcome_reviews"
    __table_args__ = (
        CheckConstraint(f"status IN {OutcomeStatus.ALL!r}", name="outcome_status_valid"),
        CheckConstraint(
            "satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5", name="satisfaction_range"
        ),
        Index("outcome_reviews_status_due_idx", "status", "due_at"),
        Index("outcome_reviews_decision_idx", "decision_id"),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    commitment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("commitments.id", ondelete="CASCADE"), nullable=False
    )
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default=OutcomeStatus.SCHEDULED)
    satisfaction: Mapped[int | None] = mapped_column(Integer, nullable=True)
    result_notes: Mapped[str] = mapped_column(Text, default="")
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
