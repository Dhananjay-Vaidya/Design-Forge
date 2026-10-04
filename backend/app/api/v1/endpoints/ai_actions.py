"""
AX-INF-1 — the AI-action endpoints. Every capability goes through these; none writes a score, weight
or ranking. AI output is a proposal until a person accepts items from it.

    GET  /ai/actions                       registered capabilities
    POST /decisions/{id}/ai/{action}       run one (201 READY, or 200 FAILED when the answer was unusable)
    GET  /decisions/{id}/ai/proposals      this decision's proposals, newest first
    GET  /ai/proposals/{pid}               one proposal
    POST /ai/proposals/{pid}/accept        {item_ids} -> ordinary deterministic writes, item by item
    POST /ai/proposals/{pid}/reject        {item_ids?} -> discard (all pending when omitted)
"""

import uuid

from fastapi import APIRouter, Response, status

from app.ai import actions, capabilities, runner
from app.api.dependencies import CurrentUser, DbSession
from app.api.v1.endpoints.ai import ChatProviderDep
from app.core.exceptions import NotFoundError
from app.models.ai_proposal import AIProposal
from app.schemas.ai_actions import (
    AcceptRequest,
    ActionInfo,
    ProposalRead,
    RejectRequest,
    RunActionRequest,
    RunActionResponse,
)
from app.services import ai_proposal_service, decision_service

router = APIRouter(tags=["ai-actions"])
capabilities.register_all()  # idempotent: makes sure the shipped capabilities are registered


def _read(p: AIProposal) -> ProposalRead:
    return ProposalRead(
        id=p.id,
        decision_id=p.decision_id,
        action=p.action,
        kind=p.kind,  # type: ignore[arg-type]
        status=p.status,  # type: ignore[arg-type]
        prompt_version=p.prompt_version,
        model=p.model,
        payload=p.payload_json,
        resolution=p.resolution_json or {},
        cache_hit=p.cache_hit,
        created_at=p.created_at,
        expires_at=p.expires_at,
        resolved_at=p.resolved_at,
    )


@router.get("/ai/actions", response_model=list[ActionInfo])
async def list_actions(current_user: CurrentUser) -> list[ActionInfo]:
    return [
        ActionInfo(
            name=a.name,
            title=a.title,
            description=a.description,
            kind=a.kind,
            prompt_version=a.prompt_version,
        )
        for a in actions.all_actions()
    ]


@router.post("/decisions/{decision_id}/ai/{action_name}", response_model=RunActionResponse)
async def run_ai_action(
    decision_id: uuid.UUID,
    action_name: str,
    payload: RunActionRequest,
    response: Response,
    current_user: CurrentUser,
    db: DbSession,
    provider: ChatProviderDep,
) -> RunActionResponse:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    action = actions.get(action_name)
    if action is None:
        raise NotFoundError("Unknown AI action.")
    outcome = await runner.run_action(
        db,
        user_id=current_user.id,
        decision=decision,
        action=action,
        raw_input=payload.input,
        provider=provider,
    )
    response.status_code = (
        status.HTTP_201_CREATED if outcome.status == "READY" else status.HTTP_200_OK
    )
    return RunActionResponse(
        status=outcome.status,  # type: ignore[arg-type]
        proposal=_read(outcome.proposal) if outcome.proposal else None,
        failure_code=outcome.failure_code,
        message=outcome.message,
        remaining_today=outcome.remaining_today,
    )


@router.get("/decisions/{decision_id}/ai/proposals", response_model=list[ProposalRead])
async def list_proposals(
    decision_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> list[ProposalRead]:
    decision = await decision_service.get_owned_decision_or_404(
        db, decision_id=decision_id, owner_id=current_user.id
    )
    return [_read(p) for p in await ai_proposal_service.list_for_decision(db, decision)]


@router.get("/ai/proposals/{proposal_id}", response_model=ProposalRead)
async def get_proposal(
    proposal_id: uuid.UUID, current_user: CurrentUser, db: DbSession
) -> ProposalRead:
    proposal, _ = await ai_proposal_service.get_owned_proposal_or_404(
        db, proposal_id=proposal_id, owner_id=current_user.id
    )
    return _read(proposal)


@router.post("/ai/proposals/{proposal_id}/accept", response_model=ProposalRead)
async def accept_proposal(
    proposal_id: uuid.UUID, payload: AcceptRequest, current_user: CurrentUser, db: DbSession
) -> ProposalRead:
    proposal, decision = await ai_proposal_service.get_owned_proposal_or_404(
        db, proposal_id=proposal_id, owner_id=current_user.id
    )
    return _read(await ai_proposal_service.accept(db, proposal, decision, payload.item_ids))


@router.post("/ai/proposals/{proposal_id}/reject", response_model=ProposalRead)
async def reject_proposal(
    proposal_id: uuid.UUID, payload: RejectRequest, current_user: CurrentUser, db: DbSession
) -> ProposalRead:
    proposal, _ = await ai_proposal_service.get_owned_proposal_or_404(
        db, proposal_id=proposal_id, owner_id=current_user.id
    )
    return _read(await ai_proposal_service.reject(db, proposal, payload.item_ids))
