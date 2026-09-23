"""
Maps to the EXISTING tables `decisions_decision`, `decisions_alternative`, `decisions_criterion`,
`decisions_alternativescore` (docs/fastapi-migration-audit.md §3), including the same named
constraints Django created, so an adopted database needs no reconciliation
(docs/adr/ADR-fastapi-database-migration.md).
"""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin


class DecisionStatus:
    """Mirrors apps/decisions/models.py Decision.Status (Django TextChoices) — no DB CHECK
    constraint exists yet on the Django side (audit §3); FastAPI adds one (ADR, additive)."""

    DRAFT = "DRAFT"
    SCORED = "SCORED"
    COMMITTED = "COMMITTED"
    UNDER_REVIEW = "UNDER_REVIEW"
    REVIEWED = "REVIEWED"
    ARCHIVED = "ARCHIVED"

    ALL = (DRAFT, SCORED, COMMITTED, UNDER_REVIEW, REVIEWED, ARCHIVED)


class CriterionDirection:
    BENEFIT = "benefit"
    COST = "cost"
    ALL = (BENEFIT, COST)


class Decision(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "decisions_decision"
    __table_args__ = (
        Index("decisions_d_owner_i_60277d_idx", "owner_id", "status"),
        Index("decisions_d_owner_i_70b337_idx", "owner_id", "updated_at"),
        CheckConstraint(f"status IN {DecisionStatus.ALL!r}", name="status_valid"),
    )

    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts_user.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    context: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[str] = mapped_column(String(16), default=DecisionStatus.DRAFT)
    deadline: Mapped[date | None] = mapped_column(Date, nullable=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    alternatives: Mapped[list["Alternative"]] = relationship(
        back_populates="decision", cascade="all, delete-orphan", order_by="Alternative.position"
    )
    criteria: Mapped[list["Criterion"]] = relationship(
        back_populates="decision", cascade="all, delete-orphan", order_by="Criterion.position"
    )


class Alternative(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "decisions_alternative"
    __table_args__ = (
        UniqueConstraint("decision_id", "name", name="unique_alternative_name"),
        Index("decisions_a_decisio_e59a21_idx", "decision_id", "position"),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(default=0)

    decision: Mapped[Decision] = relationship(back_populates="alternatives")
    scores: Mapped[list["AlternativeScore"]] = relationship(
        back_populates="alternative", cascade="all, delete-orphan"
    )


class Criterion(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "decisions_criterion"
    __table_args__ = (
        UniqueConstraint("decision_id", "name", name="unique_criterion_name"),
        CheckConstraint("weight > 0", name="criterion_weight_positive"),
        CheckConstraint(f"direction IN {CriterionDirection.ALL!r}", name="direction_valid"),
        Index("decisions_c_decisio_3a0642_idx", "decision_id", "is_active"),
    )

    decision_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_decision.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    weight: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    direction: Mapped[str] = mapped_column(String(8), nullable=False)
    is_active: Mapped[bool] = mapped_column(default=True)
    position: Mapped[int] = mapped_column(default=0)

    decision: Mapped[Decision] = relationship(back_populates="criteria")
    scores: Mapped[list["AlternativeScore"]] = relationship(
        back_populates="criterion", cascade="all, delete-orphan"
    )


class AlternativeScore(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "decisions_alternativescore"
    __table_args__ = (
        UniqueConstraint("alternative_id", "criterion_id", name="unique_score_cell"),
        CheckConstraint("score >= 1 AND score <= 10", name="score_within_configured_range"),
    )

    alternative_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("decisions_alternative.id", ondelete="CASCADE"),
        nullable=False,
    )
    criterion_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("decisions_criterion.id", ondelete="CASCADE"), nullable=False
    )
    score: Mapped[Decimal] = mapped_column(Numeric(6, 3), nullable=False)
    rationale: Mapped[str] = mapped_column(Text, default="")

    alternative: Mapped[Alternative] = relationship(back_populates="scores")
    criterion: Mapped[Criterion] = relationship(back_populates="scores")
