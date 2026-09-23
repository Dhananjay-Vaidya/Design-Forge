"""
Decision/Alternative/Criterion/Score business rules — mirrors apps/decisions/services.py and
apps/decisions/views.py (Django) exactly, including the ORM<->engine boundary that makes BR-006
structural (the pure engine in app/domain/scoring/engine.py never imports SQLAlchemy).
"""

import uuid
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.exceptions import NotFoundError, ValidationAppError
from app.domain.scoring import engine
from app.models.decision import Alternative, Criterion, Decision, DecisionStatus
from app.observability import metrics
from app.repositories import decision_repository

settings = get_settings()


async def get_owned_decision_or_404(
    db: AsyncSession, *, decision_id: uuid.UUID, owner_id: uuid.UUID
) -> Decision:
    decision = await decision_repository.get_owned_decision(
        db, decision_id=decision_id, owner_id=owner_id
    )
    if decision is None:
        raise NotFoundError("The requested decision was not found.")
    return decision


async def get_owned_alternative_or_404(
    db: AsyncSession, *, alternative_id: uuid.UUID, owner_id: uuid.UUID
) -> Alternative:
    alt = await decision_repository.get_owned_alternative(
        db, alternative_id=alternative_id, owner_id=owner_id
    )
    if alt is None:
        raise NotFoundError("The requested alternative was not found.")
    return alt


async def get_owned_criterion_or_404(
    db: AsyncSession, *, criterion_id: uuid.UUID, owner_id: uuid.UUID
) -> Criterion:
    crit = await decision_repository.get_owned_criterion(
        db, criterion_id=criterion_id, owner_id=owner_id
    )
    if crit is None:
        raise NotFoundError("The requested criterion was not found.")
    return crit


async def list_decisions(
    db: AsyncSession,
    *,
    owner_id: uuid.UUID,
    status: str | None,
    category: str | None,
    ordering: str,
    page: int,
    page_size: int,
):
    if ordering not in decision_repository.ALLOWED_ORDERING:
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"ordering": [f"Unknown ordering field '{ordering}'."]},
        )
    return await decision_repository.list_decisions(
        db,
        owner_id=owner_id,
        status=status,
        category=category,
        ordering=ordering,
        page=page,
        page_size=page_size,
    )


async def create_decision(
    db: AsyncSession, *, owner_id: uuid.UUID, title: str, context: str, category: str, deadline
) -> Decision:
    decision = await decision_repository.create_decision(
        db, owner_id=owner_id, title=title, context=context, category=category, deadline=deadline
    )
    await db.commit()
    await db.refresh(decision)
    metrics.record_decision_created()
    return decision


async def patch_decision(db: AsyncSession, decision: Decision, **fields) -> Decision:
    for key, value in fields.items():
        if value is not None:
            setattr(decision, key, value)
    if decision.status == DecisionStatus.ARCHIVED and decision.archived_at is None:
        decision.archived_at = datetime.now(UTC)
    await db.commit()
    await db.refresh(decision)
    return decision


async def delete_decision(db: AsyncSession, decision: Decision) -> None:
    await decision_repository.delete_decision(db, decision)
    await db.commit()


async def create_alternative(
    db: AsyncSession, decision: Decision, *, name: str, description: str, position: int
) -> Alternative:
    if await decision_repository.alternative_name_exists(db, decision_id=decision.id, name=name):
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"name": ["An alternative with this name already exists in this decision."]},
        )
    alternative = await decision_repository.create_alternative(
        db, decision_id=decision.id, name=name, description=description, position=position
    )
    await _refresh_decision_status(db, decision)
    await db.commit()
    await db.refresh(alternative)
    return alternative


async def patch_alternative(db: AsyncSession, alternative: Alternative, **fields) -> Alternative:
    for key, value in fields.items():
        if value is not None:
            setattr(alternative, key, value)
    await db.flush()
    decision = await db.get(Decision, alternative.decision_id)
    if decision:
        await _refresh_decision_status(db, decision)
    await db.commit()
    await db.refresh(alternative)
    return alternative


async def delete_alternative(db: AsyncSession, alternative: Alternative) -> None:
    decision_id = alternative.decision_id
    await decision_repository.delete_alternative(db, alternative)
    await db.flush()
    decision = await db.get(Decision, decision_id)
    if decision:
        await _refresh_decision_status(db, decision)
    await db.commit()


async def create_criterion(
    db: AsyncSession,
    decision: Decision,
    *,
    name: str,
    weight: Decimal,
    direction: str,
    description: str,
    is_active: bool,
    position: int,
) -> Criterion:
    if await decision_repository.criterion_name_exists(db, decision_id=decision.id, name=name):
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"name": ["A criterion with this name already exists in this decision."]},
        )
    criterion = await decision_repository.create_criterion(
        db,
        decision_id=decision.id,
        name=name,
        weight=weight,
        direction=direction,
        description=description,
        is_active=is_active,
        position=position,
    )
    await _refresh_decision_status(db, decision)
    await db.commit()
    await db.refresh(criterion)
    return criterion


async def patch_criterion(db: AsyncSession, criterion: Criterion, **fields) -> Criterion:
    for key, value in fields.items():
        if value is not None:
            setattr(criterion, key, value)
    await db.flush()
    decision = await db.get(Decision, criterion.decision_id)
    if decision:
        await _refresh_decision_status(db, decision)
    await db.commit()
    await db.refresh(criterion)
    return criterion


async def delete_criterion(db: AsyncSession, criterion: Criterion) -> None:
    decision_id = criterion.decision_id
    await decision_repository.delete_criterion(db, criterion)
    await db.flush()
    decision = await db.get(Decision, decision_id)
    if decision:
        await _refresh_decision_status(db, decision)
    await db.commit()


async def get_score_matrix(db: AsyncSession, decision: Decision):
    return await decision_repository.list_scores(db, decision_id=decision.id)


async def upsert_scores(
    db: AsyncSession, decision: Decision, cells: list[dict]
) -> tuple[int, list[engine.MissingCell]]:
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    valid_alt_ids = {a.id for a in alternatives}
    valid_crit_ids = {c.id for c in criteria}

    updated = 0
    for cell in cells:
        if (
            cell["alternative_id"] not in valid_alt_ids
            or cell["criterion_id"] not in valid_crit_ids
        ):
            continue
        await decision_repository.upsert_score(
            db,
            alternative_id=cell["alternative_id"],
            criterion_id=cell["criterion_id"],
            score=cell["score"],
            rationale=cell.get("rationale", ""),
        )
        updated += 1

    await _refresh_decision_status(db, decision)
    await db.commit()

    active_criteria = [c for c in criteria if c.is_active]
    scores = await decision_repository.list_scores(db, decision_id=decision.id)
    missing = engine.find_missing_cells(
        [engine.AlternativeInput(id=str(a.id), name=a.name) for a in alternatives],
        [
            engine.CriterionInput(id=str(c.id), weight=c.weight, direction=c.direction)
            for c in active_criteria
        ],
        [
            engine.ScoreCellInput(
                alternative_id=str(s.alternative_id),
                criterion_id=str(s.criterion_id),
                score=s.score,
            )
            for s in scores
        ],
    )
    return updated, missing


def _engine_inputs(alternatives: list[Alternative], criteria: list[Criterion], scores) -> tuple:
    return (
        [engine.AlternativeInput(id=str(a.id), name=a.name) for a in alternatives],
        [
            engine.CriterionInput(
                id=str(c.id), weight=c.weight, direction=c.direction, is_active=c.is_active
            )
            for c in criteria
        ],
        [
            engine.ScoreCellInput(
                alternative_id=str(s.alternative_id),
                criterion_id=str(s.criterion_id),
                score=s.score,
            )
            for s in scores
        ],
    )


async def _is_decision_scorable(db: AsyncSession, decision: Decision) -> bool:
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    scores = await decision_repository.list_scores(db, decision_id=decision.id)
    alt_in, crit_in, score_in = _engine_inputs(alternatives, criteria, scores)
    try:
        engine.calculate_ranking(
            alt_in,
            crit_in,
            score_in,
            score_min=Decimal(settings.score_min),
            score_max=Decimal(settings.score_max),
        )
    except engine.ScoringError:
        return False
    return True


async def _refresh_decision_status(db: AsyncSession, decision: Decision) -> None:
    """STT-DEC: DRAFT <-> SCORED toggles with input completeness (mirrors Django services.py)."""
    if decision.status not in (DecisionStatus.DRAFT, DecisionStatus.SCORED):
        return
    target = (
        DecisionStatus.SCORED if await _is_decision_scorable(db, decision) else DecisionStatus.DRAFT
    )
    if decision.status != target:
        decision.status = target
        await db.flush()


async def calculate_ranking(db: AsyncSession, decision: Decision) -> engine.RankingResult:
    """UC-07. Raises engine.ScoringError subclasses on BR-002/003/005 guard failures."""
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    scores = await decision_repository.list_scores(db, decision_id=decision.id)
    alt_in, crit_in, score_in = _engine_inputs(alternatives, criteria, scores)
    result = engine.calculate_ranking(
        alt_in,
        crit_in,
        score_in,
        score_min=Decimal(settings.score_min),
        score_max=Decimal(settings.score_max),
    )
    return result


async def build_ranking_validation_error(
    db: AsyncSession, decision: Decision, exc: Exception
) -> ValidationAppError:
    if isinstance(exc, engine.InsufficientAlternativesError):
        return ValidationAppError(
            "One or more fields are invalid.",
            fields={"alternatives": ["At least two alternatives are required."]},
        )
    if isinstance(exc, engine.NoActiveCriteriaError):
        return ValidationAppError(
            "One or more fields are invalid.",
            fields={"criteria": ["At least one active criterion is required."]},
        )
    if isinstance(exc, engine.MissingScoresError):
        alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
        criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
        alt_names = {str(a.id): a.name for a in alternatives}
        crit_names = {str(c.id): c.name for c in criteria}
        messages = [
            f"Missing score for alternative '{alt_names.get(m.alternative_id, m.alternative_id)}' "
            f"on criterion '{crit_names.get(m.criterion_id, m.criterion_id)}'."
            for m in exc.missing
        ]
        return ValidationAppError("One or more fields are invalid.", fields={"scores": messages})
    raise exc
