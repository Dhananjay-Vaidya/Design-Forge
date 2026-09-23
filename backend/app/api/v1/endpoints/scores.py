"""API-22/23 — GET/PUT the score matrix."""

import uuid

from fastapi import APIRouter

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.decision import (
    AlternativeScoreRead,
    MissingCellSchema,
    ScoreUpsertRequest,
    ScoreUpsertResponse,
)
from app.services import decision_service

router = APIRouter(tags=["scores"])


@router.get("/decisions/{decision_id}/scores", response_model=list[AlternativeScoreRead])
async def get_scores(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[AlternativeScoreRead]:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    scores = await decision_service.get_score_matrix(db, decision)
    return [AlternativeScoreRead.model_validate(s) for s in scores]


@router.put("/decisions/{decision_id}/scores", response_model=ScoreUpsertResponse)
async def upsert_scores(
    decision_id: uuid.UUID, payload: ScoreUpsertRequest, current_user: CurrentUser, db: DbSession
) -> ScoreUpsertResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    cells = [cell.model_dump() for cell in payload.scores]
    updated, missing = await decision_service.upsert_scores(db, decision, cells)
    return ScoreUpsertResponse(
        updated=updated,
        missing_cells=[
            MissingCellSchema(alternative_id=m.alternative_id, criterion_id=m.criterion_id)
            for m in missing
        ],
    )
