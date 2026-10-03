"""
Templates (FX-01, FX-16) and demo mode (FX-20). Creating from a template runs in ONE transaction
(decision + criteria + options), and everything it produces is an ordinary row, so the
deterministic engine is untouched and unaware of templates.
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import NotFoundError, ValidationAppError
from app.domain import demo, templates
from app.models.decision import AlternativeScore, Decision
from app.models.template import UserTemplate
from app.models.user import User
from app.observability import metrics
from app.repositories import decision_repository
from app.schemas.templates import TemplateCriterionRead, TemplateRead
from app.services import decision_service

MAX_USER_TEMPLATES = 50
MAX_OPTIONS = 20
DEMO_PREF_KEY = "demo_decision_id"


def _validation(field: str, message: str) -> ValidationAppError:
    return ValidationAppError("One or more fields are invalid.", fields={field: [message]})


def _builtin_read(t: templates.TemplateDef) -> TemplateRead:
    return TemplateRead(
        id=f"{templates.BUILTIN_PREFIX}{t.slug}",
        kind="builtin",
        name=t.name,
        description=t.description,
        category=t.category,
        title_hint=t.title_hint,
        criteria=[
            TemplateCriterionRead(
                name=c.name, description=c.description, weight=c.weight, direction=c.direction
            )
            for c in t.criteria
        ],
        option_hints=list(t.option_hints),
    )


def _mine_read(t: UserTemplate) -> TemplateRead:
    return TemplateRead(
        id=str(t.id),
        kind="mine",
        name=t.name,
        description=t.description,
        category=t.category,
        title_hint=t.title_hint,
        criteria=[
            TemplateCriterionRead(
                name=c["name"],
                description=c.get("description", ""),
                weight=Decimal(str(c["weight"])),
                direction=c["direction"],
            )
            for c in t.criteria_json
        ],
        option_hints=[],
    )


async def list_templates(db: AsyncSession, *, owner_id: uuid.UUID) -> list[TemplateRead]:
    mine = (
        (
            await db.execute(
                select(UserTemplate)
                .where(UserTemplate.owner_id == owner_id)
                .order_by(UserTemplate.created_at.desc())
            )
        )
        .scalars()
        .all()
    )
    return [_builtin_read(t) for t in templates.BUILTIN_TEMPLATES] + [_mine_read(t) for t in mine]


async def _owned_template(
    db: AsyncSession, *, owner_id: uuid.UUID, template_id: uuid.UUID
) -> UserTemplate | None:
    stmt = select(UserTemplate).where(
        UserTemplate.id == template_id, UserTemplate.owner_id == owner_id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def save_from_decision(
    db: AsyncSession, *, owner_id: uuid.UUID, decision: Decision, name: str, description: str
) -> TemplateRead:
    """FX-16. Captures the decision's ACTIVE criteria (name, weight, direction); options and
    scores are specific to one decision and are deliberately not templated."""
    name = name.strip()
    if not name:
        raise _validation("name", "Give the template a name.")
    criteria = [
        c
        for c in await decision_repository.list_criteria(db, decision_id=decision.id)
        if c.is_active
    ]
    if not criteria:
        raise _validation(
            "decision_id", "Add at least one active criterion before saving a template."
        )
    count = (
        await db.execute(
            select(func.count()).select_from(UserTemplate).where(UserTemplate.owner_id == owner_id)
        )
    ).scalar_one()
    if count >= MAX_USER_TEMPLATES:
        raise _validation("name", f"You can keep up to {MAX_USER_TEMPLATES} templates.")

    template = UserTemplate(
        owner_id=owner_id,
        name=name,
        description=description.strip(),
        category=decision.category or "",
        title_hint=decision.title[:200],
        criteria_json=[
            {
                "name": c.name,
                "description": c.description or "",
                "weight": format(c.weight.normalize(), "f"),
                "direction": c.direction,
            }
            for c in criteria
        ],
    )
    db.add(template)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        raise _validation("name", "You already have a template with this name.") from None
    await db.commit()
    metrics.record_template_saved()
    return _mine_read(template)


async def delete_template(db: AsyncSession, *, owner_id: uuid.UUID, template_id: str) -> None:
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise NotFoundError("Template not found.") from None
    template = await _owned_template(db, owner_id=owner_id, template_id=tid)
    if template is None:
        raise NotFoundError("Template not found.")
    await db.delete(template)
    await db.commit()


def _clean_options(options: list[str]) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for raw in options:
        name = raw.strip()
        if not name:
            continue
        if len(name) > 200:
            raise _validation("options", "Option names must be 200 characters or fewer.")
        if name.lower() in seen:
            raise _validation("options", f"“{name}” is listed more than once.")
        seen.add(name.lower())
        cleaned.append(name)
    if len(cleaned) > MAX_OPTIONS:
        raise _validation("options", f"Start with at most {MAX_OPTIONS} options.")
    return cleaned


async def _criteria_for(db: AsyncSession, *, owner_id: uuid.UUID, template_id: str):
    """Returns (source, category, [(name, weight, direction, description)]) or raises NotFound."""
    builtin = templates.get_builtin(template_id)
    if builtin is not None:
        return (
            "builtin",
            builtin.category,
            [(c.name, c.weight, c.direction, c.description) for c in builtin.criteria],
        )
    try:
        tid = uuid.UUID(template_id)
    except ValueError:
        raise NotFoundError("Template not found.") from None
    mine = await _owned_template(db, owner_id=owner_id, template_id=tid)
    if mine is None:
        raise NotFoundError("Template not found.")
    return (
        "mine",
        mine.category,
        [
            (c["name"], Decimal(str(c["weight"])), c["direction"], c.get("description", ""))
            for c in mine.criteria_json
        ],
    )


async def create_from_template(
    db: AsyncSession,
    *,
    owner_id: uuid.UUID,
    template_id: str,
    title: str,
    context: str,
    category: str | None,
    deadline: date | None,
    options: list[str],
    source_override: str | None = None,
) -> Decision:
    title = title.strip()
    if not title:
        raise _validation("title", "Give the decision a title.")
    option_names = _clean_options(options)
    source, template_category, criteria = await _criteria_for(
        db, owner_id=owner_id, template_id=template_id
    )

    decision = await decision_repository.create_decision(
        db,
        owner_id=owner_id,
        title=title,
        context=context.strip(),
        category=(category.strip() if category is not None else template_category)[:64],
        deadline=deadline,
    )
    for position, (name, weight, direction, description) in enumerate(criteria):
        await decision_repository.create_criterion(
            db,
            decision_id=decision.id,
            name=name,
            weight=weight,
            direction=direction,
            description=description,
            is_active=True,
            position=position,
        )
    for position, name in enumerate(option_names):
        await decision_repository.create_alternative(
            db, decision_id=decision.id, name=name, description="", position=position
        )
    await db.commit()
    await db.refresh(decision)
    metrics.record_decision_created()
    metrics.record_decision_from_template(source_override or source)
    return decision


# ---- demo mode (FX-20) -------------------------------------------------------------------------


async def get_demo_decision_id(db: AsyncSession, *, user: User) -> uuid.UUID | None:
    raw = (user.profile.preferences or {}).get(DEMO_PREF_KEY)
    try:
        decision_id = uuid.UUID(str(raw))
    except (ValueError, TypeError):
        return None
    decision = await decision_repository.get_owned_decision(
        db, decision_id=decision_id, owner_id=user.id
    )
    return decision.id if decision else None


async def create_or_reset_demo(db: AsyncSession, *, user: User) -> Decision:
    """Deletes the user's previous sample (if it still exists) and builds a fresh, fully scored one."""
    existing_id = await get_demo_decision_id(db, user=user)
    if existing_id is not None:
        existing = await decision_repository.get_owned_decision(
            db, decision_id=existing_id, owner_id=user.id
        )
        if existing is not None:
            await decision_repository.delete_decision(db, existing)
            await db.flush()

    decision = await create_from_template(
        db,
        owner_id=user.id,
        template_id=demo.TEMPLATE_ID,
        title=demo.TITLE,
        context=demo.CONTEXT,
        category=demo.CATEGORY,
        deadline=None,
        options=[name for name, _desc, _scores in demo.OPTIONS],
        source_override="demo",
    )
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    by_name = {a.name: a for a in alternatives}
    for name, description, scores in demo.OPTIONS:
        alt = by_name[name]
        alt.description = description
        for criterion, score in zip(criteria, scores, strict=True):
            db.add(
                AlternativeScore(
                    alternative_id=alt.id,
                    criterion_id=criterion.id,
                    score=Decimal(score),
                    rationale="",
                )
            )
    await db.flush()
    await decision_service.refresh_status(db, decision)

    prefs = dict(user.profile.preferences or {})
    prefs[DEMO_PREF_KEY] = str(decision.id)
    user.profile.preferences = prefs
    await db.commit()
    await db.refresh(decision)
    return decision
