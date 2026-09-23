"""API-18..21 — Criteria CRUD."""

import uuid

from fastapi import APIRouter, status

from app.api import pagination
from app.api.dependencies import CurrentUser, DbSession
from app.repositories import decision_repository
from app.schemas.decision import CriterionCreateRequest, CriterionPatchRequest, CriterionRead
from app.services import decision_service

router = APIRouter(tags=["criteria"])


@router.get("/decisions/{decision_id}/criteria")
async def list_criteria(
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
    items = await decision_repository.list_criteria(db, decision_id=decision.id)
    return pagination.paginate_list(
        [CriterionRead.model_validate(c) for c in items], page_number, size
    )


@router.post(
    "/decisions/{decision_id}/criteria",
    response_model=CriterionRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_criterion(
    decision_id: uuid.UUID,
    payload: CriterionCreateRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> CriterionRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    criterion = await decision_service.create_criterion(
        db,
        decision,
        name=payload.name,
        weight=payload.weight,
        direction=payload.direction,
        description=payload.description,
        is_active=payload.is_active,
        position=payload.position,
    )
    return CriterionRead.model_validate(criterion)


@router.patch("/criteria/{criterion_id}", response_model=CriterionRead)
async def patch_criterion(
    criterion_id: uuid.UUID,
    payload: CriterionPatchRequest,
    current_user: CurrentUser,
    db: DbSession,
) -> CriterionRead:
    criterion = await decision_service.get_owned_criterion_or_404(
        db, criterion_id=criterion_id, owner_id=current_user.id
    )
    updated = await decision_service.patch_criterion(
        db, criterion, **payload.model_dump(exclude_unset=True)
    )
    return CriterionRead.model_validate(updated)


@router.delete("/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_criterion(
    criterion_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> None:
    criterion = await decision_service.get_owned_criterion_or_404(
        db, criterion_id=criterion_id, owner_id=current_user.id
    )
    await decision_service.delete_criterion(db, criterion)
