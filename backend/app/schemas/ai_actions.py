"""Schemas for the AI-action framework (doc 18 AX-INF-1)."""

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ActionInfo(BaseModel):
    name: str
    title: str
    description: str
    kind: Literal["proposal", "advisory"]
    prompt_version: str


class RunActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    input: dict[str, Any] = Field(default_factory=dict)


class ProposalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    decision_id: UUID
    action: str
    kind: Literal["proposal", "advisory"]
    status: Literal["QUEUED", "READY", "ACCEPTED", "REJECTED", "EXPIRED"]
    prompt_version: str
    model: str
    payload: dict[str, Any]
    resolution: dict[str, Any]
    cache_hit: bool
    created_at: datetime
    expires_at: datetime
    resolved_at: datetime | None
    advisory: Literal[True] = True  # AI output is always advisory until a person accepts an item


class RunActionResponse(BaseModel):
    status: Literal["READY", "FAILED"]
    proposal: ProposalRead | None
    failure_code: str | None = None
    message: str | None = None
    remaining_today: int | None = None


class AcceptRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_ids: list[str] = Field(min_length=1, max_length=50)


class RejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item_ids: list[str] | None = Field(default=None, max_length=50)
