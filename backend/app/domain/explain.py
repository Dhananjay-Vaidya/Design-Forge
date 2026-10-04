"""
"Why this ranks first" (FX-05): a plain-language explanation produced by TEMPLATE over the ranking
the engine already computed. No model, no network, no quota; it works with Gemini disabled and is
presented as "Calculated, not AI". Every number it states comes straight from the ranking result.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.domain.scoring import engine
from app.domain.sensitivity import ScoreFlip, WeightFlip

HUNDRED = Decimal(100)
TOP_DRIVERS = 3
TOP_EDGES = 2
STABLE_MARGIN_POINTS = Decimal(5)  # mirrors the engine's default sensitivity threshold (0.05)


@dataclass(frozen=True)
class Driver:
    criterion: str
    share_percent: Decimal
    points: Decimal


@dataclass(frozen=True)
class Edge:
    criterion: str
    points: Decimal  # leader minus runner-up on this criterion; positive = leader is ahead


@dataclass(frozen=True)
class Explanation:
    headline: str
    drivers: list[Driver]
    ahead_on: list[Edge]
    behind_on: list[Edge]
    stability: str
    flip_hint: str
    text: str


def _fmt(value: Decimal) -> str:
    return f"{value:.1f}"


def _pct(value: Decimal) -> str:
    return f"{value:.0f}%"


def _join(items: list[str]) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def explain(
    result: engine.RankingResult,
    names: dict[str, str],
    weight_flips: list[WeightFlip],
    score_flips: list[ScoreFlip],
) -> Explanation:
    leader, runner = result.ranking[0], result.ranking[1]
    margin = (leader.total - runner.total) * HUNDRED

    drivers = [
        Driver(
            criterion=names[crit_id],
            share_percent=result.weights_normalized[crit_id] * HUNDRED,
            points=points * HUNDRED,
        )
        for crit_id, points in sorted(
            leader.breakdown.items(), key=lambda kv: (-kv[1], names[kv[0]])
        )[:TOP_DRIVERS]
    ]

    diffs = [
        Edge(names[crit_id], (leader.breakdown[crit_id] - runner.breakdown[crit_id]) * HUNDRED)
        for crit_id in leader.breakdown
    ]
    ahead_on = sorted((e for e in diffs if e.points > 0), key=lambda e: (-e.points, e.criterion))
    behind_on = sorted((e for e in diffs if e.points < 0), key=lambda e: (e.points, e.criterion))

    headline = (
        f"{leader.name} ranks first with {_fmt(leader.total * HUNDRED)} points, "
        f"{_fmt(margin)} ahead of {runner.name}."
    )

    parts = [headline]
    if ahead_on:
        lead_text = _join([f"{e.criterion} (+{_fmt(e.points)})" for e in ahead_on[:TOP_EDGES]])
        parts.append(f"It leads mainly on {lead_text}.")
    if behind_on:
        trail_text = _join([f"{e.criterion} ({_fmt(e.points)})" for e in behind_on[:TOP_EDGES]])
        parts.append(f"It trails {runner.name} on {trail_text}.")

    if margin < STABLE_MARGIN_POINTS:
        stability = (
            f"This is a close call: the lead is under {STABLE_MARGIN_POINTS:.0f} points, "
            "so small changes to weights or scores could change the winner."
        )
    else:
        stability = (
            f"The lead is comfortable: more than {STABLE_MARGIN_POINTS:.0f} points, "
            "so small changes are unlikely to change the winner."
        )
    parts.append(stability)

    if weight_flips:
        w = weight_flips[0]
        verb = "rise" if w.direction == "increase" else "fall"
        flip_hint = (
            f"The weight on {w.name} would need to {verb} from {_pct(w.current_share_percent)} "
            f"to {_pct(w.flip_share_percent)} of the total for {w.challenger_name} to take the lead."
        )
    elif score_flips:
        s = score_flips[0]
        flip_hint = (
            f"{s.alternative_name}'s {s.criterion_name} score would need to move by at least "
            f"{_fmt(s.delta)} points to change the leader."
        )
    else:
        flip_hint = "No single weight or score change within the scale would change the leader."
    parts.append(flip_hint)

    return Explanation(
        headline=headline,
        drivers=drivers,
        ahead_on=ahead_on[:TOP_EDGES],
        behind_on=behind_on[:TOP_EDGES],
        stability=stability,
        flip_hint=flip_hint,
        text=" ".join(parts),
    )
