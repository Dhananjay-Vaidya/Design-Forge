"""Schemas for commitments, outcome reviews and calibration (FX-06, API-31..34, API-36)."""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

OutcomeStatusLiteral = Literal["SCHEDULED", "DUE", "SUBMITTED", "CANCELLED"]


class CommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alternative_id: UUID
    confidence: int = Field(ge=0, le=100, description="Chance (0-100) this will work out")
    rationale: str = Field(default="", max_length=2000)


class CommitmentRead(BaseModel):
    id: UUID
    decision_id: UUID
    alternative_id: UUID
    alternative_name: str
    confidence: int
    rationale: str
    is_active: bool
    snapshot_version: int
    created_at: datetime


class OutcomeCreate(BaseModel):
    """Schedule a review (due_at), record one now (satisfaction), or both."""

    model_config = ConfigDict(extra="forbid")

    due_at: datetime | None = None
    satisfaction: int | None = Field(default=None, ge=1, le=5)
    result_notes: str = Field(default="", max_length=2000)


class OutcomeSubmit(BaseModel):
    model_config = ConfigDict(extra="forbid")

    satisfaction: int = Field(ge=1, le=5)
    result_notes: str = Field(default="", max_length=2000)


class OutcomeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    decision_id: UUID
    commitment_id: UUID
    due_at: datetime
    status: OutcomeStatusLiteral
    satisfaction: int | None
    result_notes: str
    submitted_at: datetime | None
    created_at: datetime


# ---- calibration ---------------------------------------------------------------------------------

Verdict = Literal["overconfident", "underconfident", "well_calibrated"]


class CalibrationBucket(BaseModel):
    confidence_range: str
    count: int
    avg_confidence: float | None
    success_rate: float | None
    avg_satisfaction: float | None


class CategoryCalibration(BaseModel):
    category: str
    count: int
    avg_confidence: float
    success_rate: float
    gap_points: float
    verdict: Verdict | Literal["not_enough_data"]


class Streaks(BaseModel):
    current: int
    best: int


class CalibrationResponse(BaseModel):
    deterministic: bool = True
    reviews_count: int
    sufficient: bool
    min_reviews: int
    success_threshold: int
    avg_confidence: float | None
    avg_satisfaction: float | None
    success_rate: Annotated[float | None, Field(description="Share rated >= success_threshold")]
    brier_score: float | None
    brier_baseline: float | None
    brier_skill: float | None
    verdict: Verdict | None
    buckets: list[CalibrationBucket]
    categories: list[CategoryCalibration]
    streaks: Streaks
    note: str
