"""Data access for Decision/Alternative/Criterion/AlternativeScore (Step 6)."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.decision import Alternative, AlternativeScore, Criterion, Decision

ALLOWED_ORDERING = {
    "updated_at",
    "-updated_at",
    "created_at",
    "-created_at",
    "title",
    "-title",
    "deadline",
    "-deadline",
}


def _apply_ordering(stmt, ordering: str):
    column_name = ordering.lstrip("-")
    column = getattr(Decision, column_name)
    return stmt.order_by(column.desc() if ordering.startswith("-") else column.asc())


async def list_decisions(
    db: AsyncSession,
    *,
    owner_id: uuid.UUID,
    status: str | None,
    category: str | None,
    ordering: str,
    page: int,
    page_size: int,
) -> tuple[list[Decision], int]:
    stmt = select(Decision).where(Decision.owner_id == owner_id)
    if status:
        stmt = stmt.where(Decision.status == status)
    if category:
        stmt = stmt.where(Decision.category == category)
    stmt = _apply_ordering(stmt, ordering)

    count_stmt = select(func.count()).select_from(Decision).where(Decision.owner_id == owner_id)
    if status:
        count_stmt = count_stmt.where(Decision.status == status)
    if category:
        count_stmt = count_stmt.where(Decision.category == category)
    total = (await db.execute(count_stmt)).scalar_one()

    stmt = stmt.offset((page - 1) * page_size).limit(page_size)
    results = list((await db.execute(stmt)).scalars().all())
    return results, total


async def get_owned_decision(
    db: AsyncSession, *, decision_id: uuid.UUID, owner_id: uuid.UUID
) -> Decision | None:
    stmt = select(Decision).where(Decision.id == decision_id, Decision.owner_id == owner_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def create_decision(db: AsyncSession, *, owner_id: uuid.UUID, **fields) -> Decision:
    decision = Decision(owner_id=owner_id, **fields)
    db.add(decision)
    await db.flush()
    return decision


async def delete_decision(db: AsyncSession, decision: Decision) -> None:
    await db.delete(decision)


async def get_owned_alternative(
    db: AsyncSession, *, alternative_id: uuid.UUID, owner_id: uuid.UUID
) -> Alternative | None:
    stmt = (
        select(Alternative)
        .join(Decision, Alternative.decision_id == Decision.id)
        .where(Alternative.id == alternative_id, Decision.owner_id == owner_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def alternative_name_exists(db: AsyncSession, *, decision_id: uuid.UUID, name: str) -> bool:
    stmt = select(Alternative.id).where(
        Alternative.decision_id == decision_id, Alternative.name == name
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def create_alternative(db: AsyncSession, *, decision_id: uuid.UUID, **fields) -> Alternative:
    alternative = Alternative(decision_id=decision_id, **fields)
    db.add(alternative)
    await db.flush()
    return alternative


async def delete_alternative(db: AsyncSession, alternative: Alternative) -> None:
    await db.delete(alternative)


async def get_owned_criterion(
    db: AsyncSession, *, criterion_id: uuid.UUID, owner_id: uuid.UUID
) -> Criterion | None:
    stmt = (
        select(Criterion)
        .join(Decision, Criterion.decision_id == Decision.id)
        .where(Criterion.id == criterion_id, Decision.owner_id == owner_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def criterion_name_exists(db: AsyncSession, *, decision_id: uuid.UUID, name: str) -> bool:
    stmt = select(Criterion.id).where(Criterion.decision_id == decision_id, Criterion.name == name)
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def create_criterion(db: AsyncSession, *, decision_id: uuid.UUID, **fields) -> Criterion:
    criterion = Criterion(decision_id=decision_id, **fields)
    db.add(criterion)
    await db.flush()
    return criterion


async def delete_criterion(db: AsyncSession, criterion: Criterion) -> None:
    await db.delete(criterion)


async def list_alternatives(db: AsyncSession, *, decision_id: uuid.UUID) -> list[Alternative]:
    stmt = (
        select(Alternative)
        .where(Alternative.decision_id == decision_id)
        .order_by(Alternative.position, Alternative.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_criteria(db: AsyncSession, *, decision_id: uuid.UUID) -> list[Criterion]:
    stmt = (
        select(Criterion)
        .where(Criterion.decision_id == decision_id)
        .order_by(Criterion.position, Criterion.created_at)
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_scores(db: AsyncSession, *, decision_id: uuid.UUID) -> list[AlternativeScore]:
    stmt = (
        select(AlternativeScore)
        .join(Alternative, AlternativeScore.alternative_id == Alternative.id)
        .where(Alternative.decision_id == decision_id)
        .options(
            selectinload(AlternativeScore.alternative), selectinload(AlternativeScore.criterion)
        )
    )
    return list((await db.execute(stmt)).scalars().all())


async def upsert_score(
    db: AsyncSession, *, alternative_id: uuid.UUID, criterion_id: uuid.UUID, score, rationale: str
) -> None:
    stmt = select(AlternativeScore).where(
        AlternativeScore.alternative_id == alternative_id,
        AlternativeScore.criterion_id == criterion_id,
    )
    existing = (await db.execute(stmt)).scalar_one_or_none()
    if existing:
        existing.score = score
        existing.rationale = rationale
    else:
        db.add(
            AlternativeScore(
                alternative_id=alternative_id,
                criterion_id=criterion_id,
                score=score,
                rationale=rationale,
            )
        )
    await db.flush()
