"""
Snapshots and version comparison (FX-04, BR-007). Snapshots are insert-only: nothing here updates
or deletes one. Version numbers are assigned under a row lock on the decision, so two simultaneous
saves can never produce the same version.
"""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationAppError
from app.domain import diff, snapshot
from app.domain.scoring import engine
from app.models.decision import Decision
from app.models.snapshot import DecisionSnapshot, SnapshotReason
from app.observability import metrics
from app.repositories import decision_repository
from app.schemas.snapshots import SnapshotDiff, SnapshotRef, SnapshotSummary
from app.services import decision_service

MAX_SNAPSHOTS_PER_DECISION = 100


async def build_live_payload(db: AsyncSession, decision: Decision) -> dict[str, Any]:
    """The decision as it is right now, in snapshot form (also used as the 'current' side of a diff)."""
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    scores = await decision_repository.list_scores(db, decision_id=decision.id)
    try:
        ranking: engine.RankingResult | None = await decision_service.calculate_ranking(
            db, decision
        )
    except engine.ScoringError:
        ranking = None
    return snapshot.build_payload(
        decision={
            "title": decision.title,
            "context": decision.context,
            "category": decision.category,
            "deadline": decision.deadline.isoformat() if decision.deadline else None,
        },
        alternatives=[
            {"id": str(a.id), "name": a.name, "description": a.description, "position": a.position}
            for a in alternatives
        ],
        criteria=[
            {
                "id": str(c.id),
                "name": c.name,
                "weight": c.weight,
                "direction": c.direction,
                "is_active": c.is_active,
                "position": c.position,
            }
            for c in criteria
        ],
        scores=[
            {
                "alternative_id": str(s.alternative_id),
                "criterion_id": str(s.criterion_id),
                "score": s.score,
            }
            for s in scores
        ],
        ranking=ranking,
    )


def to_summary(row: DecisionSnapshot) -> SnapshotSummary:
    ranking = row.snapshot_json.get("ranking")
    leader = ranking["order"][0] if ranking else None
    return SnapshotSummary(
        id=row.id,
        version=row.version,
        reason=row.reason,  # type: ignore[arg-type]
        label=row.label or "",
        created_at=row.created_at,
        complete=ranking is not None,
        leader=leader["name"] if leader else None,
        leader_points=float(leader["points"]) if leader else None,
    )


async def create_snapshot(
    db: AsyncSession,
    decision: Decision,
    *,
    reason: str = SnapshotReason.MANUAL,
    label: str = "",
    commit: bool = True,
) -> DecisionSnapshot:
    """`commit=False` only flushes, so the caller can make the snapshot part of a larger transaction
    (and is then responsible for committing and for recording the snapshot metric)."""
    # Serialise version assignment per decision.
    await db.execute(select(Decision.id).where(Decision.id == decision.id).with_for_update())
    count, latest = (
        await db.execute(
            select(func.count(), func.coalesce(func.max(DecisionSnapshot.version), 0)).where(
                DecisionSnapshot.decision_id == decision.id
            )
        )
    ).one()
    if count >= MAX_SNAPSHOTS_PER_DECISION:
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"label": [f"A decision can keep up to {MAX_SNAPSHOTS_PER_DECISION} versions."]},
        )
    row = DecisionSnapshot(
        decision_id=decision.id,
        version=latest + 1,
        reason=reason,
        label=label.strip(),
        snapshot_json=await build_live_payload(db, decision),
    )
    db.add(row)
    await db.flush()
    if commit:
        await db.commit()
        await db.refresh(row)
        metrics.record_snapshot_created(reason)
    return row


async def list_snapshots(db: AsyncSession, decision: Decision) -> list[DecisionSnapshot]:
    rows = await db.execute(
        select(DecisionSnapshot)
        .where(DecisionSnapshot.decision_id == decision.id)
        .order_by(DecisionSnapshot.version.desc())
    )
    return list(rows.scalars())


async def get_owned_snapshot_or_404(
    db: AsyncSession, *, snapshot_id: uuid.UUID, owner_id: uuid.UUID
) -> DecisionSnapshot:
    stmt = (
        select(DecisionSnapshot)
        .join(Decision, DecisionSnapshot.decision_id == Decision.id)
        .where(DecisionSnapshot.id == snapshot_id, Decision.owner_id == owner_id)
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise NotFoundError("Snapshot not found.")
    return row


async def _by_version(db: AsyncSession, decision: Decision, version: int) -> DecisionSnapshot:
    stmt = select(DecisionSnapshot).where(
        DecisionSnapshot.decision_id == decision.id, DecisionSnapshot.version == version
    )
    row = (await db.execute(stmt)).scalar_one_or_none()
    if row is None:
        raise NotFoundError(f"Version {version} does not exist for this decision.")
    return row


def _ref(row: DecisionSnapshot | None) -> SnapshotRef:
    if row is None:
        return SnapshotRef(version=None, label="Current", created_at=None, is_current=True)
    return SnapshotRef(
        version=row.version, label=row.label or "", created_at=row.created_at, is_current=False
    )


async def compare(db: AsyncSession, decision: Decision, *, a: int, b: str) -> SnapshotDiff:
    """`b` is a version number or the literal "current" (the live decision)."""
    first = await _by_version(db, decision, a)
    if b == "current":
        second_row: DecisionSnapshot | None = None
        second_payload = await build_live_payload(db, decision)
    else:
        try:
            version = int(b)
        except ValueError:
            raise ValidationAppError(
                "One or more fields are invalid.",
                fields={"b": ["Use a version number or 'current'."]},
            ) from None
        second_row = await _by_version(db, decision, version)
        second_payload = second_row.snapshot_json
    result = diff.compare(first.snapshot_json, second_payload)
    metrics.record_snapshot_compare()
    return SnapshotDiff(a=_ref(first), b=_ref(second_row), **result)
