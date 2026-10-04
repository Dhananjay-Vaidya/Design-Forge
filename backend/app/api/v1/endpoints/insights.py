"""
FX-03 / FX-05 — deterministic insight into a ranking. Everything here is calculated by the same
engine that produces the ranking (teal, "Calculated, not AI"); none of it calls Gemini and none of
it can change a score, weight or ranking.

    GET /decisions/{id}/sensitivity   tornado + the smallest weight/score changes that flip the leader
    GET /decisions/{id}/explanation   plain-language "why this ranks first", from templates
"""

import uuid
from decimal import Decimal

from fastapi import APIRouter

from app.api.dependencies import CurrentUser, DbSession
from app.core.config import get_settings
from app.domain import explain, sensitivity
from app.domain.scoring import engine
from app.observability import metrics
from app.schemas.snapshots import ExplanationResponse, SensitivityResponse
from app.services import decision_service

router = APIRouter(tags=["insights"])
settings = get_settings()


async def _analysis(db, decision):
    alternatives, criteria, scores, names = await decision_service.load_engine_inputs(db, decision)
    scale = {"score_min": Decimal(settings.score_min), "score_max": Decimal(settings.score_max)}
    return alternatives, criteria, scores, names, scale


@router.get("/decisions/{decision_id}/sensitivity", response_model=SensitivityResponse)
async def get_sensitivity(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> SensitivityResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    alternatives, criteria, scores, names, scale = await _analysis(db, decision)
    try:
        report = sensitivity.analyze(alternatives, criteria, scores, names, **scale)
    except engine.ScoringError as exc:
        metrics.record_sensitivity_lab("rejected")
        raise await decision_service.build_ranking_validation_error(db, decision, exc) from exc
    metrics.record_sensitivity_lab("success")
    return SensitivityResponse.model_validate(
        {
            "leader": report.leader,
            "runner_up": report.runner_up,
            "margin_points": report.margin_points,
            "tornado": report.tornado,
            "weight_flips": report.weight_flips,
            "score_flips": report.score_flips,
            "tornado_low_factor": float(sensitivity.TORNADO_LOW),
            "tornado_high_factor": float(sensitivity.TORNADO_HIGH),
        },
        from_attributes=True,
    )


@router.get("/decisions/{decision_id}/explanation", response_model=ExplanationResponse)
async def get_explanation(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> ExplanationResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    alternatives, criteria, scores, names, scale = await _analysis(db, decision)
    try:
        ranking = engine.calculate_ranking(alternatives, criteria, scores, **scale)
        report = sensitivity.analyze(alternatives, criteria, scores, names, **scale)
    except engine.ScoringError as exc:
        metrics.record_explanation("rejected")
        raise await decision_service.build_ranking_validation_error(db, decision, exc) from exc
    metrics.record_explanation("success")
    return ExplanationResponse.model_validate(
        explain.explain(ranking, names, report.weight_flips, report.score_flips),
        from_attributes=True,
    )
