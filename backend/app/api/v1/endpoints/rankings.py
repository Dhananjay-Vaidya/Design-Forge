"""API-24 — GET /decisions/{id}/ranking. UC-07, AC-002/003/004."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter

from app.api.dependencies import CurrentUser, DbSession
from app.domain.scoring import engine
from app.observability import metrics
from app.schemas.decision import RankedAlternativeSchema, RankingResponse, SensitivitySchema
from app.services import decision_service

router = APIRouter(tags=["ranking"])


@router.get("/decisions/{decision_id}/ranking", response_model=RankingResponse)
async def get_ranking(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> RankingResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )

    with metrics.ranking_timer():
        try:
            result = await decision_service.calculate_ranking(db, decision)
        except engine.ScoringError as exc:
            raise await decision_service.build_ranking_validation_error(db, decision, exc) from exc

    metrics.record_sensitivity("success")  # sensitivity is computed inside every ranking

    return RankingResponse(
        decision_id=str(decision.id),
        deterministic=True,
        computed_at=datetime.now(UTC),
        calculation_method=result.calculation_method,
        weights_normalized=result.weights_normalized,
        ranking=[
            RankedAlternativeSchema(
                rank=r.rank,
                alternative_id=r.alternative_id,
                name=r.name,
                total=r.total,
                breakdown=r.breakdown,
            )
            for r in result.ranking
        ],
        sensitivity=SensitivitySchema(
            leader_stable=result.sensitivity.leader_stable,
            note=result.sensitivity.note,
            margin=result.sensitivity.margin,
        ),
    )
