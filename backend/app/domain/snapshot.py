"""
Immutable decision snapshots (BR-007, FR-012). A snapshot is a self-contained copy of everything a
ranking depends on, plus the ranking as it was when the snapshot was taken. Nothing here touches
the database; the service persists the payload and never updates it.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.domain.scoring import engine

SCHEMA_VERSION = 1
HUNDRED = Decimal(100)


def _num(value: Decimal) -> str:
    """Stable string form: 3.000 -> "3", 7.500 -> "7.5" (JSON has no Decimal)."""
    return format(value.normalize(), "f")


def build_payload(
    *,
    decision: dict[str, Any],
    alternatives: list[dict[str, Any]],
    criteria: list[dict[str, Any]],
    scores: list[dict[str, Any]],
    ranking: engine.RankingResult | None,
) -> dict[str, Any]:
    """Inputs are plain dicts so this stays free of ORM types (and trivially testable)."""
    return {
        "schema": SCHEMA_VERSION,
        "decision": {
            "title": decision["title"],
            "context": decision.get("context") or "",
            "category": decision.get("category") or "",
            "deadline": decision.get("deadline"),
        },
        "alternatives": [
            {
                "id": a["id"],
                "name": a["name"],
                "description": a.get("description") or "",
                "position": a["position"],
            }
            for a in alternatives
        ],
        "criteria": [
            {
                "id": c["id"],
                "name": c["name"],
                "weight": _num(c["weight"]),
                "direction": c["direction"],
                "is_active": c["is_active"],
                "position": c["position"],
            }
            for c in criteria
        ],
        "scores": [
            {
                "alternative_id": s["alternative_id"],
                "criterion_id": s["criterion_id"],
                "score": _num(s["score"]),
            }
            for s in scores
        ],
        "ranking": None if ranking is None else ranking_payload(ranking),
    }


def ranking_payload(ranking: engine.RankingResult) -> dict[str, Any]:
    return {
        "method": ranking.calculation_method,
        "leader_stable": ranking.sensitivity.leader_stable,
        "margin_points": _num((ranking.sensitivity.margin * HUNDRED).quantize(Decimal("0.001"))),
        "order": [
            {
                "alternative_id": r.alternative_id,
                "name": r.name,
                "rank": r.rank,
                "points": _num((r.total * HUNDRED).quantize(Decimal("0.001"))),
            }
            for r in ranking.ranking
        ],
    }
