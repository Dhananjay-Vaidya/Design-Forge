"""
AX-22 handoff — turn a home-page draft into a real decision once the visitor has an account.

The scaffold arrives from the browser (the visitor may have added or removed items), together with
the signed draft token issued when the AI drafted it. Everything is created in ONE transaction with
the ordinary repository writes: a decision, its options and its criteria (equal weights, no scores),
owned by the signed-in person. Nothing here comes from the model at this point; the token only tells
us which items it suggested, and that provenance is recorded as an accepted `ai_proposals` row so the
decision's AI history shows "drafted on the home page".

The token is single-use (claimed in Redis) and short-lived. An invalid, expired or reused token is a
400; the frontend then falls back to an empty new decision.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import public_drafter, public_guard
from app.core.exceptions import ValidationAppError
from app.models.ai_proposal import AIProposal, ProposalStatus
from app.models.decision import Decision
from app.observability import metrics
from app.repositories import decision_repository
from app.schemas.guide import ScaffoldIn
from app.services import decision_service

EQUAL_WEIGHT = Decimal("1")
ACTION = "public_draft"


def _invalid(field: str, message: str) -> ValidationAppError:
    return ValidationAppError("One or more fields are invalid.", fields={field: [message]})


def _unique(names: list[str], field: str) -> None:
    seen: set[str] = set()
    for name in names:
        key = " ".join(name.lower().split())
        if key in seen:
            raise _invalid(field, f"“{name}” is listed more than once.")
        seen.add(key)


async def create_from_scaffold(
    db: AsyncSession, *, owner_id: uuid.UUID, scaffold: ScaffoldIn, draft_token: str
) -> Decision:
    claims = public_drafter.read_token(draft_token)
    if claims is None:
        metrics.record_scaffold_handoff("invalid")
        raise _invalid("draft_token", "This draft has expired. Start a new decision instead.")
    _unique([o.name for o in scaffold.options], "options")
    _unique([c.name for c in scaffold.criteria], "criteria")
    ttl = max(int(claims["exp"] - datetime.now(UTC).timestamp()), 1)
    if not await public_guard.claim_token(claims["jti"], ttl + 60):
        metrics.record_scaffold_handoff("reused")
        raise _invalid("draft_token", "This draft has already been saved.")

    ai_options = {n.lower() for n in claims.get("options", [])}
    ai_criteria = {n.lower() for n in claims.get("criteria", [])}

    decision = await decision_repository.create_decision(
        db,
        owner_id=owner_id,
        title=scaffold.title.strip(),
        context="",
        category=scaffold.category.strip()[:64],
        deadline=None,
    )
    items: list[dict[str, Any]] = []
    resolution: dict[str, Any] = {}
    now = datetime.now(UTC).isoformat()

    def record(kind: str, label: str, detail: str, created_id: uuid.UUID) -> None:
        item_id = f"i{len(items) + 1}"
        items.append({"id": item_id, "kind": kind, "label": label, "detail": detail, "data": {}})
        resolution[item_id] = {
            "status": "accepted",
            "at": now,
            "created": {"type": kind, "id": str(created_id)},
        }

    for position, option in enumerate(scaffold.options):
        alt = await decision_repository.create_alternative(
            db,
            decision_id=decision.id,
            name=option.name.strip(),
            description=option.note.strip(),
            position=position,
        )
        if option.name.strip().lower() in ai_options:
            record("option", alt.name, alt.description or "", alt.id)
    for position, criterion in enumerate(scaffold.criteria):
        crit = await decision_repository.create_criterion(
            db,
            decision_id=decision.id,
            name=criterion.name.strip(),
            weight=EQUAL_WEIGHT,
            direction=criterion.direction,
            description=criterion.description.strip(),
            is_active=True,
            position=position,
        )
        if criterion.name.strip().lower() in ai_criteria:
            direction = (
                "Higher is better" if criterion.direction == "benefit" else "Lower is better"
            )
            record("criterion", crit.name, direction, crit.id)

    if items:
        db.add(
            AIProposal(
                decision_id=decision.id,
                action=ACTION,
                kind="proposal",
                status=ProposalStatus.ACCEPTED,
                prompt_version=str(claims.get("pv", public_drafter.PROMPT_VERSION))[:16],
                model=str(claims.get("model", "unknown"))[:64],
                payload_json={
                    "summary": "Drafted on the home page before you created your account.",
                    "items": items,
                },
                resolution_json=resolution,
                cache_hit=False,
                expires_at=datetime.now(UTC),
                resolved_at=datetime.now(UTC),
            )
        )
    await db.flush()
    await decision_service.refresh_status(db, decision)
    await db.commit()
    await db.refresh(decision)
    metrics.record_decision_created()
    metrics.record_scaffold_handoff("created")
    if items:
        metrics.record_ai_proposal_item(ACTION, "accepted", len(items))
    return decision
