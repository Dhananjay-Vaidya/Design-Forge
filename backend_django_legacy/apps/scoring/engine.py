"""
Deterministic decision-scoring engine.

Pure library, NO Django/ORM/I-O imports — this is what makes BR-006/BR-011 structurally true
(ADR-01, docs/03-system-architecture.md §12): the ranking can never depend on, or be influenced
by, the AI layer, because this module cannot see it. `apps.decisions.services` is the only
caller; it maps ORM rows into the dataclasses below and back.

Traces: FR-007/008, BR-004/005/006, AC-002/003/004, docs/14 D-1/D-5, OQ-5.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

CALCULATION_METHOD_VERSION = "weighted-sum.v1"


@dataclass(frozen=True)
class AlternativeInput:
    id: str
    name: str


@dataclass(frozen=True)
class CriterionInput:
    id: str
    weight: Decimal
    direction: str  # "benefit" | "cost"
    is_active: bool = True


@dataclass(frozen=True)
class ScoreCellInput:
    alternative_id: str
    criterion_id: str
    score: Decimal


@dataclass(frozen=True)
class MissingCell:
    alternative_id: str
    criterion_id: str


@dataclass(frozen=True)
class RankedAlternative:
    rank: int
    alternative_id: str
    name: str
    total: Decimal
    breakdown: dict[str, Decimal] = field(default_factory=dict)


@dataclass(frozen=True)
class SensitivityResult:
    leader_stable: bool
    note: str
    margin: Decimal


@dataclass(frozen=True)
class RankingResult:
    weights_normalized: dict[str, Decimal]
    ranking: list[RankedAlternative]
    sensitivity: SensitivityResult
    calculation_method: str = CALCULATION_METHOD_VERSION


class ScoringError(Exception):
    """Base for engine validation failures — always mapped to ERR-VALIDATION by the caller."""


class InsufficientAlternativesError(ScoringError):
    """BR-002, AC-002 — fewer than two alternatives."""


class NoActiveCriteriaError(ScoringError):
    """BR-003 — no active criterion."""


class MissingScoresError(ScoringError):
    """BR-005, AC-004 — not every (alternative x active criterion) cell has a score."""

    def __init__(self, missing: list[MissingCell]):
        self.missing = missing
        super().__init__(f"{len(missing)} missing score cell(s)")


def normalize_weights(criteria: list[CriterionInput]) -> dict[str, Decimal]:
    """BR-004 — positive weights normalized to sum to 1 (i.e., 100%)."""
    total = sum((c.weight for c in criteria), Decimal("0"))
    if total <= 0:
        raise NoActiveCriteriaError("Sum of active criterion weights must be positive.")
    return {c.id: (c.weight / total) for c in criteria}


def find_missing_cells(
    alternatives: list[AlternativeInput],
    criteria: list[CriterionInput],
    scores: list[ScoreCellInput],
) -> list[MissingCell]:
    present = {(s.alternative_id, s.criterion_id) for s in scores}
    return [
        MissingCell(a.id, c.id)
        for a in alternatives
        for c in criteria
        if (a.id, c.id) not in present
    ]


def normalize_score(
    score: Decimal, direction: str, score_min: Decimal, score_max: Decimal
) -> Decimal:
    """Benefit: higher raw is better. Cost: lower raw is better (Appendix A glossary)."""
    span = score_max - score_min
    if span <= 0:
        return Decimal("1")
    if direction == "cost":
        return (score_max - score) / span
    return (score - score_min) / span


def calculate_sensitivity(
    ranking: list[RankedAlternative], threshold: Decimal = Decimal("0.05")
) -> SensitivityResult:
    """
    Basic MVP method (docs/14 OQ-5 interim default): flag instability when the gap between the
    #1 and #2 normalized totals is smaller than `threshold`. Advisory only; never mutates ranking.
    """
    if len(ranking) < 2:
        return SensitivityResult(
            leader_stable=True,
            note="Only one alternative; no comparison possible.",
            margin=Decimal("1"),
        )
    margin = ranking[0].total - ranking[1].total
    if margin < threshold:
        return SensitivityResult(
            leader_stable=False,
            note=f"Leader may change with small weight or score shifts (margin {margin:.3f}).",
            margin=margin,
        )
    return SensitivityResult(
        leader_stable=True, note=f"Leader is stable (margin {margin:.3f}).", margin=margin
    )


def calculate_ranking(
    alternatives: list[AlternativeInput],
    criteria: list[CriterionInput],
    scores: list[ScoreCellInput],
    *,
    score_min: Decimal = Decimal(1),
    score_max: Decimal = Decimal(10),
    sensitivity_threshold: Decimal = Decimal("0.05"),
) -> RankingResult:
    """
    UC-07 — the single authoritative entry point. Raises ScoringError subclasses for BR-002/003/005
    guard failures (mapped to 400 ERR-VALIDATION by the API layer, AC-002/AC-004); otherwise returns
    a deterministic, reproducible RankingResult (AC-003): identical inputs -> identical output,
    including stable ordering on ties (secondary sort key is input order, never random/dict order).
    """
    if len(alternatives) < 2:
        raise InsufficientAlternativesError("At least two alternatives are required.")

    active_criteria = [c for c in criteria if c.is_active]
    if not active_criteria:
        raise NoActiveCriteriaError("At least one active criterion is required.")

    missing = find_missing_cells(alternatives, active_criteria, scores)
    if missing:
        raise MissingScoresError(missing)

    weights = normalize_weights(active_criteria)
    score_map = {(s.alternative_id, s.criterion_id): s.score for s in scores}

    computed: list[tuple[int, AlternativeInput, Decimal, dict[str, Decimal]]] = []
    for order, alt in enumerate(alternatives):
        breakdown: dict[str, Decimal] = {}
        total = Decimal("0")
        for crit in active_criteria:
            raw = score_map[(alt.id, crit.id)]
            normalized = normalize_score(raw, crit.direction, score_min, score_max)
            contribution = normalized * weights[crit.id]
            breakdown[crit.id] = contribution
            total += contribution
        computed.append((order, alt, total, breakdown))

    # Stable deterministic sort: descending total, ties broken by original input order (AC-003).
    computed.sort(key=lambda row: (-row[2], row[0]))

    ranking = [
        RankedAlternative(
            rank=i + 1, alternative_id=alt.id, name=alt.name, total=total, breakdown=breakdown
        )
        for i, (_, alt, total, breakdown) in enumerate(computed)
    ]
    sensitivity = calculate_sensitivity(ranking, threshold=sensitivity_threshold)
    return RankingResult(weights_normalized=weights, ranking=ranking, sensitivity=sensitivity)
