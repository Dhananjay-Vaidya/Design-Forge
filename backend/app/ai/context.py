"""
Minimised decision snapshot sent to the model (docs/06 §5, NFR-010). Whitelist only: decision
title/context/category/deadline, option names and notes, active criteria (name, share, direction),
scores by name, and the deterministic ranking summary. Never: user id, email, database ids, tokens.
"""

from __future__ import annotations

import json
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.scoring import engine
from app.models.decision import Decision
from app.repositories import decision_repository
from app.services import decision_service


def _pts(value: Decimal) -> float:
    return round(float(value) * 100, 1)


async def build_decision_context(db: AsyncSession, decision: Decision) -> dict[str, Any]:
    alternatives = await decision_repository.list_alternatives(db, decision_id=decision.id)
    criteria = await decision_repository.list_criteria(db, decision_id=decision.id)
    scores = await decision_repository.list_scores(db, decision_id=decision.id)

    active = [c for c in criteria if c.is_active]
    total_weight = sum((c.weight for c in active), Decimal(0)) or Decimal(1)
    alt_name = {a.id: a.name for a in alternatives}
    crit_name = {c.id: c.name for c in active}

    score_rows: dict[str, dict[str, float]] = {a.name: {} for a in alternatives}
    for s in scores:
        if s.alternative_id in alt_name and s.criterion_id in crit_name:
            score_rows[alt_name[s.alternative_id]][crit_name[s.criterion_id]] = float(s.score)

    context: dict[str, Any] = {
        "decision": {
            "title": decision.title,
            "context": decision.context or "",
            "category": decision.category or "",
            "deadline": decision.deadline.isoformat() if decision.deadline else None,
        },
        "options": [{"name": a.name, "note": a.description or ""} for a in alternatives],
        "criteria": [
            {
                "name": c.name,
                "weight_share_percent": round(float(c.weight / total_weight) * 100, 1),
                "direction": "higher is better" if c.direction == "benefit" else "lower is better",
            }
            for c in active
        ],
        "score_scale": "1 (worst) to 10 (best), per criterion",
        "scores": score_rows,
    }

    try:
        result = await decision_service.calculate_ranking(db, decision)
    except engine.ScoringError as exc:
        context["ranking"] = {"available": False, "reason": type(exc).__name__}
    else:
        context["ranking"] = {
            "available": True,
            "method": "deterministic weighted sum (not AI)",
            "order": [
                {"rank": r.rank, "option": r.name, "total_points_out_of_100": _pts(r.total)}
                for r in result.ranking
            ],
            "leader_stable": result.sensitivity.leader_stable,
            "margin_points": _pts(result.sensitivity.margin),
        }
    return context


def render_context(context: dict[str, Any]) -> str:
    return json.dumps(context, ensure_ascii=False, indent=1)
