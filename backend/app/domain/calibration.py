"""
Calibration (FX-06, FR-016, docs/14 D-5/OQ-2). Pure: no I/O, no AI. Takes the user's submitted
outcome reviews (one per commitment) and measures how well their stated confidence predicted how
things turned out.

Definitions (shown to the user in the UI):
  - A decision "worked out" when satisfaction >= 4 on the 1-5 scale.
  - Confidence is the 0-100 figure given at commitment, read as the chance it would work out.
  - Brier score: mean squared gap between confidence and the outcome (0 = perfect, 0.25 = no better
    than always saying 50%). Skill compares it with always predicting the user's own hit rate.
  - Reliability curve: reviews grouped by confidence band, with the share that worked out per band.
  - A "hit" is a prediction on the right side of 50% (>= 50 and it worked, or < 50 and it did not).

Small samples are reported as such rather than dressed up: nothing is called over- or
under-confident without enough reviews behind it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

SUCCESS_SATISFACTION = 4
MIN_REVIEWS = 5
MIN_CATEGORY_REVIEWS = 3
GAP_THRESHOLD = 0.10  # 10 percentage points between stated confidence and actual hit rate
UNCATEGORISED = "Uncategorised"
BANDS = ((0, 19), (20, 39), (40, 59), (60, 79), (80, 100))


@dataclass(frozen=True)
class Review:
    category: str
    confidence: int  # 0..100
    satisfaction: int  # 1..5
    submitted_at: datetime

    @property
    def worked(self) -> bool:
        return self.satisfaction >= SUCCESS_SATISFACTION


def _mean(values: list[float]) -> float | None:
    return round(sum(values) / len(values), 3) if values else None


def _verdict(avg_confidence: float, hit_rate: float) -> str:
    gap = avg_confidence / 100 - hit_rate
    if gap > GAP_THRESHOLD:
        return "overconfident"
    if gap < -GAP_THRESHOLD:
        return "underconfident"
    return "well_calibrated"


def _bands(reviews: list[Review]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for low, high in BANDS:
        inside = [r for r in reviews if low <= r.confidence <= high]
        out.append(
            {
                "confidence_range": f"{low}-{high}",
                "count": len(inside),
                "avg_confidence": _mean([float(r.confidence) for r in inside]),
                "success_rate": _mean([1.0 if r.worked else 0.0 for r in inside]),
                "avg_satisfaction": _mean([float(r.satisfaction) for r in inside]),
            }
        )
    return out


def _categories(reviews: list[Review]) -> list[dict[str, Any]]:
    groups: dict[str, list[Review]] = {}
    for r in reviews:
        groups.setdefault(r.category.strip() or UNCATEGORISED, []).append(r)
    out: list[dict[str, Any]] = []
    for name, group in groups.items():
        avg_conf = sum(r.confidence for r in group) / len(group)
        hit_rate = sum(1 for r in group if r.worked) / len(group)
        enough = len(group) >= MIN_CATEGORY_REVIEWS
        out.append(
            {
                "category": name,
                "count": len(group),
                "avg_confidence": round(avg_conf, 1),
                "success_rate": round(hit_rate, 3),
                "gap_points": round(avg_conf - hit_rate * 100, 1),
                "verdict": _verdict(avg_conf, hit_rate) if enough else "not_enough_data",
            }
        )
    out.sort(key=lambda c: (-c["count"], c["category"]))
    return out


def _streaks(reviews: list[Review]) -> dict[str, int]:
    best = current = 0
    for r in sorted(reviews, key=lambda r: r.submitted_at):
        hit = (r.confidence >= 50) == r.worked
        current = current + 1 if hit else 0
        best = max(best, current)
    return {"current": current, "best": best}


def _note(count: int, verdict: str | None) -> str:
    if count == 0:
        return "Submit an outcome review on a committed decision to start your calibration."
    if count < MIN_REVIEWS:
        return (
            f"{count} of {MIN_REVIEWS} reviews so far. Patterns appear once there are at least "
            f"{MIN_REVIEWS}; until then these figures are just your own records."
        )
    return {
        "overconfident": "Decisions have worked out less often than your confidence suggested.",
        "underconfident": "Decisions have worked out more often than your confidence suggested.",
        "well_calibrated": "Your confidence has matched how often decisions worked out.",
    }[verdict or "well_calibrated"]


def analyze(reviews: list[Review]) -> dict[str, Any]:
    n = len(reviews)
    base: dict[str, Any] = {
        "reviews_count": n,
        "sufficient": n >= MIN_REVIEWS,
        "min_reviews": MIN_REVIEWS,
        "success_threshold": SUCCESS_SATISFACTION,
        "avg_confidence": None,
        "avg_satisfaction": None,
        "success_rate": None,
        "brier_score": None,
        "brier_baseline": None,
        "brier_skill": None,
        "verdict": None,
        "buckets": _bands(reviews),
        "categories": _categories(reviews),
        "streaks": _streaks(reviews),
    }
    if n:
        avg_conf = sum(r.confidence for r in reviews) / n
        hit_rate = sum(1 for r in reviews if r.worked) / n
        brier = sum((r.confidence / 100 - (1.0 if r.worked else 0.0)) ** 2 for r in reviews) / n
        baseline = hit_rate * (1 - hit_rate)
        base.update(
            avg_confidence=round(avg_conf, 1),
            avg_satisfaction=_mean([float(r.satisfaction) for r in reviews]),
            success_rate=round(hit_rate, 3),
            brier_score=round(brier, 3),
            brier_baseline=round(baseline, 3),
            brier_skill=round(1 - brier / baseline, 3) if baseline > 0 else None,
            verdict=_verdict(avg_conf, hit_rate) if n >= MIN_REVIEWS else None,
        )
    base["note"] = _note(n, base["verdict"])
    return base
