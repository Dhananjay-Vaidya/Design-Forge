"""
Snapshot comparison (FX-04). Pure: takes two snapshot payloads (app/domain/snapshot.py) and
describes what changed between them. Items are matched by ID, never by name, so a renamed option
or criterion is reported as a rename rather than as a removal plus an addition.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any

DECISION_FIELDS = ("title", "context", "category", "deadline")
HUNDRED = Decimal(100)


def _field(field: str, before: Any, after: Any) -> dict[str, Any]:
    return {
        "field": field,
        "before": None if before is None else str(before),
        "after": None if after is None else str(after),
    }


def _shares(payload: dict[str, Any]) -> dict[str, Decimal]:
    """Normalised weight of each ACTIVE criterion (0..1), as the engine would use them."""
    active = [c for c in payload["criteria"] if c["is_active"]]
    total = sum((Decimal(c["weight"]) for c in active), Decimal(0))
    return {c["id"]: (Decimal(c["weight"]) / total if total else Decimal(0)) for c in active}


def _criteria_changes(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    a_by = {c["id"]: c for c in a["criteria"]}
    b_by = {c["id"]: c for c in b["criteria"]}
    a_share, b_share = _shares(a), _shares(b)

    def share(shares: dict[str, Decimal], cid: str) -> float | None:
        return float(shares[cid] * HUNDRED) if cid in shares else None

    out: list[dict[str, Any]] = []
    for cid, c in b_by.items():
        if cid not in a_by:
            out.append(
                {
                    "criterion_id": cid,
                    "name": c["name"],
                    "kind": "added",
                    "changes": [],
                    "share_before": None,
                    "share_after": share(b_share, cid),
                }
            )
    for cid, c in a_by.items():
        if cid not in b_by:
            out.append(
                {
                    "criterion_id": cid,
                    "name": c["name"],
                    "kind": "removed",
                    "changes": [],
                    "share_before": share(a_share, cid),
                    "share_after": None,
                }
            )
    for cid, before in a_by.items():
        after = b_by.get(cid)
        if after is None:
            continue
        changes = [
            _field(f, before[f], after[f])
            for f in ("name", "weight", "direction", "is_active")
            if before[f] != after[f]
        ]
        sb, sa = share(a_share, cid), share(b_share, cid)
        # A weight edit elsewhere can shift this criterion's SHARE without touching its own fields.
        if changes or (sb is not None and sa is not None and abs(sb - sa) > 1e-9):
            out.append(
                {
                    "criterion_id": cid,
                    "name": after["name"],
                    "kind": "changed",
                    "changes": changes,
                    "share_before": sb,
                    "share_after": sa,
                }
            )
    return out


def _alternative_changes(a: dict[str, Any], b: dict[str, Any]) -> list[dict[str, Any]]:
    a_by = {x["id"]: x for x in a["alternatives"]}
    b_by = {x["id"]: x for x in b["alternatives"]}
    out: list[dict[str, Any]] = []
    for aid, alt in b_by.items():
        if aid not in a_by:
            out.append(
                {"alternative_id": aid, "name": alt["name"], "kind": "added", "before_name": None}
            )
        elif a_by[aid]["name"] != alt["name"]:
            out.append(
                {
                    "alternative_id": aid,
                    "name": alt["name"],
                    "kind": "renamed",
                    "before_name": a_by[aid]["name"],
                }
            )
    for aid, alt in a_by.items():
        if aid not in b_by:
            out.append(
                {"alternative_id": aid, "name": alt["name"], "kind": "removed", "before_name": None}
            )
    return out


def _score_changes(a: dict[str, Any], b: dict[str, Any]) -> tuple[list[dict[str, Any]], int, int]:
    a_scores = {(s["alternative_id"], s["criterion_id"]): Decimal(s["score"]) for s in a["scores"]}
    b_scores = {(s["alternative_id"], s["criterion_id"]): Decimal(s["score"]) for s in b["scores"]}
    alt_names = {x["id"]: x["name"] for x in b["alternatives"]}
    crit_names = {c["id"]: c["name"] for c in b["criteria"]}
    changed: list[dict[str, Any]] = []
    for key, after in b_scores.items():
        before = a_scores.get(key)
        if before is None or before == after:
            continue
        alt_id, crit_id = key
        changed.append(
            {
                "alternative_id": alt_id,
                "alternative": alt_names.get(alt_id, ""),
                "criterion_id": crit_id,
                "criterion": crit_names.get(crit_id, ""),
                "before": float(before),
                "after": float(after),
            }
        )
    changed.sort(key=lambda s: (s["alternative"], s["criterion"]))
    return changed, len(b_scores.keys() - a_scores.keys()), len(a_scores.keys() - b_scores.keys())


def _ranking_diff(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    ra, rb = a.get("ranking"), b.get("ranking")
    before = {r["alternative_id"]: r for r in ra["order"]} if ra else {}
    after = {r["alternative_id"]: r for r in rb["order"]} if rb else {}
    moves: list[dict[str, Any]] = []
    for alt_id in {**before, **after}:
        x, y = before.get(alt_id), after.get(alt_id)
        pts_b = float(Decimal(x["points"])) if x else None
        pts_a = float(Decimal(y["points"])) if y else None
        moves.append(
            {
                "alternative_id": alt_id,
                "name": (y or x)["name"],  # type: ignore[index]
                "rank_before": x["rank"] if x else None,
                "rank_after": y["rank"] if y else None,
                "points_before": pts_b,
                "points_after": pts_a,
                "points_delta": (
                    round(pts_a - pts_b, 3) if pts_a is not None and pts_b is not None else None
                ),
                # Positive = moved up the table (a smaller rank number is better).
                "rank_delta": x["rank"] - y["rank"] if x and y else None,
            }
        )
    moves.sort(key=lambda m: (m["rank_after"] is None, m["rank_after"] or 0, m["rank_before"] or 0))
    leader_before = ra["order"][0] if ra else None
    leader_after = rb["order"][0] if rb else None
    return {
        "available_before": ra is not None,
        "available_after": rb is not None,
        "leader_before": leader_before["name"] if leader_before else None,
        "leader_after": leader_after["name"] if leader_after else None,
        "leader_changed": bool(
            leader_before
            and leader_after
            and leader_before["alternative_id"] != leader_after["alternative_id"]
        ),
        "moves": moves,
    }


def _summary(diff: dict[str, Any]) -> list[str]:
    ranking = diff["ranking"]
    lines: list[str] = []
    if ranking["leader_changed"]:
        lines.append(
            f"Leader changed from {ranking['leader_before']} to {ranking['leader_after']}."
        )
    elif ranking["available_before"] and ranking["available_after"]:
        lines.append(f"Leader unchanged: {ranking['leader_after']}.")
    else:
        lines.append(
            "A ranking is not available for one of these versions (scores were incomplete)."
        )

    if diff["criteria"]:
        n = len(diff["criteria"])
        lines.append(f"{n} {'criterion' if n == 1 else 'criteria'} changed.")
    if diff["alternatives"]:
        n = len(diff["alternatives"])
        lines.append(f"{n} option{'' if n == 1 else 's'} added, removed or renamed.")
    if diff["scores"]:
        n = len(diff["scores"])
        lines.append(f"{n} score{'' if n == 1 else 's'} changed.")
    if diff["decision_changes"]:
        lines.append("Decision details were edited.")
    if len(lines) == 1 and not ranking["leader_changed"]:
        lines.append("No other differences.")
    return lines


def compare(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    scores, added, removed = _score_changes(a, b)
    diff: dict[str, Any] = {
        "decision_changes": [
            _field(f, a["decision"].get(f), b["decision"].get(f))
            for f in DECISION_FIELDS
            if a["decision"].get(f) != b["decision"].get(f)
        ],
        "alternatives": _alternative_changes(a, b),
        "criteria": _criteria_changes(a, b),
        "scores": scores,
        "score_cells_added": added,
        "score_cells_removed": removed,
        "ranking": _ranking_diff(a, b),
    }
    diff["summary"] = _summary(diff)
    return diff
