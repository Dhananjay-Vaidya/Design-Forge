"""Schemas for the public home-page drafter and the signed-in handoff (doc 20, AX-22)."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DraftRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str = Field(min_length=10, max_length=1000)


class ScaffoldOption(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    note: str = Field(default="", max_length=500)


class ScaffoldCriterion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=500)
    direction: Literal["benefit", "cost"]


class ScaffoldIn(BaseModel):
    """What the browser sends back. No score or weight fields exist, so none can be smuggled in."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=200)
    category: str = Field(default="", max_length=64)
    options: list[ScaffoldOption] = Field(min_length=1, max_length=20)
    criteria: list[ScaffoldCriterion] = Field(min_length=1, max_length=20)


class ScaffoldOut(BaseModel):
    title: str
    category: str
    options: list[ScaffoldOption]
    criteria: list[ScaffoldCriterion]


class DraftResponse(BaseModel):
    status: Literal["ok", "capped", "refused", "degraded"]
    scaffold: ScaffoldOut | None = None
    draft_token: str | None = None
    drafts_remaining: int | None = None
    message: str | None = None
    from_cache: bool = False
    advisory: Literal[True] = True


class GuideStatus(BaseModel):
    enabled: bool
    free_drafts_per_day: int
    drafts_remaining: int


class FromScaffoldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scaffold: ScaffoldIn
    draft_token: str = Field(min_length=1, max_length=4096)
