"""Schemas for snapshots, the version diff (FX-04), sensitivity and the explainer (FX-03, FX-05)."""

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, ConfigDict, Field

# Points are shown to one decimal in the UI; keep three in the API so nothing is lost twice.
Pts = Annotated[float, AfterValidator(lambda v: round(v, 3))]


class SnapshotCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str = Field(default="", max_length=120)


class SnapshotSummary(BaseModel):
    id: UUID
    version: int
    reason: Literal["manual", "analysis", "commitment"]
    label: str
    created_at: datetime
    complete: bool  # a ranking existed when it was taken
    leader: str | None
    leader_points: Pts | None


class SnapshotRead(SnapshotSummary):
    payload: dict[str, Any]


class SnapshotRef(BaseModel):
    """One side of a comparison. `version` is null (and `is_current` true) for the live decision."""

    version: int | None
    label: str
    created_at: datetime | None
    is_current: bool


class FieldChange(BaseModel):
    field: str
    before: str | None
    after: str | None


class AlternativeChange(BaseModel):
    alternative_id: str
    name: str
    kind: Literal["added", "removed", "renamed"]
    before_name: str | None


class CriterionChange(BaseModel):
    criterion_id: str
    name: str
    kind: Literal["added", "removed", "changed"]
    changes: list[FieldChange]
    share_before: Pts | None
    share_after: Pts | None


class ScoreChange(BaseModel):
    alternative_id: str
    alternative: str
    criterion_id: str
    criterion: str
    before: float
    after: float


class RankMove(BaseModel):
    alternative_id: str
    name: str
    rank_before: int | None
    rank_after: int | None
    points_before: Pts | None
    points_after: Pts | None
    points_delta: Pts | None
    rank_delta: int | None  # positive = moved up the table


class RankingDiff(BaseModel):
    available_before: bool
    available_after: bool
    leader_before: str | None
    leader_after: str | None
    leader_changed: bool
    moves: list[RankMove]


class SnapshotDiff(BaseModel):
    a: SnapshotRef
    b: SnapshotRef
    summary: list[str]
    decision_changes: list[FieldChange]
    alternatives: list[AlternativeChange]
    criteria: list[CriterionChange]
    scores: list[ScoreChange]
    score_cells_added: int
    score_cells_removed: int
    ranking: RankingDiff


# ---- sensitivity lab (FX-03) -------------------------------------------------------------------


class LeaderRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    alternative_id: str
    name: str
    points: Pts


class TornadoBar(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    criterion_id: str
    name: str
    share_percent: Pts
    low_margin_points: Pts
    high_margin_points: Pts
    low_leader: str
    high_leader: str
    swing_points: Pts
    flips: bool


class WeightFlip(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    criterion_id: str
    name: str
    challenger_id: str
    challenger_name: str
    direction: Literal["increase", "decrease"]
    current_weight: Pts
    flip_weight: Pts
    current_share_percent: Pts
    flip_share_percent: Pts
    delta_points: Pts


class ScoreFlip(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    alternative_id: str
    alternative_name: str
    criterion_id: str
    criterion_name: str
    role: Literal["leader_down", "challenger_up"]
    current_score: Pts
    flip_score: Pts
    delta: Pts
    feasible: bool


class SensitivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    deterministic: bool = True
    leader: LeaderRef
    runner_up: LeaderRef
    margin_points: Pts
    tornado: list[TornadoBar]
    weight_flips: list[WeightFlip]
    score_flips: list[ScoreFlip]
    tornado_low_factor: float
    tornado_high_factor: float


# ---- explainer (FX-05) -------------------------------------------------------------------------


class ExplainDriver(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    criterion: str
    share_percent: Pts
    points: Pts


class ExplainEdge(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    criterion: str
    points: Pts


class ExplanationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    deterministic: bool = True
    headline: str
    drivers: list[ExplainDriver]
    ahead_on: list[ExplainEdge]
    behind_on: list[ExplainEdge]
    stability: str
    flip_hint: str
    text: str
