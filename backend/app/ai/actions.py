"""
AX-INF-1 — the unified AI-action framework (doc 18).

Every AI capability is a registered `AIAction`: a versioned prompt, a response schema, a payload
builder that does the referential checks, and (for suggestions) an `apply_item` that performs the
NORMAL deterministic write through the existing services. The runner (`app/ai/runner.py`) owns
everything else (guards, cache, validation, storage), so there is exactly one AI code path:

    prompt vN -> model -> JSON -> schema + referential checks -> AIProposal (violet, advisory)
        -> user accepts items -> apply_item -> ordinary audited write (teal)

An action cannot write a score, weight or ranking by construction: it only returns payload data,
and `apply_item` is only ever called after the person accepts that item.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision import Decision
from app.observability import metrics

ActionKind = Literal["proposal", "advisory"]
ModelTier = Literal["reasoning", "light"]


class ActionOutputError(Exception):
    """The model's answer was unusable. Discarded, nothing is shown, the user's quota is refunded."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class EmptyInput(BaseModel):
    model_config = ConfigDict(extra="forbid")


@dataclass(frozen=True)
class ActionContext:
    decision: Decision
    context: dict[str, Any]  # minimised decision data (app/ai/context.py)
    input: BaseModel


# (db, decision, item) -> {"type": "criterion", "id": "<uuid>"}; commits through the normal services.
ApplyItem = Callable[[AsyncSession, Decision, dict[str, Any]], Awaitable[dict[str, Any]]]

# (db, decision, context) -> None. Adds action-specific facts to the minimised context (for example the
# commitment) and raises a 400 ValidationAppError when a prerequisite is missing. Runs before any cost.
Prepare = Callable[[AsyncSession, Decision, dict[str, Any]], Awaitable[None]]


@dataclass(frozen=True)
class AIAction:
    name: str
    title: str
    description: str
    kind: ActionKind
    prompt_version: str
    model_tier: ModelTier
    system_prompt: str
    response_model: type[BaseModel]
    build_user_prompt: Callable[[ActionContext], str]
    # Validated model output -> stored payload. Raises ActionOutputError after referential checks.
    build_payload: Callable[[BaseModel, ActionContext], dict[str, Any]]
    input_model: type[BaseModel] = EmptyInput
    apply_item: ApplyItem | None = None
    requires_ranking: bool = False
    prepare: Prepare | None = None
    cacheable: bool = True
    extra: dict[str, Any] = field(default_factory=dict)


_REGISTRY: dict[str, AIAction] = {}


def register(action: AIAction) -> AIAction:
    if action.kind == "proposal" and action.apply_item is None:
        raise ValueError(f"{action.name}: a proposal action needs an apply_item")
    if action.kind == "advisory" and action.apply_item is not None:
        raise ValueError(f"{action.name}: an advisory action can't write anything")
    _REGISTRY[action.name] = action
    # Metric labels stay bounded: only registered action names are ever used.
    metrics.ALLOWED_ANALYSIS_TYPE.add(action.name)
    metrics.ALLOWED_AI_ACTIONS.add(action.name)
    return action


def get(name: str) -> AIAction | None:
    return _REGISTRY.get(name)


def all_actions() -> list[AIAction]:
    return sorted(_REGISTRY.values(), key=lambda a: a.name)


def unregister(name: str) -> None:
    """Test helper."""
    _REGISTRY.pop(name, None)
    metrics.ALLOWED_AI_ACTIONS.discard(name)
    metrics.ALLOWED_ANALYSIS_TYPE.discard(name)


# ---- standard payload shapes (the UI renders these generically) -----------------------------------


def proposal_payload(summary: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    """items: [{kind, label, detail, data}] — ids "i1".. are assigned here, in order."""
    return {
        "summary": summary,
        "items": [{"id": f"i{n}", **item} for n, item in enumerate(items, start=1)],
    }


def advisory_payload(summary: str, sections: list[dict[str, Any]]) -> dict[str, Any]:
    """sections: [{heading, bullets: [str], source?}].

    `source` is "ai" (the default; shown as an AI draft) or "calculated" (a fact computed by the app
    from the person's own data, shown as such). The UI uses it to keep teal and violet apart.
    """
    return {
        "summary": summary,
        "sections": [{"source": "ai", **section} for section in sections],
    }
