"""
FX-01/FX-16/FX-20 — decision templates and demo mode.

    GET    /templates                    built-in catalogue + the caller's own templates
    POST   /templates                    save one of the caller's decisions as a template
    DELETE /templates/{id}               delete one of the caller's own templates
    POST   /decisions/from-template      create a decision (criteria + optional options) atomically
    GET    /demo                         the caller's sample decision id, if it still exists
    POST   /demo/decision                create (or reset) the sample decision
"""

import uuid

from fastapi import APIRouter, status

from app.api.dependencies import CurrentUser, DbSession
from app.schemas.decision import DecisionRead
from app.schemas.templates import (
    DecisionFromTemplateRequest,
    DemoStatus,
    TemplateCreateRequest,
    TemplateRead,
)
from app.services import decision_service, template_service

router = APIRouter(tags=["templates"])


@router.get("/templates", response_model=list[TemplateRead])
async def list_templates(current_user: CurrentUser, db: DbSession) -> list[TemplateRead]:
    return await template_service.list_templates(db, owner_id=current_user.id)


@router.post("/templates", response_model=TemplateRead, status_code=status.HTTP_201_CREATED)
async def save_template(
    payload: TemplateCreateRequest, current_user: CurrentUser, db: DbSession
) -> TemplateRead:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=payload.decision_id, owner_id=current_user.id
    )
    return await template_service.save_from_decision(
        db,
        owner_id=current_user.id,
        decision=decision,
        name=payload.name,
        description=payload.description,
    )


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(template_id: str, current_user: CurrentUser, db: DbSession) -> None:
    await template_service.delete_template(db, owner_id=current_user.id, template_id=template_id)


@router.post(
    "/decisions/from-template", response_model=DecisionRead, status_code=status.HTTP_201_CREATED
)
async def create_decision_from_template(
    payload: DecisionFromTemplateRequest, current_user: CurrentUser, db: DbSession
) -> DecisionRead:
    decision = await template_service.create_from_template(
        db,
        owner_id=current_user.id,
        template_id=payload.template_id,
        title=payload.title,
        context=payload.context,
        category=payload.category,
        deadline=payload.deadline,
        options=payload.options,
    )
    return DecisionRead.model_validate(decision)


@router.get("/demo", response_model=DemoStatus)
async def demo_status(current_user: CurrentUser, db: DbSession) -> DemoStatus:
    decision_id: uuid.UUID | None = await template_service.get_demo_decision_id(
        db, user=current_user
    )
    return DemoStatus(decision_id=decision_id)


@router.post("/demo/decision", response_model=DecisionRead, status_code=status.HTTP_201_CREATED)
async def create_demo_decision(current_user: CurrentUser, db: DbSession) -> DecisionRead:
    decision = await template_service.create_or_reset_demo(db, user=current_user)
    return DecisionRead.model_validate(decision)
