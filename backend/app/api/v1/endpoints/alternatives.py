"""API-14..17 — Alternatives CRUD (nested under a decision, then by their own id)."""

import uuid

from fastapi import APIRouter, status

from app.api import pagination
from app.api.dependencies import CurrentUser, DbSession
from app.repositories import decision_repository
from app.schemas.decision import AlternativeCreateRequest, AlternativePatchRequest, AlternativeRead
from app.services import decision_service

router = APIRouter(tags=["alternatives"])


@router.get("/decisions/{decision_id}/alternatives")
async def list_alternatives(
    decision_id: uuid.UUID,
    current_user: CurrentUser,
    db: DbSession,
    page: str | None = None,
    page_size: str | None = None,
) -> dict:
    page_number, size = pagination.resolve_page_params(page, page_size)
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    items = await decision_repository.list_alternatives(db, decision_id=decision.id)
    return pagination.paginate_list(
        [AlternativeRead.model_validate(a) for a in items], page_number, size
    )


@router.post(
    "/decisions/{decision_id}/alternatives",
    response_model=AlternativeRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_alternative(
    decision_id: uuid.UUID,
    payload: AlternativeCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AlternativeRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    alternative = await decision_service.create_alternative(
        db, decision, name=payload.name, description=payload.description, position=payload.position
    )
    return AlternativeRead.model_validate(alternative)


@router.patch("/alternatives/{alternative_id}", response_model=AlternativeRead)
async def patch_alternative(
    alternative_id: uuid.UUID,
    payload: AlternativePatchRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> AlternativeRead:
    alternative = await decision_service.get_owned_alternative_or_404(
        db, alternative_id=alternative_id, owner_id=current_user.id
    )
    updated = await decision_service.patch_alternative(
        db, alternative, **payload.model_dump(exclude_unset=True)
    )
    return AlternativeRead.model_validate(updated)


@router.delete("/alternatives/{alternative_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alternative(
    alternative_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> None:
    alternative = await decision_service.get_owned_alternative_or_404(
        db, alternative_id=alternative_id, owner_id=current_user.id
    )
    await decision_service.delete_alternative(db, alternative)
