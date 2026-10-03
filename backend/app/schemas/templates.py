"""Schemas for decision templates (FX-01 / FX-16) and demo mode (FX-20)."""

from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

DirectionLiteral = Literal["benefit", "cost"]


class TemplateCriterionRead(BaseModel):
    name: str
    description: str
    weight: Decimal
    direction: DirectionLiteral


class TemplateRead(BaseModel):
    """`id` is `builtin:<slug>` for catalogue templates and a UUID for the caller's own."""

    id: str
    kind: Literal["builtin", "mine"]
    name: str
    description: str
    category: str
    title_hint: str
    criteria: list[TemplateCriterionRead]
    option_hints: list[str]


class TemplateCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision_id: UUID
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)


class DecisionFromTemplateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    template_id: str = Field(min_length=1, max_length=64)
    title: str = Field(min_length=1, max_length=200)
    context: str = ""
    category: str | None = Field(default=None, max_length=64)
    deadline: date | None = None
    options: list[str] = Field(default_factory=list, max_length=20)


class DemoStatus(BaseModel):
    decision_id: UUID | None
