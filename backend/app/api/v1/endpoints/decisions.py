"""API-08..12 — Decision CRUD (docs/fastapi-migration-audit.md §16 parity matrix)."""

import uuid

from fastapi import APIRouter, Query, status

from app.api import pagination
from app.api.dependencies import CurrentUser, DbSession
from app.schemas.decision import DecisionCreateRequest, DecisionPatchRequest, DecisionRead
from app.services import decision_service

router = APIRouter(tags=["decisions"])


@router.get("/decisions")
async def list_decisions(
    current_user: CurrentUser,
    db: DbSession,
    # `status` is deliberately unvalidated (an unknown value yields an empty page, as before) and
    # page/page_size follow DRF's lenient rules -- see app/api/pagination.py.
    status_filter: str | None = Query(default=None, alias="status"),
    category: str | None = None,
    ordering: str = "-updated_at",
    page: str | None = None,
    page_size: str | None = None,
) -> dict:
    page_number, size = pagination.resolve_page_params(page, page_size)
    items, total = await decision_service.list_decisions(
        db,
        owner_id=current_user.id,
        status=status_filter,
        category=category,
        ordering=ordering,
        page=page_number,
        page_size=size,
    )
    pagination.ensure_page_exists(page_number, size, total)
    return pagination.envelope(
        [DecisionRead.model_validate(d) for d in items],
        page=page_number,
        page_size=size,
        total=total,
    )


@router.post("/decisions", response_model=DecisionRead, status_code=status.HTTP_201_CREATED)
async def create_decision(
    payload: DecisionCreateRequest, current_user: CurrentUser, db: DbSession
) -> DecisionRead:
    decision = await decision_service.create_decision(
        db,
        owner_id=current_user.id,
        title=payload.title,
        context=payload.context,
        category=payload.category,
        deadline=payload.deadline,
    )
    return DecisionRead.model_validate(decision)


@router.get("/decisions/{decision_id}", response_model=DecisionRead)
async def get_decision(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> DecisionRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    return DecisionRead.model_validate(decision)


@router.patch("/decisions/{decision_id}", response_model=DecisionRead)
async def patch_decision(
    decision_id: uuid.UUID, payload: DecisionPatchRequest, current_user: CurrentUser, db: DbSession
) -> DecisionRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    updated = await decision_service.patch_decision(
        db, decision, **payload.model_dump(exclude_unset=True)
    )
    return DecisionRead.model_validate(updated)


@router.delete("/decisions/{decision_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_decision(decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession) -> None:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    await decision_service.delete_decision(db, decision)
