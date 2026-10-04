"""AI proposals (doc 18 AX-INF-1): staged suggestions that only a person's acceptance turns into data."""

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
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.base import UUIDPrimaryKeyMixin


class ProposalStatus:
    QUEUED = "QUEUED"  # reserved for a future asynchronous runner; today actions complete inline
    READY = "READY"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"
    ALL = (QUEUED, READY, ACCEPTED, REJECTED, EXPIRED)


class AIProposal(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "ai_proposals"
    __table_args__ = (
        CheckConstraint(f"status IN {ProposalStatus.ALL!r}", name="proposal_status_valid"),
        CheckConstraint("kind IN ('proposal', 'advisory')", name="proposal_kind_valid"),
        Index("ai_proposals_decision_created_idx", "decision_id", "created_at"),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    # The version of the decision the model was shown (null if the version cap was reached).
    snapshot_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decision_snapshots.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(48), nullable=False)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)
    status: Mapped[str] = mapped_column(String(12), default=ProposalStatus.READY)
    prompt_version: Mapped[str] = mapped_column(String(16), nullable=False)
    model: Mapped[str] = mapped_column(String(64), nullable=False)
    # {"summary": str, "items": [...]} or {"summary": str, "sections": [...]}. Never prompt text.
    payload_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    # {item_id: {"status": "accepted"|"rejected"|"failed", "at": iso, "created": {...}, "message"?}}
    resolution_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    input_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    output_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cache_hit: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
