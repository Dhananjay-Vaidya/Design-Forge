"""
Sensitivity analysis: tornado, weight flip points, score flip points (FX-03).

The worked example is checked by hand arithmetic (scale 1..10, so goodness = (score-1)/9):

    A: X=9 Y=3      B: X=4 Y=8      weights X=2, Y=1
    T_A = (2*8/9 + 2/9)/3 = 2/3      T_B = (2*3/9 + 7/9)/3 = 13/27      margin = 5/27 = 18.52 pts

The property tests then prove the closed-form flip points against the REAL engine on many random
decisions: just past a reported flip the leader changes, just before it the leader holds.
"""

import random
from decimal import Decimal

import pytest

from app.domain import sensitivity
from app.domain.scoring import engine

D = Decimal
MIN, MAX = D(1), D(10)


def alt(i: str) -> engine.AlternativeInput:
    return engine.AlternativeInput(id=i, name=f"Option {i}")


def crit(i: str, weight, direction="benefit", active=True) -> engine.CriterionInput:
    return engine.CriterionInput(id=i, weight=D(str(weight)), direction=direction, is_active=active)


def cell(a: str, c: str, score) -> engine.ScoreCellInput:
    return engine.ScoreCellInput(a, c, D(str(score)))


def worked_example():
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 2), crit("Y", 1)]
    scores = [cell("A", "X", 9), cell("A", "Y", 3), cell("B", "X", 4), cell("B", "Y", 8)]
    names = {"X": "Salary", "Y": "Growth"}
    return alternatives, criteria, scores, names


def run(alternatives, criteria, scores, names, lo=MIN, hi=MAX):
    return sensitivity.analyze(alternatives, criteria, scores, names, score_min=lo, score_max=hi)


def close(value: Decimal, expected: float, tol: float = 0.01) -> bool:
    return abs(float(value) - expected) <= tol


# ---- hand-checked worked example ---------------------------------------------------------------


def test_report_headline_matches_hand_arithmetic():
    report = run(*worked_example())
    assert report.leader.name == "Option A" and report.runner_up.name == "Option B"
    assert close(report.leader.points, 66.667) and close(report.runner_up.points, 48.148)
    assert close(report.margin_points, 18.519)


def test_tornado_values_match_hand_arithmetic_and_sort_by_swing():
    bars = {b.name: b for b in run(*worked_example()).tornado}
    salary, growth = bars["Salary"], bars["Growth"]
    # Salary at 50 % (weights 1,1) is an exact tie; at 150 % (3,1): 0.7222 - 0.4444.
    assert close(salary.low_margin_points, 0.0) and close(salary.high_margin_points, 27.778)
    # Growth at 50 % (2,.5): 0.7556 - 0.4222; at 150 % (2,1.5): 0.6032 - 0.5238.
    assert close(growth.low_margin_points, 33.333) and close(growth.high_margin_points, 7.937)
    assert close(salary.swing_points, 27.778) and close(growth.swing_points, 25.397)
    assert [b.name for b in run(*worked_example()).tornado] == ["Salary", "Growth"]
    assert close(salary.share_percent, 66.667) and close(growth.share_percent, 33.333)
    assert not salary.flips and not growth.flips  # the leader never actually changes in range


def test_weight_flips_match_the_closed_form():
    flips = {f.name: f for f in run(*worked_example()).weight_flips}
    salary, growth = flips["Salary"], flips["Growth"]
    # Salary must FALL from raw weight 2 to 1 (share 66.7 % -> 50 %); Growth must RISE from 1 to 2.
    assert salary.direction == "decrease" and salary.flip_weight == D(1)
    assert close(salary.current_share_percent, 66.667) and close(salary.flip_share_percent, 50.0)
    assert close(salary.delta_points, -16.667)
    assert growth.direction == "increase" and growth.flip_weight == D(2)
    assert close(growth.current_share_percent, 33.333) and close(growth.flip_share_percent, 50.0)
    assert close(growth.delta_points, 16.667)
    assert salary.challenger_name == growth.challenger_name == "Option B"


def test_score_flips_are_boundary_exclusive_and_only_feasible_ones_are_reported():
    flips = run(*worked_example()).score_flips
    # Salary needs exactly 2.5 points to tie (the leader keeps ties), so more than 2.5 -> 2.6.
    assert [(f.criterion_name, f.role, f.delta) for f in flips] == [
        ("Salary", "leader_down", D("2.6")),
        ("Salary", "challenger_up", D("2.6")),
    ]
    assert flips[0].current_score == D(9) and flips[0].flip_score == D("6.4")
    assert flips[1].current_score == D(4) and flips[1].flip_score == D("6.6")
    # Growth would need 5.1 points: unreachable on a 1..10 scale, so it is not offered.
    assert all(f.criterion_name != "Growth" for f in flips)


def test_flip_scores_really_flip_and_the_step_before_does_not():
    alternatives, criteria, scores, names = worked_example()
    flip = run(alternatives, criteria, scores, names).score_flips[0]

    def leader_with(a: str, c: str, score: Decimal) -> str:
        changed = [
            cell(s.alternative_id, s.criterion_id, score)
            if (s.alternative_id, s.criterion_id) == (a, c)
            else s
            for s in scores
        ]
        result = engine.calculate_ranking(
            alternatives, criteria, changed, score_min=MIN, score_max=MAX
        )
        return result.ranking[0].alternative_id

    assert leader_with("A", "X", flip.flip_score) == "B"
    assert leader_with("A", "X", flip.flip_score + D("0.1")) == "A"


def test_an_exact_boundary_always_goes_one_step_past_regardless_of_listing_order():
    # Exactly representable on a 0..10 scale: T_A = 0.6, T_B = 0.5, share_X = 0.5, so the margin is
    # erased at exactly 2.0 points. At that tie the engine's choice is decided by decimal noise, so
    # the reported flip must be strictly beyond it (2.1) whichever option is listed first.
    zero, ten = D(0), D(10)
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 1), crit("Y", 1)]
    scores = [cell("A", "X", 9), cell("A", "Y", 3), cell("B", "X", 4), cell("B", "Y", 6)]
    names = {"X": "X", "Y": "Y"}
    for order in (alternatives, list(reversed(alternatives))):
        flip = next(
            f
            for f in run(order, criteria, scores, names, zero, ten).score_flips
            if f.role == "leader_down" and f.criterion_name == "X"
        )
        assert flip.delta == D("2.1") and flip.flip_score == D("6.9")
        moved = [
            cell(s.alternative_id, s.criterion_id, flip.flip_score)
            if (s.alternative_id, s.criterion_id) == ("A", "X")
            else s
            for s in scores
        ]
        result = engine.calculate_ranking(order, criteria, moved, score_min=zero, score_max=ten)
        assert result.ranking[0].alternative_id == "B"


def test_an_exact_tie_today_flips_at_the_current_weight():
    # A and B tie at today's weights; A only leads because it is listed first.
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 1), crit("Y", 1)]
    scores = [cell("A", "X", 9), cell("A", "Y", 3), cell("B", "X", 4), cell("B", "Y", 8)]
    report = run(alternatives, criteria, scores, {"X": "X", "Y": "Y"})
    assert report.margin_points == 0
    assert {f.name: f.delta_points for f in report.weight_flips} == {"X": 0, "Y": 0}


def test_ties_are_not_flips_and_score_flip_needs_more_than_the_boundary():
    # Exactly tied totals: the leader (first in input order) keeps the lead, so any change flips it.
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 1), crit("Y", 1)]
    scores = [cell("A", "X", 9), cell("A", "Y", 3), cell("B", "X", 4), cell("B", "Y", 8)]
    report = run(alternatives, criteria, scores, {"X": "X", "Y": "Y"})
    assert report.margin_points == 0
    assert all(f.delta == D("0.1") for f in report.score_flips)
    assert any(f.delta_points == 0 for f in report.weight_flips)


# ---- structural cases --------------------------------------------------------------------------


def test_cost_criteria_flip_in_the_opposite_score_direction():
    # Cost is "lower is better", so the leader gets WORSE by scoring higher, and the challenger
    # gets better by scoring lower. 0..10 scale keeps every number exact.
    zero, ten = D(0), D(10)
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("C", 1, "cost"), crit("Y", 1)]
    scores = [cell("A", "C", 2), cell("A", "Y", 6), cell("B", "C", 4), cell("B", "Y", 5)]
    report = run(alternatives, criteria, scores, {"C": "Cost", "Y": "Quality"}, zero, ten)
    leader_down = next(
        f for f in report.score_flips if f.role == "leader_down" and f.criterion_name == "Cost"
    )
    challenger_up = next(
        f for f in report.score_flips if f.role == "challenger_up" and f.criterion_name == "Cost"
    )
    assert leader_down.flip_score == D("5.1") > leader_down.current_score  # a higher cost is worse
    assert (
        challenger_up.flip_score == D("0.9") < challenger_up.current_score
    )  # a lower cost is better


def test_a_lone_criterion_has_no_weight_flips():
    alternatives = [alt("A"), alt("B")]
    report = run(
        alternatives, [crit("X", 3)], [cell("A", "X", 8), cell("B", "X", 2)], {"X": "Only"}
    )
    assert report.weight_flips == []
    assert report.tornado[0].name == "Only"
    assert (
        report.tornado[0].swing_points == 0
    )  # a lone criterion can't be re-weighted into a different answer


def test_inactive_criteria_are_ignored_everywhere():
    alternatives, criteria, scores, names = worked_example()
    criteria.append(crit("Z", 50, active=False))
    names["Z"] = "Ignored"
    report = run(alternatives, criteria, scores, names)
    assert "Ignored" not in {b.name for b in report.tornado}
    assert "Ignored" not in {f.name for f in report.weight_flips}
    assert close(report.margin_points, 18.519)


def test_a_dominant_leader_has_no_weight_flip_and_no_feasible_score_flip():
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 1), crit("Y", 1)]
    scores = [cell("A", "X", 10), cell("A", "Y", 10), cell("B", "X", 1), cell("B", "Y", 1)]
    report = run(alternatives, criteria, scores, {"X": "X", "Y": "Y"})
    assert report.weight_flips == []  # better on every criterion: no weighting can help B
    assert report.score_flips == []
    assert all(not b.flips for b in report.tornado)


def test_a_decreasing_flip_that_would_need_a_non_positive_weight_is_not_reported():
    # A is better on Y only slightly and far worse on X is impossible here; instead make X's
    # root land at <= 0: A beats B on both, so no root exists for a decrease either.
    alternatives = [alt("A"), alt("B")]
    criteria = [crit("X", 2), crit("Y", 1)]
    scores = [cell("A", "X", 9), cell("A", "Y", 9), cell("B", "X", 3), cell("B", "Y", 8)]
    assert run(alternatives, criteria, scores, {"X": "X", "Y": "Y"}).weight_flips == []


def test_unrankable_inputs_raise_the_same_errors_as_the_ranking():
    alternatives, criteria, scores, names = worked_example()
    with pytest.raises(engine.MissingScoresError):
        run(alternatives, criteria, scores[:-1], names)
    with pytest.raises(engine.InsufficientAlternativesError):
        run(alternatives[:1], criteria, scores, names)
    with pytest.raises(engine.NoActiveCriteriaError):
        run(alternatives, [crit("X", 1, active=False)], scores, names)


def test_the_list_sizes_are_capped():
    rng = random.Random(7)
    alternatives = [alt(f"A{i}") for i in range(3)]
    criteria = [crit(f"C{i}", rng.randint(1, 5)) for i in range(9)]
    scores = [cell(a.id, c.id, rng.randint(1, 10)) for a in alternatives for c in criteria]
    names = {c.id: c.id for c in criteria}
    report = run(alternatives, criteria, scores, names)
    assert len(report.weight_flips) <= sensitivity.MAX_WEIGHT_FLIPS
    assert len(report.score_flips) <= sensitivity.MAX_SCORE_FLIPS
    assert len(report.tornado) == 9


# ---- property tests against the real engine ----------------------------------------------------


def random_decision(rng: random.Random):
    alternatives = [alt(f"A{i}") for i in range(rng.randint(2, 4))]
    criteria = [
        crit(f"C{i}", rng.choice([1, 2, 3, 4, 5, "2.5"]), rng.choice(["benefit", "cost"]))
        for i in range(rng.randint(2, 5))
    ]
    scores = [
        cell(a.id, c.id, rng.choice([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "5.5"]))
        for a in alternatives
        for c in criteria
    ]
    return alternatives, criteria, scores, {c.id: c.id for c in criteria}


def leader_of(alternatives, criteria, scores) -> str:
    return (
        engine.calculate_ranking(alternatives, criteria, scores, score_min=MIN, score_max=MAX)
        .ranking[0]
        .alternative_id
    )


def test_weight_flips_are_exact_against_the_engine_on_random_decisions():
    rng = random.Random(20261004)
    checked = 0
    eps = D("0.0005")
    for _ in range(150):
        alternatives, criteria, scores, names = random_decision(rng)
        report = run(alternatives, criteria, scores, names)
        if report.margin_points < D("1e-6"):
            continue  # exact ties are decided by decimal noise; covered by the dedicated tie tests
        leader = report.leader.alternative_id
        for flip in report.weight_flips:

            def with_weight(w: Decimal, flip=flip, criteria=criteria):
                return [
                    engine.CriterionInput(
                        c.id, w if c.id == flip.criterion_id else c.weight, c.direction, True
                    )
                    for c in criteria
                ]

            past = (
                flip.flip_weight + eps if flip.direction == "increase" else flip.flip_weight - eps
            )
            assert past > 0
            assert leader_of(alternatives, with_weight(past), scores) != leader, flip
            held = (
                flip.flip_weight - eps if flip.direction == "increase" else flip.flip_weight + eps
            )
            if abs(flip.flip_weight - flip.current_weight) > 2 * eps:
                assert leader_of(alternatives, with_weight(held), scores) == leader, flip
            checked += 1
    assert checked > 40  # the seed produces plenty of real flips; guards against a vacuous test


def test_score_flips_are_exact_against_the_engine_on_random_decisions():
    rng = random.Random(424242)
    checked = 0
    for _ in range(150):
        alternatives, criteria, scores, names = random_decision(rng)
        report = run(alternatives, criteria, scores, names)
        if report.margin_points < D("1e-6"):
            continue
        leader = report.leader.alternative_id
        for flip in report.score_flips:

            def with_cell(score: Decimal, flip=flip, scores=scores):
                return [
                    cell(s.alternative_id, s.criterion_id, score)
                    if (s.alternative_id, s.criterion_id)
                    == (flip.alternative_id, flip.criterion_id)
                    else s
                    for s in scores
                ]

            assert leader_of(alternatives, criteria, with_cell(flip.flip_score)) != leader, flip
            # Half a step short of the reported change is strictly before the boundary in every
            # case. (A full step short can land exactly ON an exact tie, which decimal noise decides.)
            if flip.delta > D("0.15"):
                back = (
                    flip.current_score
                    + (flip.flip_score - flip.current_score) * (flip.delta - D("0.15")) / flip.delta
                )
                assert leader_of(alternatives, criteria, with_cell(back)) == leader, flip
            checked += 1
    assert checked > 40
