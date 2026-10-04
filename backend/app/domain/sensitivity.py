"""
Deterministic what-if analysis (FX-03). Pure functions over the engine's own input types: no I/O,
no AI, no randomness. Nothing here can alter a ranking; it only explains how fragile one is.

Two analyses, both teal ("calculated"):

* Tornado: for each active criterion, re-run the REAL engine with that criterion's weight scaled to
  50 % and 150 %, holding everything else fixed, and record the leader's margin over the best
  challenger. A negative margin means the leader changed. Reusing the engine guarantees the
  tornado can never disagree with the actual ranking.

* Flip points: the smallest single change that would change the leader.
    - Weight: totals are T_i(x) = (A_i + g_ic * x) / (W + x) where x is criterion c's raw weight,
      W the other weights' sum, A_i = sum_{j != c} g_ij w_j and g the normalised goodness. For two
      alternatives the shared denominator cancels, so the lead changes sign exactly where
      (A_L - A_K) + (g_Lc - g_Kc) * x = 0. That is a closed form, no search, and exact.
    - Score: one cell moves by d score points, which moves a total by share_c * d / span.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_CEILING, Decimal

from app.domain.scoring import engine

HUNDRED = Decimal(100)
TORNADO_LOW = Decimal("0.5")
TORNADO_HIGH = Decimal("1.5")
MAX_WEIGHT_FLIPS = 5
MAX_SCORE_FLIPS = 3
_TENTH = Decimal("0.1")
_NOISE = Decimal("1e-12")  # 28-digit division noise is removed before testing for exact boundaries
# Totals are 28-digit decimals; anything this close to zero is an exact tie, not a real margin.
TIE_TOLERANCE = Decimal("1e-18")


@dataclass(frozen=True)
class LeaderRef:
    alternative_id: str
    name: str
    points: Decimal


@dataclass(frozen=True)
class TornadoBar:
    criterion_id: str
    name: str
    share_percent: Decimal
    low_margin_points: Decimal
    high_margin_points: Decimal
    low_leader: str
    high_leader: str
    swing_points: Decimal
    flips: bool


@dataclass(frozen=True)
class WeightFlip:
    criterion_id: str
    name: str
    challenger_id: str
    challenger_name: str
    direction: str  # "increase" | "decrease"
    current_weight: Decimal
    flip_weight: Decimal
    current_share_percent: Decimal
    flip_share_percent: Decimal
    delta_points: Decimal


@dataclass(frozen=True)
class ScoreFlip:
    alternative_id: str
    alternative_name: str
    criterion_id: str
    criterion_name: str
    role: str  # "leader_down" (leader scores worse) | "challenger_up" (challenger scores better)
    current_score: Decimal
    flip_score: Decimal
    delta: Decimal
    feasible: bool


@dataclass(frozen=True)
class SensitivityReport:
    leader: LeaderRef
    runner_up: LeaderRef | None
    margin_points: Decimal
    tornado: list[TornadoBar]
    weight_flips: list[WeightFlip]
    score_flips: list[ScoreFlip]


def _points(value: Decimal) -> Decimal:
    return value * HUNDRED


def _totals(result: engine.RankingResult) -> dict[str, Decimal]:
    return {r.alternative_id: r.total for r in result.ranking}


def _margin_over_best_other(result: engine.RankingResult, leader_id: str) -> Decimal:
    totals = _totals(result)
    others = [t for alt_id, t in totals.items() if alt_id != leader_id]
    return totals[leader_id] - max(others)


def tornado(
    alternatives: list[engine.AlternativeInput],
    criteria: list[engine.CriterionInput],
    scores: list[engine.ScoreCellInput],
    names: dict[str, str],
    base: engine.RankingResult,
    *,
    score_min: Decimal,
    score_max: Decimal,
) -> list[TornadoBar]:
    leader_id = base.ranking[0].alternative_id
    alt_names = {a.id: a.name for a in alternatives}
    bars: list[TornadoBar] = []

    def rerun(target_id: str, factor: Decimal) -> engine.RankingResult:
        scaled = [
            engine.CriterionInput(
                id=c.id,
                weight=c.weight * factor if c.id == target_id else c.weight,
                direction=c.direction,
                is_active=c.is_active,
            )
            for c in criteria
        ]
        return engine.calculate_ranking(
            alternatives, scaled, scores, score_min=score_min, score_max=score_max
        )

    for crit in (c for c in criteria if c.is_active):
        low = rerun(crit.id, TORNADO_LOW)
        high = rerun(crit.id, TORNADO_HIGH)
        low_margin = _points(_margin_over_best_other(low, leader_id))
        high_margin = _points(_margin_over_best_other(high, leader_id))
        bars.append(
            TornadoBar(
                criterion_id=crit.id,
                name=names[crit.id],
                share_percent=_points(base.weights_normalized[crit.id]),
                low_margin_points=low_margin,
                high_margin_points=high_margin,
                low_leader=alt_names[low.ranking[0].alternative_id],
                high_leader=alt_names[high.ranking[0].alternative_id],
                swing_points=abs(high_margin - low_margin),
                flips=low_margin < 0 or high_margin < 0,
            )
        )
    bars.sort(key=lambda b: (-b.swing_points, b.name))
    return bars


def weight_flips(
    alternatives: list[engine.AlternativeInput],
    criteria: list[engine.CriterionInput],
    scores: list[engine.ScoreCellInput],
    names: dict[str, str],
    base: engine.RankingResult,
    *,
    score_min: Decimal,
    score_max: Decimal,
) -> list[WeightFlip]:
    active = [c for c in criteria if c.is_active]
    score_map = {(s.alternative_id, s.criterion_id): s.score for s in scores}
    alt_names = {a.id: a.name for a in alternatives}
    leader_id = base.ranking[0].alternative_id
    challengers = [r.alternative_id for r in base.ranking[1:]]
    total_weight = sum((c.weight for c in active), Decimal(0))

    def g(alt_id: str, crit: engine.CriterionInput) -> Decimal:
        return engine.normalize_score(
            score_map[(alt_id, crit.id)], crit.direction, score_min, score_max
        )

    best_per_criterion: dict[str, WeightFlip] = {}
    for crit in active:
        rest = total_weight - crit.weight
        if rest <= 0:  # a lone criterion decides everything regardless of its weight
            continue
        others = [c for c in active if c.id != crit.id]

        def rest_sum(alt_id: str, _others: list[engine.CriterionInput] = others) -> Decimal:
            return sum((g(alt_id, o) * o.weight for o in _others), Decimal(0))

        a_leader = rest_sum(leader_id)
        share_now = crit.weight / total_weight
        for challenger_id in challengers:
            a = a_leader - rest_sum(challenger_id)
            b = g(leader_id, crit) - g(challenger_id, crit)
            if b == 0:
                continue
            # N(x) = a + b*x is the sign of (leader - challenger) at raw weight x.
            lead_today = a + b * crit.weight
            if abs(lead_today) <= TIE_TOLERANCE:
                # Exactly tied today (the leader only holds on input order): any move in the
                # challenger's favour flips it, so the flip point is the current weight.
                x_star = crit.weight
            else:
                x_star = -a / b
                if b > 0 and x_star <= 0:
                    continue  # would need a zero or negative weight
            direction = "increase" if b < 0 else "decrease"
            share_flip = x_star / (rest + x_star)
            candidate = WeightFlip(
                criterion_id=crit.id,
                name=names[crit.id],
                challenger_id=challenger_id,
                challenger_name=alt_names[challenger_id],
                direction=direction,
                current_weight=crit.weight,
                flip_weight=x_star,
                current_share_percent=_points(share_now),
                flip_share_percent=_points(share_flip),
                delta_points=_points(share_flip - share_now),
            )
            held = best_per_criterion.get(crit.id)
            if held is None or abs(candidate.delta_points) < abs(held.delta_points):
                best_per_criterion[crit.id] = candidate

    ordered = sorted(best_per_criterion.values(), key=lambda f: (abs(f.delta_points), f.name))
    return ordered[:MAX_WEIGHT_FLIPS]


def score_flips(
    alternatives: list[engine.AlternativeInput],
    criteria: list[engine.CriterionInput],
    scores: list[engine.ScoreCellInput],
    names: dict[str, str],
    base: engine.RankingResult,
    *,
    score_min: Decimal,
    score_max: Decimal,
) -> list[ScoreFlip]:
    """Smallest single-cell changes that hand the lead to the runner-up (feasible ones only)."""
    active = {c.id: c for c in criteria if c.is_active}
    score_map = {(s.alternative_id, s.criterion_id): s.score for s in scores}
    alt_names = {a.id: a.name for a in alternatives}
    leader, runner = base.ranking[0], base.ranking[1]
    margin = leader.total - runner.total
    span = score_max - score_min
    flips: list[ScoreFlip] = []

    for crit_id, crit in active.items():
        share = base.weights_normalized[crit_id]
        # Score points needed to erase the margin on this one criterion (a bit more flips it).
        needed = (margin / share * span).quantize(_NOISE)
        delta = needed.quantize(_TENTH, rounding=ROUND_CEILING)
        # An exact tie is decided by decimal noise inside the engine, so only a step strictly past
        # the boundary is a guaranteed flip; the wording promises "at least" this much.
        if delta == needed:
            delta += _TENTH
        for role, alt_id, worse in (
            ("leader_down", leader.alternative_id, True),
            ("challenger_up", runner.alternative_id, False),
        ):
            current = score_map[(alt_id, crit_id)]
            # "Worse for the leader" lowers a benefit score / raises a cost score; challenger mirrors it.
            lowers = (crit.direction == "benefit") == worse
            target = current - delta if lowers else current + delta
            flips.append(
                ScoreFlip(
                    alternative_id=alt_id,
                    alternative_name=alt_names[alt_id],
                    criterion_id=crit_id,
                    criterion_name=names[crit_id],
                    role=role,
                    current_score=current,
                    flip_score=target,
                    delta=delta,
                    feasible=score_min <= target <= score_max,
                )
            )
    feasible = sorted((f for f in flips if f.feasible), key=lambda f: (f.delta, f.criterion_name))
    return feasible[:MAX_SCORE_FLIPS]


def analyze(
    alternatives: list[engine.AlternativeInput],
    criteria: list[engine.CriterionInput],
    scores: list[engine.ScoreCellInput],
    names: dict[str, str],
    *,
    score_min: Decimal,
    score_max: Decimal,
) -> SensitivityReport:
    """Raises engine.ScoringError exactly as the ranking does when the inputs aren't rankable."""
    base = engine.calculate_ranking(
        alternatives, criteria, scores, score_min=score_min, score_max=score_max
    )
    kwargs = {"score_min": score_min, "score_max": score_max}
    alt_names = {a.id: a.name for a in alternatives}
    first, second = base.ranking[0], base.ranking[1]

    def ref(r: engine.RankedAlternative) -> LeaderRef:
        return LeaderRef(r.alternative_id, alt_names[r.alternative_id], _points(r.total))

    return SensitivityReport(
        leader=ref(first),
        runner_up=ref(second),
        margin_points=_points(first.total - second.total),
        tornado=tornado(alternatives, criteria, scores, names, base, **kwargs),
        weight_flips=weight_flips(alternatives, criteria, scores, names, base, **kwargs),
        score_flips=score_flips(alternatives, criteria, scores, names, base, **kwargs),
    )
