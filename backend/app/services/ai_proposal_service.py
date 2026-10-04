"""
Accepting and rejecting AI proposals (doc 18 §1). This is the ONLY place AI output becomes data, and
only because a person asked for that specific item:

    accept(item) -> action.apply_item -> the ordinary service call (validation, status refresh,
    metrics, ownership all as usual) -> the item is marked accepted with a reference to what it
    created. The proposal row keeps the prompt version and model, which is the audit trail behind
    "this criterion came from an AI suggestion".

Items are independent: each is applied and committed on its own, a failing one is recorded as
`failed` with the reason and does not stop the rest.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import actions
from app.core.exceptions import AppError, NotFoundError, ValidationAppError
from app.models.ai_proposal import AIProposal, ProposalStatus
from app.models.decision import Decision
from app.observability import metrics


def _invalid(field: str, message: str) -> ValidationAppError:
    return ValidationAppError("One or more fields are invalid.", fields={field: [message]})


async def get_owned_proposal_or_404(
    db: AsyncSession, *, proposal_id: uuid.UUID, owner_id: uuid.UUID
) -> tuple[AIProposal, Decision]:
    row = (
        await db.execute(
            select(AIProposal, Decision)
            .join(Decision, AIProposal.decision_id == Decision.id)
            .where(AIProposal.id == proposal_id, Decision.owner_id == owner_id)
        )
    ).first()
    if row is None:
        raise NotFoundError("Proposal not found.")
    proposal, decision = row[0], row[1]
    await _expire_if_stale(db, proposal)
    return proposal, decision


async def _expire_if_stale(db: AsyncSession, proposal: AIProposal) -> None:
    if proposal.status == ProposalStatus.READY and proposal.expires_at <= datetime.now(UTC):
        proposal.status = ProposalStatus.EXPIRED
        proposal.resolved_at = datetime.now(UTC)
        await db.commit()
        await db.refresh(proposal)
        metrics.record_ai_proposal(proposal.action, "expired")


async def list_for_decision(
    db: AsyncSession, decision: Decision, *, limit: int = 50
) -> list[AIProposal]:
    rows = (
        (
            await db.execute(
                select(AIProposal)
                .where(AIProposal.decision_id == decision.id)
                .order_by(AIProposal.created_at.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    for proposal in rows:
        await _expire_if_stale(db, proposal)
    return list(rows)


def _reason(exc: AppError) -> str:
    """The most specific message the service gave (a field error beats the generic summary)."""
    if exc.fields:
        for messages in exc.fields.values():
            if messages:
                return messages[0]
    return exc.message


def _items(proposal: AIProposal) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in proposal.payload_json.get("items", [])}


def _pending(proposal: AIProposal) -> list[str]:
    return [i for i in _items(proposal) if i not in proposal.resolution_json]


def _require_open(proposal: AIProposal) -> None:
    if proposal.status != ProposalStatus.READY:
        raise _invalid("status", f"This suggestion is {proposal.status.lower()}.")


def _finalise(proposal: AIProposal) -> None:
    """When nothing is left to decide, close the proposal."""
    if proposal.kind == "proposal" and _pending(proposal):
        return
    outcomes = {r["status"] for r in proposal.resolution_json.values()}
    proposal.status = ProposalStatus.ACCEPTED if "accepted" in outcomes else ProposalStatus.REJECTED
    proposal.resolved_at = datetime.now(UTC)
    metrics.record_ai_proposal(
        proposal.action, "accepted" if proposal.status == ProposalStatus.ACCEPTED else "rejected"
    )


def _check_ids(proposal: AIProposal, item_ids: list[str]) -> None:
    known = _items(proposal)
    for item_id in item_ids:
        if item_id not in known:
            raise _invalid("item_ids", f"Unknown item {item_id}.")
        if item_id in proposal.resolution_json:
            raise _invalid("item_ids", f"Item {item_id} was already decided.")


async def accept(
    db: AsyncSession, proposal: AIProposal, decision: Decision, item_ids: list[str]
) -> AIProposal:
    _require_open(proposal)
    action = actions.get(proposal.action)
    if proposal.kind != "proposal" or action is None or action.apply_item is None:
        raise _invalid("status", "This is advisory only; there is nothing to accept.")
    _check_ids(proposal, list(dict.fromkeys(item_ids)))

    items = _items(proposal)
    resolution = dict(proposal.resolution_json)
    accepted = failed = 0
    for item_id in dict.fromkeys(item_ids):
        now = datetime.now(UTC).isoformat()
        try:
            created = await action.apply_item(db, decision, items[item_id])
        except AppError as exc:
            await db.rollback()
            # A rollback expires everything loaded in this session; reload what the next items
            # and the final bookkeeping still need.
            await db.refresh(proposal)
            await db.refresh(decision)
            resolution[item_id] = {"status": "failed", "at": now, "message": _reason(exc)}
            failed += 1
        else:
            resolution[item_id] = {"status": "accepted", "at": now, "created": created}
            accepted += 1
    proposal.resolution_json = resolution
    _finalise(proposal)
    await db.commit()
    await db.refresh(proposal)
    metrics.record_ai_proposal_item(proposal.action, "accepted", accepted)
    metrics.record_ai_proposal_item(proposal.action, "failed", failed)
    return proposal


async def reject(db: AsyncSession, proposal: AIProposal, item_ids: list[str] | None) -> AIProposal:
    _require_open(proposal)
    ids = list(dict.fromkeys(item_ids)) if item_ids else _pending(proposal)
    if proposal.kind == "proposal":
        _check_ids(proposal, ids)
    now = datetime.now(UTC).isoformat()
    resolution = dict(proposal.resolution_json)
    for item_id in ids:
        resolution[item_id] = {"status": "rejected", "at": now}
    proposal.resolution_json = resolution
    if proposal.kind == "advisory":  # dismissing advisory text closes it
        proposal.status = ProposalStatus.REJECTED
        proposal.resolved_at = datetime.now(UTC)
        metrics.record_ai_proposal(proposal.action, "rejected")
    else:
        _finalise(proposal)
    await db.commit()
    await db.refresh(proposal)
    metrics.record_ai_proposal_item(proposal.action, "rejected", len(ids))
    return proposal
