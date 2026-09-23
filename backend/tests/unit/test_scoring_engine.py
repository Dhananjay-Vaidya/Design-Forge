"""
Scoring engine unit tests — docs/10-testing-strategy.md §2/§17/§18 (AC-002/003/004).
Hand-calculated examples throughout, per the testing strategy's explicit instruction.

This is a direct port of backend/tests/scoring/test_engine.py (only the import path changed,
`apps.scoring.engine` -> `app.domain.scoring.engine`) — it is the Django-vs-FastAPI regression
test required by the migration brief Step 10: identical hand-calculated assertions passing here
proves the ported engine produces byte-identical results to the original.
"""

from decimal import Decimal

import pytest

from app.domain.scoring.engine import (
    AlternativeInput,
    CriterionInput,
    InsufficientAlternativesError,
    MissingCell,
    MissingScoresError,
    NoActiveCriteriaError,
    ScoreCellInput,
    calculate_ranking,
    calculate_sensitivity,
    find_missing_cells,
    normalize_score,
    normalize_weights,
)


def D(value) -> Decimal:
    return Decimal(str(value))


# ---------------------------------------------------------------------------
# Weight normalization — BR-004
# ---------------------------------------------------------------------------


def test_normalize_weights_sums_to_one():
    criteria = [
        CriterionInput(id="c1", weight=D(6), direction="benefit"),
        CriterionInput(id="c2", weight=D(4), direction="cost"),
    ]
    weights = normalize_weights(criteria)
    assert weights == {"c1": D("0.6"), "c2": D("0.4")}
    assert sum(weights.values()) == D("1.0")


def test_normalize_weights_handles_uneven_split():
    criteria = [
        CriterionInput(id="c1", weight=D(1), direction="benefit"),
        CriterionInput(id="c2", weight=D(1), direction="benefit"),
        CriterionInput(id="c3", weight=D(1), direction="benefit"),
    ]
    weights = normalize_weights(criteria)
    # 1/3 doesn't terminate in base 10; assert within Decimal's rounding tolerance, not exact equality.
    assert abs(sum(weights.values()) - D("1")) < D("1e-20")
    assert weights["c1"] == weights["c2"] == weights["c3"]


def test_normalize_weights_raises_when_all_zero():
    criteria = [CriterionInput(id="c1", weight=D(0), direction="benefit")]
    with pytest.raises(NoActiveCriteriaError):
        normalize_weights(criteria)


# ---------------------------------------------------------------------------
# Direction handling — benefit vs cost
# ---------------------------------------------------------------------------


def test_normalize_score_benefit_direction():
    # scale 1-10: raw 10 -> best (1.0), raw 1 -> worst (0.0)
    assert normalize_score(D(10), "benefit", D(1), D(10)) == D("1")
    assert normalize_score(D(1), "benefit", D(1), D(10)) == D("0")
    assert normalize_score(D("5.5"), "benefit", D(1), D(10)) == D("0.5")


def test_normalize_score_cost_direction_inverts():
    # cost: lower raw is better -> raw 1 (cheapest) -> best (1.0), raw 10 -> worst (0.0)
    assert normalize_score(D(1), "cost", D(1), D(10)) == D("1")
    assert normalize_score(D(10), "cost", D(1), D(10)) == D("0")


# ---------------------------------------------------------------------------
# Missing-cell detection — BR-005, AC-004
# ---------------------------------------------------------------------------


def test_find_missing_cells_reports_every_absent_pair():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5))]

    missing = find_missing_cells(alternatives, criteria, scores)
    assert len(missing) == 1
    assert missing[0].alternative_id == "a2"
    assert missing[0].criterion_id == "c1"


def test_find_missing_cells_empty_when_complete():
    alternatives = [AlternativeInput(id="a1", name="A")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5))]
    assert find_missing_cells(alternatives, criteria, scores) == []


# ---------------------------------------------------------------------------
# calculate_ranking — the full pipeline, hand-calculated (AC-003)
# ---------------------------------------------------------------------------


def _two_criteria_scenario():
    alternatives = [
        AlternativeInput(id="a1", name="Offer A"),
        AlternativeInput(id="a2", name="Offer B"),
    ]
    criteria = [
        CriterionInput(id="c1", weight=D(6), direction="benefit"),
        CriterionInput(id="c2", weight=D(4), direction="cost"),
    ]
    scores = [
        ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(10)),  # best on benefit
        ScoreCellInput(alternative_id="a1", criterion_id="c2", score=D(10)),  # worst on cost
        ScoreCellInput(alternative_id="a2", criterion_id="c1", score=D(1)),  # worst on benefit
        ScoreCellInput(alternative_id="a2", criterion_id="c2", score=D(1)),  # best on cost
    ]
    return alternatives, criteria, scores


def test_calculate_ranking_hand_calculated_totals():
    alternatives, criteria, scores = _two_criteria_scenario()
    result = calculate_ranking(alternatives, criteria, scores)

    assert result.weights_normalized == {"c1": D("0.6"), "c2": D("0.4")}
    # a1: benefit normalized=1 * 0.6 + cost normalized=0 * 0.4 = 0.6
    # a2: benefit normalized=0 * 0.6 + cost normalized=1 * 0.4 = 0.4
    assert result.ranking[0].alternative_id == "a1"
    assert result.ranking[0].total == D("0.6")
    assert result.ranking[1].alternative_id == "a2"
    assert result.ranking[1].total == D("0.4")
    assert result.ranking[0].rank == 1
    assert result.ranking[1].rank == 2


def test_calculate_ranking_is_deterministic_across_repeated_calls():
    alternatives, criteria, scores = _two_criteria_scenario()
    first = calculate_ranking(alternatives, criteria, scores)
    second = calculate_ranking(alternatives, criteria, scores)
    assert [r.alternative_id for r in first.ranking] == [r.alternative_id for r in second.ranking]
    assert [r.total for r in first.ranking] == [r.total for r in second.ranking]


def test_calculate_ranking_ties_broken_by_original_input_order():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [
        ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5)),
        ScoreCellInput(alternative_id="a2", criterion_id="c1", score=D(5)),
    ]
    result = calculate_ranking(alternatives, criteria, scores)
    assert result.ranking[0].total == result.ranking[1].total
    assert result.ranking[0].alternative_id == "a1"  # first in input order wins the tie
    assert result.ranking[1].alternative_id == "a2"


def test_calculate_ranking_ignores_inactive_criteria():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [
        CriterionInput(id="c1", weight=D(1), direction="benefit", is_active=True),
        CriterionInput(id="c2", weight=D(99), direction="benefit", is_active=False),
    ]
    # No score provided for c2 at all -- must not be required since it's inactive.
    scores = [
        ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(10)),
        ScoreCellInput(alternative_id="a2", criterion_id="c1", score=D(1)),
    ]
    result = calculate_ranking(alternatives, criteria, scores)
    assert result.weights_normalized == {"c1": D("1")}
    assert result.ranking[0].alternative_id == "a1"


def test_calculate_ranking_raises_below_two_alternatives():
    alternatives = [AlternativeInput(id="a1", name="A")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5))]
    with pytest.raises(InsufficientAlternativesError):
        calculate_ranking(alternatives, criteria, scores)


def test_calculate_ranking_raises_with_no_active_criteria():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit", is_active=False)]
    with pytest.raises(NoActiveCriteriaError):
        calculate_ranking(alternatives, criteria, [])


def test_calculate_ranking_raises_with_missing_cells_and_lists_them():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5))]
    with pytest.raises(MissingScoresError) as exc_info:
        calculate_ranking(alternatives, criteria, scores)
    assert exc_info.value.missing == [MissingCell("a2", "c1")]


# ---------------------------------------------------------------------------
# Sensitivity — FR-008, docs/14 OQ-5 (threshold-flag default)
# ---------------------------------------------------------------------------


def test_sensitivity_stable_when_margin_above_threshold():
    alternatives, criteria, scores = _two_criteria_scenario()
    result = calculate_ranking(alternatives, criteria, scores)
    assert result.sensitivity.leader_stable is True
    assert result.sensitivity.margin == D("0.2")


def test_sensitivity_unstable_when_margin_below_threshold():
    alternatives = [AlternativeInput(id="a1", name="A"), AlternativeInput(id="a2", name="B")]
    criteria = [CriterionInput(id="c1", weight=D(1), direction="benefit")]
    scores = [
        ScoreCellInput(alternative_id="a1", criterion_id="c1", score=D(5)),
        ScoreCellInput(alternative_id="a2", criterion_id="c1", score=D(5)),
    ]
    result = calculate_ranking(alternatives, criteria, scores)
    assert result.sensitivity.leader_stable is False


def test_calculate_sensitivity_with_single_alternative_is_stable():
    from app.domain.scoring.engine import RankedAlternative

    ranking = [RankedAlternative(rank=1, alternative_id="a1", name="A", total=D("0.5"))]
    result = calculate_sensitivity(ranking)
    assert result.leader_stable is True
