"""
FX-06 prerequisites and calibration — API-31..34 and API-36.

    POST /decisions/{id}/commit                 record the final choice (one active; re-commit allowed)
    GET  /decisions/{id}/commitments            history, newest first
    POST /decisions/{id}/outcomes               schedule a review and/or record an outcome
    GET  /decisions/{id}/outcomes               reviews (past-due ones are moved to DUE first)
    POST /outcomes/{oid}/submit                 record the outcome of a scheduled review
    POST /outcomes/{oid}/cancel                 cancel an open review
    GET  /dashboard/calibration                 stated confidence vs how decisions worked out

Nothing here calls Gemini; calibration is calculated, not AI.
"""

import uuid

from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, DbSession
from app.observability import metrics
from app.schemas.commitments import (
    CalibrationResponse,
    CommitmentRead,
    CommitRequest,
    OutcomeCreate,
    OutcomeRead,
    OutcomeSubmit,
)
from app.services import commitment_service, decision_service

router = APIRouter(tags=["commitments"])


@router.post(
    "/decisions/{decision_id}/commit",
    response_model=CommitmentRead,
    status_code=status.HTTP_201_CREATED,
)
async def commit_decision(
    decision_id: uuid.UUID, payload: CommitRequest, current_user: CurrentUser, db: DbSession
) -> CommitmentRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    return await commitment_service.commit(
        db,
        decision,
        alternative_id=payload.alternative_id,
        confidence=payload.confidence,
        rationale=payload.rationale,
    )


@router.get("/decisions/{decision_id}/commitments", response_model=list[CommitmentRead])
async def list_commitments(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[CommitmentRead]:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    return await commitment_service.list_commitments(db, decision)


@router.post(
    "/decisions/{decision_id}/outcomes",
    response_model=OutcomeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_outcome(
    decision_id: uuid.UUID, payload: OutcomeCreate, current_user: CurrentUser, db: DbSession
) -> OutcomeRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    row = await commitment_service.create_outcome(
        db,
        decision,
        due_at=payload.due_at,
        satisfaction=payload.satisfaction,
        result_notes=payload.result_notes,
    )
    return OutcomeRead.model_validate(row)


@router.get("/decisions/{decision_id}/outcomes", response_model=list[OutcomeRead])
async def list_outcomes(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[OutcomeRead]:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    rows = await commitment_service.list_outcomes(db, decision)
    return [OutcomeRead.model_validate(r) for r in rows]


@router.post("/outcomes/{outcome_id}/submit", response_model=OutcomeRead)
async def submit_outcome(
    outcome_id: uuid.UUID, payload: OutcomeSubmit, current_user: CurrentUser, db: DbSession
) -> OutcomeRead:
    review, decision = await commitment_service.get_owned_outcome_or_404(
        db, outcome_id=outcome_id, owner_id=current_user.id
    )
    row = await commitment_service.submit_outcome(
        db,
        review,
        decision,
        satisfaction=payload.satisfaction,
        result_notes=payload.result_notes,
    )
    return OutcomeRead.model_validate(row)


@router.post("/outcomes/{outcome_id}/cancel", response_model=OutcomeRead)
async def cancel_outcome(
    outcome_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> OutcomeRead:
    review, decision = await commitment_service.get_owned_outcome_or_404(
        db, outcome_id=outcome_id, owner_id=current_user.id
    )
    row = await commitment_service.cancel_outcome(db, review, decision)
    return OutcomeRead.model_validate(row)


@router.get("/dashboard/calibration", response_model=CalibrationResponse)
async def get_calibration(current_user: CurrentUser, db: DbSession) -> CalibrationResponse:
    data = await commitment_service.calibration_for(db, current_user.id)
    metrics.record_calibration_view()
    return CalibrationResponse.model_validate(data)
