"""
Adapts ORM rows to/from the pure `apps.scoring.engine` (BR-006 boundary) and owns the small
piece of decision-status bookkeeping (STT-DEC) that follows from scoring completeness.
"""

from decimal import Decimal

from django.conf import settings
from django.db import transaction

from apps.scoring import engine

from .models import AlternativeScore, Criterion, Decision


def _engine_inputs(decision: Decision):
    alternatives = [
        engine.AlternativeInput(id=str(a.id), name=a.name) for a in decision.alternatives.all()
    ]
    criteria = [
        engine.CriterionInput(
            id=str(c.id), weight=c.weight, direction=c.direction, is_active=c.is_active
        )
        for c in decision.criteria.all()
    ]
    scores = [
        engine.ScoreCellInput(
            alternative_id=str(s.alternative_id), criterion_id=str(s.criterion_id), score=s.score
        )
        for s in AlternativeScore.objects.filter(alternative__decision=decision)
    ]
    return alternatives, criteria, scores


def calculate_ranking(decision: Decision) -> engine.RankingResult:
    """UC-07. Raises apps.scoring.engine.ScoringError subclasses on BR-002/003/005 guard failures."""
    alternatives, criteria, scores = _engine_inputs(decision)
    return engine.calculate_ranking(
        alternatives,
        criteria,
        scores,
        score_min=Decimal(settings.SCORE_MIN),
        score_max=Decimal(settings.SCORE_MAX),
    )


def is_decision_scorable(decision: Decision) -> bool:
    """True when ranking preconditions (BR-002/003/005) are currently satisfied."""
    try:
        calculate_ranking(decision)
    except engine.ScoringError:
        return False
    return True


def refresh_decision_status(decision: Decision) -> Decision:
    """
    STT-DEC: DRAFT <-> SCORED toggles automatically with input completeness. Only touches these
    two states -- COMMITTED/UNDER_REVIEW/REVIEWED/ARCHIVED are owned by later-phase transitions
    (commit, outcome review, archive) and are never overwritten here.
    """
    if decision.status not in (Decision.Status.DRAFT, Decision.Status.SCORED):
        return decision
    target = Decision.Status.SCORED if is_decision_scorable(decision) else Decision.Status.DRAFT
    if decision.status != target:
        decision.status = target
        decision.save(update_fields=["status", "updated_at"])
    return decision


@transaction.atomic
def upsert_scores(decision: Decision, cells: list[dict]) -> tuple[int, list[engine.MissingCell]]:
    """
    API-23 PUT /decisions/{id}/scores. `cells` items: {alternative_id, criterion_id, score, rationale?}.
    Upsert is scoped to this decision's own alternatives/criteria (ownership already verified by
    the caller having fetched `decision` via the owned selector).
    """
    valid_alt_ids = set(decision.alternatives.values_list("id", flat=True).distinct())
    valid_crit_ids = set(decision.criteria.values_list("id", flat=True).distinct())

    updated = 0
    for cell in cells:
        if (
            cell["alternative_id"] not in valid_alt_ids
            or cell["criterion_id"] not in valid_crit_ids
        ):
            continue
        AlternativeScore.objects.update_or_create(
            alternative_id=cell["alternative_id"],
            criterion_id=cell["criterion_id"],
            defaults={"score": cell["score"], "rationale": cell.get("rationale", "")},
        )
        updated += 1

    refresh_decision_status(decision)

    active_criteria: list[Criterion] = list(decision.criteria.filter(is_active=True))
    alternatives = [
        engine.AlternativeInput(id=str(a.id), name=a.name) for a in decision.alternatives.all()
    ]
    criteria = [
        engine.CriterionInput(id=str(c.id), weight=c.weight, direction=c.direction)
        for c in active_criteria
    ]
    scores = [
        engine.ScoreCellInput(
            alternative_id=str(s.alternative_id), criterion_id=str(s.criterion_id), score=s.score
        )
        for s in AlternativeScore.objects.filter(alternative__decision=decision)
    ]
    missing = engine.find_missing_cells(alternatives, criteria, scores)
    return updated, missing
