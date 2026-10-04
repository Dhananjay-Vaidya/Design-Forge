"""
Commitments, outcome reviews and calibration data (FX-06; BR-009, BR-010, FR-013/014/016).

Status flow (the user can only set ARCHIVED by hand, everything else happens here):
    SCORED --commit--> COMMITTED --review falls due--> UNDER_REVIEW --submit--> REVIEWED
A committed decision may be re-committed (changing your mind); the earlier commitment stays in
the history, inactive, and its unfinished reviews are cancelled.

Reviews become DUE lazily: whenever the owner's decisions or reviews are read, anything past its
due date is moved forward. There is no background scheduler in this phase (see AC-010 note in
FEATURE_EXPANSION_STATUS.md).
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError, ValidationAppError
from app.domain import calibration
from app.domain.scoring import engine
from app.models.commitment import Commitment, OutcomeReview, OutcomeStatus
from app.models.decision import Alternative, Decision, DecisionStatus
from app.models.snapshot import DecisionSnapshot, SnapshotReason
from app.observability import metrics
from app.schemas.commitments import CommitmentRead
from app.services import decision_service, snapshot_service

MAX_REVIEWS_PER_COMMITMENT = 10
MAX_REVIEW_HORIZON = timedelta(days=365 * 5)
OPEN = (OutcomeStatus.SCHEDULED, OutcomeStatus.DUE)


def _invalid(field: str, message: str) -> ValidationAppError:
    return ValidationAppError("One or more fields are invalid.", fields={field: [message]})


# ---- lazy due-date handling ------------------------------------------------------------------------


async def sync_due(
    db: AsyncSession, *, decision_id: uuid.UUID | None = None, owner_id: uuid.UUID | None = None
) -> None:
    """Move reviews past their due date to DUE, and their COMMITTED decisions to UNDER_REVIEW."""
    scope = Decision.id == decision_id if decision_id else Decision.owner_id == owner_id
    due_ids = (
        (
            await db.execute(
                select(OutcomeReview.id)
                .join(Decision, OutcomeReview.decision_id == Decision.id)
                .where(
                    scope,
                    OutcomeReview.status == OutcomeStatus.SCHEDULED,
                    OutcomeReview.due_at <= datetime.now(UTC),
                )
            )
        )
        .scalars()
        .all()
    )
    if due_ids:
        await db.execute(
            update(OutcomeReview)
            .where(OutcomeReview.id.in_(due_ids))
            .values(status=OutcomeStatus.DUE)
        )
    await db.execute(
        update(Decision)
        .where(
            scope,
            Decision.status == DecisionStatus.COMMITTED,
            Decision.id.in_(
                select(OutcomeReview.decision_id).where(OutcomeReview.status == OutcomeStatus.DUE)
            ),
        )
        .values(status=DecisionStatus.UNDER_REVIEW)
    )
    await db.commit()


# ---- commitments -------------------------------------------------------------------------------


async def _active(db: AsyncSession, decision_id: uuid.UUID) -> Commitment | None:
    return (
        await db.execute(
            select(Commitment).where(
                Commitment.decision_id == decision_id, Commitment.is_active.is_(True)
            )
        )
    ).scalar_one_or_none()


def _read(c: Commitment, alternative_name: str, snapshot_version: int) -> CommitmentRead:
    return CommitmentRead(
        id=c.id,
        decision_id=c.decision_id,
        alternative_id=c.alternative_id,
        alternative_name=alternative_name,
        confidence=c.confidence,
        rationale=c.rationale or "",
        is_active=c.is_active,
        snapshot_version=snapshot_version,
        created_at=c.created_at,
    )


async def commit(
    db: AsyncSession,
    decision: Decision,
    *,
    alternative_id: uuid.UUID,
    confidence: int,
    rationale: str,
) -> CommitmentRead:
    if decision.status not in (DecisionStatus.SCORED, DecisionStatus.COMMITTED):
        reasons = {
            DecisionStatus.DRAFT: "Only a fully scored decision can be committed. "
            "Finish the options, criteria and scores first.",
            DecisionStatus.UNDER_REVIEW: "This decision's review is due. Record how it turned out "
            "instead of changing the commitment.",
            DecisionStatus.REVIEWED: "This decision has been reviewed, so its commitment is final.",
        }
        raise _invalid(
            "status",
            reasons.get(
                decision.status, f"A {decision.status.lower()} decision can't be committed."
            ),
        )
    alt = await db.get(Alternative, alternative_id)
    if alt is None or alt.decision_id != decision.id:
        raise _invalid("alternative_id", "Choose one of this decision's options.")
    try:  # a committed decision may have been edited into an unrankable state since
        await decision_service.calculate_ranking(db, decision)
    except engine.ScoringError as exc:
        raise await decision_service.build_ranking_validation_error(db, decision, exc) from exc

    # Serialise commits on this decision so the one-active rule can't race.
    await db.execute(select(Decision.id).where(Decision.id == decision.id).with_for_update())
    previous = await _active(db, decision.id)
    if previous:
        previous.is_active = False
        await db.execute(
            update(OutcomeReview)
            .where(OutcomeReview.commitment_id == previous.id, OutcomeReview.status.in_(OPEN))
            .values(status=OutcomeStatus.CANCELLED)
        )
        await db.flush()

    snap = await snapshot_service.create_snapshot(
        db,
        decision,
        reason=SnapshotReason.COMMITMENT,
        label=f"Committed: {alt.name}"[:120],
        commit=False,
    )
    row = Commitment(
        decision_id=decision.id,
        alternative_id=alt.id,
        snapshot_id=snap.id,
        confidence=confidence,
        rationale=rationale.strip(),
        is_active=True,
    )
    db.add(row)
    decision.status = DecisionStatus.COMMITTED
    await db.flush()
    await db.commit()
    await db.refresh(row)
    metrics.record_snapshot_created(SnapshotReason.COMMITMENT)
    metrics.record_commitment("changed" if previous else "first")
    return _read(row, alt.name, snap.version)


async def list_commitments(db: AsyncSession, decision: Decision) -> list[CommitmentRead]:
    rows = await db.execute(
        select(Commitment, Alternative.name, DecisionSnapshot.version)
        .join(Alternative, Commitment.alternative_id == Alternative.id)
        .join(DecisionSnapshot, Commitment.snapshot_id == DecisionSnapshot.id)
        .where(Commitment.decision_id == decision.id)
        .order_by(Commitment.created_at.desc())
    )
    return [_read(c, name, version) for c, name, version in rows.all()]


async def ensure_option_not_committed(db: AsyncSession, alternative_id: uuid.UUID) -> None:
    used = (
        await db.execute(select(Commitment.id).where(Commitment.alternative_id == alternative_id))
    ).first()
    if used:
        raise ConflictError(
            "This option was committed to, so it's kept for the decision's history. "
            "You can rename it instead."
        )


# ---- outcome reviews ---------------------------------------------------------------------------


async def list_outcomes(db: AsyncSession, decision: Decision) -> list[OutcomeReview]:
    await sync_due(db, decision_id=decision.id)
    rows = await db.execute(
        select(OutcomeReview)
        .where(OutcomeReview.decision_id == decision.id)
        .order_by(OutcomeReview.due_at.desc(), OutcomeReview.created_at.desc())
    )
    return list(rows.scalars())


async def _require_active_commitment(db: AsyncSession, decision: Decision) -> Commitment:
    active = await _active(db, decision.id)
    if active is None:
        raise _invalid("commitment", "Commit to an option before scheduling or recording a review.")
    return active


async def _settle_decision_status(db: AsyncSession, decision: Decision) -> None:
    """Derive COMMITTED / UNDER_REVIEW / REVIEWED from the reviews, never from the client."""
    if decision.status not in (
        DecisionStatus.COMMITTED,
        DecisionStatus.UNDER_REVIEW,
        DecisionStatus.REVIEWED,
    ):
        return
    statuses = set(
        (
            await db.execute(
                select(OutcomeReview.status).where(OutcomeReview.decision_id == decision.id)
            )
        )
        .scalars()
        .all()
    )
    if OutcomeStatus.SUBMITTED in statuses:
        decision.status = DecisionStatus.REVIEWED
    elif OutcomeStatus.DUE in statuses:
        decision.status = DecisionStatus.UNDER_REVIEW
    else:
        decision.status = DecisionStatus.COMMITTED


async def create_outcome(
    db: AsyncSession,
    decision: Decision,
    *,
    due_at: datetime | None,
    satisfaction: int | None,
    result_notes: str,
) -> OutcomeReview:
    if due_at is None and satisfaction is None:
        raise _invalid("due_at", "Give a review date, a satisfaction rating, or both.")
    commitment = await _require_active_commitment(db, decision)
    count = len(
        (
            await db.execute(
                select(OutcomeReview.id).where(OutcomeReview.commitment_id == commitment.id)
            )
        )
        .scalars()
        .all()
    )
    if count >= MAX_REVIEWS_PER_COMMITMENT:
        raise _invalid(
            "due_at", f"A commitment can have up to {MAX_REVIEWS_PER_COMMITMENT} reviews."
        )
    now = datetime.now(UTC)
    if due_at is not None:
        if due_at.tzinfo is None:
            raise _invalid("due_at", "Include a time zone (for example 2027-01-15T09:00:00Z).")
        if due_at > now + MAX_REVIEW_HORIZON:
            raise _invalid("due_at", "Choose a review date within the next five years.")
    due = due_at or now
    if satisfaction is not None:
        status, submitted = OutcomeStatus.SUBMITTED, now
    else:
        status, submitted = (OutcomeStatus.SCHEDULED if due > now else OutcomeStatus.DUE), None
    row = OutcomeReview(
        decision_id=decision.id,
        commitment_id=commitment.id,
        due_at=due,
        status=status,
        satisfaction=satisfaction,
        result_notes=result_notes.strip(),
        submitted_at=submitted,
    )
    db.add(row)
    await db.flush()
    await _settle_decision_status(db, decision)
    await db.commit()
    await db.refresh(row)
    metrics.record_outcome_review("submitted" if satisfaction is not None else "scheduled")
    return row


async def get_owned_outcome_or_404(
    db: AsyncSession, *, outcome_id: uuid.UUID, owner_id: uuid.UUID
) -> tuple[OutcomeReview, Decision]:
    row = (
        await db.execute(
            select(OutcomeReview, Decision)
            .join(Decision, OutcomeReview.decision_id == Decision.id)
            .where(OutcomeReview.id == outcome_id, Decision.owner_id == owner_id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Outcome review not found.")
    return row[0], row[1]


async def submit_outcome(
    db: AsyncSession,
    review: OutcomeReview,
    decision: Decision,
    *,
    satisfaction: int,
    result_notes: str,
) -> OutcomeReview:
    if review.status not in OPEN:
        raise _invalid("status", f"A {review.status.lower()} review can't be submitted.")
    review.status = OutcomeStatus.SUBMITTED
    review.satisfaction = satisfaction
    review.result_notes = result_notes.strip()
    review.submitted_at = datetime.now(UTC)
    await db.flush()
    await _settle_decision_status(db, decision)
    await db.commit()
    await db.refresh(review)
    metrics.record_outcome_review("submitted")
    return review


async def cancel_outcome(
    db: AsyncSession, review: OutcomeReview, decision: Decision
) -> OutcomeReview:
    if review.status not in OPEN:
        raise _invalid("status", f"A {review.status.lower()} review can't be cancelled.")
    review.status = OutcomeStatus.CANCELLED
    await db.flush()
    await _settle_decision_status(db, decision)
    await db.commit()
    await db.refresh(review)
    metrics.record_outcome_review("cancelled")
    return review


# ---- calibration -------------------------------------------------------------------------------


async def calibration_for(db: AsyncSession, owner_id: uuid.UUID) -> dict:
    """One data point per commitment: its latest submitted review, owner-scoped."""
    rows = await db.execute(
        select(
            Decision.category,
            Commitment.id,
            Commitment.confidence,
            OutcomeReview.satisfaction,
            OutcomeReview.submitted_at,
        )
        .join(Commitment, OutcomeReview.commitment_id == Commitment.id)
        .join(Decision, OutcomeReview.decision_id == Decision.id)
        .where(
            Decision.owner_id == owner_id,
            OutcomeReview.status == OutcomeStatus.SUBMITTED,
            OutcomeReview.satisfaction.is_not(None),
            OutcomeReview.submitted_at.is_not(None),
        )
        .order_by(OutcomeReview.submitted_at.desc())
    )
    latest: dict[uuid.UUID, calibration.Review] = {}
    for category, commitment_id, confidence, satisfaction, submitted_at in rows.all():
        latest.setdefault(
            commitment_id,
            calibration.Review(category or "", confidence, satisfaction, submitted_at),
        )
    return calibration.analyze(list(latest.values()))
