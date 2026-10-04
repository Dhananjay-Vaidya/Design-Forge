"""Calibration maths (FX-06). Expected values are worked out by hand in the comments."""

from datetime import UTC, datetime, timedelta

import pytest

from app.domain import calibration
from app.domain.calibration import Review, analyze

T0 = datetime(2026, 1, 1, tzinfo=UTC)


def reviews(rows: list[tuple[str, int, int]]) -> list[Review]:
    return [
        Review(cat, conf, sat, T0 + timedelta(days=i)) for i, (cat, conf, sat) in enumerate(rows)
    ]


# conf/satisfaction -> worked?: 80/5 yes, 80/2 no, 60/4 yes, 30/1 no, 90/5 yes
FIVE = reviews([("Career", 80, 5), ("Career", 80, 2), ("Career", 60, 4), ("", 30, 1), ("", 90, 5)])


def test_headline_figures_match_hand_arithmetic():
    r = analyze(FIVE)
    assert r["reviews_count"] == 5 and r["sufficient"] is True
    assert r["avg_confidence"] == 68.0  # (80+80+60+30+90)/5
    assert r["avg_satisfaction"] == 3.4  # (5+2+4+1+5)/5
    assert r["success_rate"] == 0.6  # 3 of 5 rated >= 4
    # Brier: (.04 + .64 + .16 + .09 + .01) / 5 = .188 ; baseline .6*.4 = .24 ; skill 1-.188/.24
    assert r["brier_score"] == 0.188
    assert r["brier_baseline"] == 0.24
    assert r["brier_skill"] == 0.217
    assert r["verdict"] == "well_calibrated"  # gap .68 - .60 = .08 < .10
    assert r["note"] == "Your confidence has matched how often decisions worked out."


def test_reliability_bands():
    bands = {b["confidence_range"]: b for b in analyze(FIVE)["buckets"]}
    assert list(bands) == ["0-19", "20-39", "40-59", "60-79", "80-100"]
    assert bands["0-19"]["count"] == 0 and bands["0-19"]["success_rate"] is None
    assert (bands["20-39"]["count"], bands["20-39"]["success_rate"]) == (1, 0.0)
    assert (bands["60-79"]["count"], bands["60-79"]["success_rate"]) == (1, 1.0)
    top = bands["80-100"]
    assert (top["count"], top["avg_confidence"], top["success_rate"], top["avg_satisfaction"]) == (
        3,
        83.333,
        0.667,
        4.0,
    )


def test_band_edges_belong_to_exactly_one_band():
    edge = analyze(reviews([("", c, 3) for c in (0, 19, 20, 39, 40, 59, 60, 79, 80, 100)]))
    assert [b["count"] for b in edge["buckets"]] == [2, 2, 2, 2, 2]


def test_streaks_count_calls_on_the_right_side_of_fifty():
    # hit, miss, hit, hit (30% and it failed), hit
    assert analyze(FIVE)["streaks"] == {"current": 3, "best": 3}
    miss_last = analyze(reviews([("", 70, 5), ("", 70, 5), ("", 70, 1)]))
    assert miss_last["streaks"] == {"current": 0, "best": 2}


def test_streaks_follow_submission_order_not_input_order():
    shuffled = list(reversed(FIVE))
    assert analyze(shuffled)["streaks"] == analyze(FIVE)["streaks"]


def test_categories_need_enough_reviews_before_being_judged():
    cats = {c["category"]: c for c in analyze(FIVE)["categories"]}
    career = cats["Career"]  # 80, 80, 60 -> avg 73.3, 2 of 3 worked
    assert (career["count"], career["avg_confidence"], career["success_rate"]) == (3, 73.3, 0.667)
    assert career["gap_points"] == 6.7 and career["verdict"] == "well_calibrated"
    other = cats["Uncategorised"]
    assert other["count"] == 2 and other["verdict"] == "not_enough_data"


@pytest.mark.parametrize(
    "conf,sats,verdict",
    [
        (90, [2] * 5, "overconfident"),
        (30, [5] * 5, "underconfident"),
        (70, [5] * 7 + [1] * 3, "well_calibrated"),
    ],
)
def test_over_and_under_confidence(conf, sats, verdict):
    r = analyze(reviews([("Money", conf, sat) for sat in sats]))
    assert r["verdict"] == verdict
    assert r["categories"][0]["verdict"] == verdict


def test_small_samples_are_reported_as_such_not_judged():
    r = analyze(reviews([("", 90, 1), ("", 90, 1)]))
    assert r["sufficient"] is False and r["verdict"] is None
    assert r["brier_score"] == 0.81  # still shown as the user's own record
    assert "2 of 5 reviews so far" in r["note"]


def test_no_reviews():
    r = analyze([])
    assert r["reviews_count"] == 0 and r["brier_score"] is None and r["success_rate"] is None
    assert r["streaks"] == {"current": 0, "best": 0}
    assert "Submit an outcome review" in r["note"]
    assert [b["count"] for b in r["buckets"]] == [0] * 5


def test_perfect_forecaster_has_no_skill_baseline_to_beat():
    r = analyze(reviews([("", 100, 5)] * 5))
    assert r["brier_score"] == 0.0 and r["brier_baseline"] == 0.0
    assert r["brier_skill"] is None  # nothing to compare against when every outcome is the same


def test_success_threshold_is_four():
    assert calibration.SUCCESS_SATISFACTION == 4
    assert Review("", 50, 4, T0).worked and not Review("", 50, 3, T0).worked
