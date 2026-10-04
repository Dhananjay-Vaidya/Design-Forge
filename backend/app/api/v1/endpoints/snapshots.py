"""
API-25/26 plus FX-04 — immutable versions of a decision, and a read-only diff between any two.

    POST /decisions/{id}/snapshots            save the decision as it is now ("Save version")
    GET  /decisions/{id}/snapshots            list versions, newest first
    GET  /snapshots/{sid}                     one version in full
    GET  /decisions/{id}/snapshots/compare    ?a=<version>&b=<version|current>

Snapshots are insert-only (BR-007): there is deliberately no update or delete endpoint.
"""

import uuid

from fastapi import APIRouter, Query, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.snapshots import (
    SnapshotCreateRequest,
    SnapshotDiff,
    SnapshotRead,
    SnapshotSummary,
)
from app.services import decision_service, snapshot_service

router = APIRouter(tags=["snapshots"])


@router.post(
    "/decisions/{decision_id}/snapshots",
    response_model=SnapshotSummary,
    status_code=status.HTTP_201_CREATED,
)
async def save_version(
    decision_id: uuid.UUID,
    payload: SnapshotCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> SnapshotSummary:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    row = await snapshot_service.create_snapshot(db, decision, label=payload.label)
    return snapshot_service.to_summary(row)


@router.get("/decisions/{decision_id}/snapshots", response_model=list[SnapshotSummary])
async def list_versions(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[SnapshotSummary]:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    rows = await snapshot_service.list_snapshots(db, decision)
    return [snapshot_service.to_summary(r) for r in rows]


@router.get("/decisions/{decision_id}/snapshots/compare", response_model=SnapshotDiff)
async def compare_versions(
    decision_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    a: int = Query(ge=1, description="Earlier version number"),
    b: str = Query(description="Later version number, or 'current' for the live decision"),
) -> SnapshotDiff:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    return await snapshot_service.compare(db, decision, a=a, b=b)


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotRead)
async def get_version(
    snapshot_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> SnapshotRead:
    row = await snapshot_service.get_owned_snapshot_or_404(
        db, snapshot_id=snapshot_id, owner_id=current_user.id
    )
    return SnapshotRead(**snapshot_service.to_summary(row).model_dump(), payload=row.snapshot_json)
