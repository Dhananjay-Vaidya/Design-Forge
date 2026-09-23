"""
Pydantic v2 schemas for the decisions domain — mirrors apps/decisions/serializers.py (Django)
field-for-field (docs/fastapi-migration-audit.md §16 parity matrix).
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.config import get_settings
from app.models.decision import DecisionStatus

settings = get_settings()

DirectionLiteral = Literal["benefit", "cost"]
StatusLiteral = Literal["DRAFT", "SCORED", "COMMITTED", "UNDER_REVIEW", "REVIEWED", "ARCHIVED"]


class DecisionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    context: str
    category: str
    status: StatusLiteral
    deadline: date | None
    created_at: datetime
    updated_at: datetime
    archived_at: datetime | None


class DecisionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    context: str = ""
    category: str = Field(default="", max_length=64)
    deadline: date | None = None


class DecisionPatchRequest(BaseModel):
    """API-11 — `status` may only be set to ARCHIVED (other transitions are automatic/dedicated)."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=200)
    context: str | None = None
    category: str | None = Field(default=None, max_length=64)
    deadline: date | None = None
    status: StatusLiteral | None = None

    @field_validator("status")
    @classmethod
    def _only_archived(cls, value: str | None) -> str | None:
        if value is not None and value != DecisionStatus.ARCHIVED:
            raise ValueError(
                "Status can only be set to ARCHIVED directly; other transitions are automatic "
                "or happen through dedicated actions (commit, outcome review)."
            )
        return value


class DecisionListParams(BaseModel):
    status: StatusLiteral | None = None
    category: str | None = None
    ordering: str = "-updated_at"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


class AlternativeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    # Wire name is `decision` (unchanged from the Django serializers); ORM attribute is decision_id.
    decision_id: UUID = Field(serialization_alias="decision")
    name: str
    description: str
    position: int
    created_at: datetime
    updated_at: datetime


class AlternativeCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = ""
    position: int = 0


class AlternativePatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    position: int | None = None


class CriterionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    decision_id: UUID = Field(serialization_alias="decision")
    name: str
    description: str
    weight: Decimal
    direction: DirectionLiteral
    is_active: bool
    position: int
    created_at: datetime
    updated_at: datetime


class CriterionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    weight: Decimal = Field(gt=0)
    direction: DirectionLiteral
    description: str = ""
    is_active: bool = True
    position: int = 0


class CriterionPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    weight: Decimal | None = Field(default=None, gt=0)
    direction: DirectionLiteral | None = None
    description: str | None = None
    is_active: bool | None = None
    position: int | None = None


class AlternativeScoreRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    # Wire names are `alternative` / `criterion` (unchanged from the Django serializers).
    alternative_id: UUID = Field(serialization_alias="alternative")
    criterion_id: UUID = Field(serialization_alias="criterion")
    score: Decimal
    rationale: str
    created_at: datetime
    updated_at: datetime


class ScoreCellRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alternative_id: UUID
    criterion_id: UUID
    score: Decimal = Field(ge=settings.score_min, le=settings.score_max)
    rationale: str = ""


class ScoreUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scores: list[ScoreCellRequest]


class MissingCellSchema(BaseModel):
    alternative_id: str
    criterion_id: str


class ScoreUpsertResponse(BaseModel):
    updated: int
    missing_cells: list[MissingCellSchema]


class RankedAlternativeSchema(BaseModel):
    rank: int
    alternative_id: str
    name: str
    total: Decimal
    breakdown: dict[str, Decimal]


class SensitivitySchema(BaseModel):
    leader_stable: bool
    note: str
    margin: Decimal


class RankingResponse(BaseModel):
    decision_id: str
    deterministic: bool
    computed_at: datetime
    calculation_method: str
    weights_normalized: dict[str, Decimal]
    ranking: list[RankedAlternativeSchema]
    sensitivity: SensitivitySchema
