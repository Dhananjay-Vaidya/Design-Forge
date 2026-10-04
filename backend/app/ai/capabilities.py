"""
The shipped AI capabilities (doc 18 Tier 1), each a registered `AIAction`:

    AX-01  setup_draft      "Describe your decision" -> proposed options and criteria (accept item by item)
    AX-07  devils_advocate  the case against the leader, the case for the runner-up, questions to answer
    AX-08  decision_brief   a summary of a committed decision (facts are calculated, the rest is AI prose)
    AX-09  outcome_coach    reflection on how confidence compared with the result

Rules every one of them follows (enforced here and by the framework, not by good intentions):
  - AI never proposes a score or a weight. Accepted criteria start with equal weight; the person sets
    what matters to them. Rankings come from the deterministic engine only.
  - Names such as "the leader" come from the calculated ranking, never from the model's own claim.
  - Statements the data can't support are dropped (for example, "patterns" with fewer than five reviews).
  - Model output is lenient to parse and strict to shape: lists are clamped, text is bounded, empty or
    duplicate items are dropped, and an answer left with nothing useful is discarded and refunded.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import actions, guardrails
from app.ai.actions import ActionContext, ActionOutputError
from app.ai.context import render_context
from app.core.exceptions import ValidationAppError
from app.models.commitment import Commitment, OutcomeReview, OutcomeStatus
from app.models.decision import Alternative, Decision
from app.repositories import decision_repository
from app.services import commitment_service, decision_service

# Accepted criteria start equal. Importance is the person's call, never the model's.
DEFAULT_WEIGHT = Decimal("1")
MAX_OPTIONS = 6
MAX_CRITERIA = 8
MAX_BULLETS = 5
MAX_NAME = 80
MAX_NOTE = 300
MAX_BULLET = 300
MAX_SUMMARY = 400


def decision_data_block(ctx: ActionContext) -> str:
    return f"<decision_data>\n{render_context(ctx.context)}\n</decision_data>"


def _text(value: str, limit: int) -> str:
    return guardrails.sanitize_text(value, limit).replace("\n", " ").strip()


def _bullets(values: list[str], limit: int = MAX_BULLETS) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        text = _text(value, MAX_BULLET)
        if text and text.lower() not in seen:
            seen.add(text.lower())
            out.append(text)
        if len(out) == limit:
            break
    return out


def _summary(value: str, fallback: str) -> str:
    return _text(value, MAX_SUMMARY) or fallback


def _key(name: str) -> str:
    return " ".join(name.lower().split())


def _drop_empty(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [s for s in sections if s["bullets"]]


# ---- AX-01 conversational setup ---------------------------------------------------------------------


class SetupInput(BaseModel):
    description: str = Field(min_length=10, max_length=2000)


class _SuggestedOption(BaseModel):
    name: str = ""
    note: str = ""


class _SuggestedCriterion(BaseModel):
    name: str = ""
    direction: Literal["benefit", "cost"] = "benefit"
    note: str = ""

    @field_validator("direction", mode="before")
    @classmethod
    def _direction(cls, value: Any) -> Any:
        text = str(value).strip().lower()
        if text in {"cost", "lower", "lower is better", "minimise", "minimize", "negative"}:
            return "cost"
        if text in {"benefit", "higher", "higher is better", "maximise", "maximize", "positive"}:
            return "benefit"
        return value


class SetupOutput(BaseModel):
    summary: str = ""
    options: list[_SuggestedOption] = []
    criteria: list[_SuggestedCriterion] = []


SETUP_SYSTEM = """You help a person structure a decision they are about to make. From their \
description, propose the realistic options they are choosing between and the criteria they \
should judge them on.

- Options: the actual alternatives (at most 6). Use short, specific names. If the description \
names only one option, add the obvious alternatives including "do nothing" where it applies.
- Criteria: the factors that would really differentiate the options (at most 8). For each, say \
whether a higher value is better ("benefit") or lower is better ("cost", e.g. price, risk, effort).
- Do NOT propose scores, weights, importance or a recommendation. The person decides those.
- Prefer concrete criteria over vague ones ("Commute time" beats "Convenience").
- Do not repeat options or criteria that already exist in the decision data.
- The summary is one or two sentences saying what you drafted and what to check."""


def _setup_prompt(ctx: ActionContext) -> str:
    return (
        f"{decision_data_block(ctx)}\n\n"
        "The person describes their decision like this:\n"
        f"{guardrails.delimit_untrusted('description', ctx.input.description)}\n\n"  # type: ignore[attr-defined]
        "Propose options and criteria."
    )


def _setup_payload(out: BaseModel, ctx: ActionContext) -> dict[str, Any]:
    assert isinstance(out, SetupOutput)
    taken_options = {_key(o["name"]) for o in ctx.context["options"]}
    taken_criteria = {_key(c["name"]) for c in ctx.context["criteria"]}
    items: list[dict[str, Any]] = []

    for option in out.options[:MAX_OPTIONS]:
        name = _text(option.name, MAX_NAME)
        if not name or _key(name) in taken_options:
            continue
        taken_options.add(_key(name))
        note = _text(option.note, MAX_NOTE)
        items.append(
            {"kind": "option", "label": name, "detail": note, "data": {"name": name, "note": note}}
        )
    for criterion in out.criteria[:MAX_CRITERIA]:
        name = _text(criterion.name, MAX_NAME)
        if not name or _key(name) in taken_criteria:
            continue
        taken_criteria.add(_key(name))
        note = _text(criterion.note, MAX_NOTE)
        direction = "Higher is better" if criterion.direction == "benefit" else "Lower is better"
        items.append(
            {
                "kind": "criterion",
                "label": name,
                "detail": f"{direction}. {note}".strip() if note else direction,
                "data": {"name": name, "note": note, "direction": criterion.direction},
            }
        )
    if not items:
        raise ActionOutputError(
            "no_new_items",
            "The AI had nothing new to add to this decision. Try adding more detail.",
        )
    return actions.proposal_payload(
        _summary(out.summary, "Here is a starting structure to adjust."), items
    )


async def _setup_apply(
    db: AsyncSession, decision: Decision, item: dict[str, Any]
) -> dict[str, Any]:
    data = item["data"]
    if item["kind"] == "option":
        position = len(await decision_repository.list_alternatives(db, decision_id=decision.id))
        alternative = await decision_service.create_alternative(
            db, decision, name=data["name"], description=data["note"], position=position
        )
        return {"type": "option", "id": str(alternative.id)}
    position = len(await decision_repository.list_criteria(db, decision_id=decision.id))
    criterion = await decision_service.create_criterion(
        db,
        decision,
        name=data["name"],
        weight=DEFAULT_WEIGHT,
        direction=data["direction"],
        description=data["note"],
        is_active=True,
        position=position,
    )
    return {"type": "criterion", "id": str(criterion.id)}


SETUP_DRAFT = actions.AIAction(
    name="setup_draft",
    title="Draft options and criteria",
    description="Describe your decision and get proposed options and criteria to accept one by one.",
    kind="proposal",
    prompt_version="v1",
    model_tier="reasoning",
    system_prompt=SETUP_SYSTEM,
    response_model=SetupOutput,
    input_model=SetupInput,
    build_user_prompt=_setup_prompt,
    build_payload=_setup_payload,
    apply_item=_setup_apply,
)


# ---- AX-07 devil's advocate -------------------------------------------------------------------------


class DevilsOutput(BaseModel):
    summary: str = ""
    against_leader: list[str] = []
    for_runner_up: list[str] = []
    questions: list[str] = []


DEVILS_SYSTEM = """You are a constructive devil's advocate for one person's decision. The ranking \
in the data was calculated by a deterministic engine; you cannot and must not change it.

- against_leader: the strongest honest reasons the top-ranked option could turn out to be the \
wrong choice (risks, hidden costs, assumptions it depends on). At most 5.
- for_runner_up: the best honest case for the second-ranked option, as its supporters would put \
it (steelman). At most 5.
- questions: questions the person should answer before committing. At most 4.
- Ground every point in the decision data. If you rely on something not in the data, say it is an \
assumption. Do not invent facts, figures or events.
- Be specific and brief: one sentence per point. Do not recommend which option to pick."""


def _devils_payload(out: BaseModel, ctx: ActionContext) -> dict[str, Any]:
    assert isinstance(out, DevilsOutput)
    order = ctx.context["ranking"]["order"]
    leader, runner_up = order[0]["option"], order[1]["option"]  # from the engine, not the model
    sections = _drop_empty(
        [
            {
                "heading": f"How {leader} could be the wrong choice",
                "bullets": _bullets(out.against_leader),
            },
            {"heading": f"The case for {runner_up}", "bullets": _bullets(out.for_runner_up)},
            {
                "heading": "Questions to answer before you commit",
                "bullets": _bullets(out.questions, 4),
            },
        ]
    )
    if not sections:
        raise ActionOutputError("empty_answer", "The AI returned no usable points.")
    return actions.advisory_payload(
        _summary(out.summary, f"A challenge to {leader}, the calculated leader."), sections
    )


DEVILS_ADVOCATE = actions.AIAction(
    name="devils_advocate",
    title="Challenge the leader",
    description="The case against the top-ranked option, the case for the runner-up, and questions to answer.",
    kind="advisory",
    prompt_version="v1",
    model_tier="reasoning",
    system_prompt=DEVILS_SYSTEM,
    response_model=DevilsOutput,
    build_user_prompt=lambda ctx: (
        f"{decision_data_block(ctx)}\n\nChallenge the top-ranked option and steelman the runner-up."
    ),
    build_payload=_devils_payload,
    requires_ranking=True,
)


# ---- prerequisites shared by the post-commit actions ------------------------------------------------


async def _active_commitment(db: AsyncSession, decision: Decision) -> tuple[Commitment, str]:
    row = (
        await db.execute(
            select(Commitment, Alternative.name)
            .join(Alternative, Commitment.alternative_id == Alternative.id)
            .where(Commitment.decision_id == decision.id, Commitment.is_active.is_(True))
        )
    ).first()
    if row is None:
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"commitment": ["Commit to an option first; this looks back on that choice."]},
        )
    return row[0], row[1]


async def _prepare_committed(db: AsyncSession, decision: Decision, context: dict[str, Any]) -> None:
    commitment, name = await _active_commitment(db, decision)
    context["commitment"] = {
        "option": name,
        "confidence_percent": commitment.confidence,
        "rationale": guardrails.sanitize_text(commitment.rationale or "", 1000),
    }


# ---- AX-08 decision brief ---------------------------------------------------------------------------


class BriefOutput(BaseModel):
    summary: str = ""
    why: list[str] = []
    tradeoffs: list[str] = []
    risks: list[str] = []
    next_steps: list[str] = []


BRIEF_SYSTEM = """You write a short, plain-English brief of a decision a person has committed to, \
for them to keep or share. The ranking was calculated by a deterministic engine and the commitment \
is the person's own; you only describe them.

- summary: two sentences on what was decided and the main reason.
- why: the reasons that support the committed option, from the data. At most 5.
- tradeoffs: what the person is accepting or giving up by choosing it. At most 4.
- risks: what could go wrong and is worth watching. At most 4.
- next_steps: concrete follow-ups. At most 4.
- Use only the data provided. Do not invent facts. If the person committed to an option that was \
not top-ranked, say so neutrally and use their rationale; do not criticise the choice."""


def _brief_payload(out: BaseModel, ctx: ActionContext) -> dict[str, Any]:
    assert isinstance(out, BriefOutput)
    committed = ctx.context["commitment"]
    order = ctx.context["ranking"]["order"]
    rank = next((r for r in order if r["option"] == committed["option"]), None)
    facts = [
        f"Committed to {committed['option']} with {committed['confidence_percent']}% confidence.",
        f"Calculated ranking: {order[0]['option']} first with {order[0]['total_points_out_of_100']} points.",
    ]
    if rank is not None:
        facts.append(
            "The committed option is the top-ranked one."
            if rank["rank"] == 1
            else f"The committed option ranked {rank['rank']} of {len(order)} "
            f"({rank['total_points_out_of_100']} points)."
        )
    sections = [{"heading": "Facts", "bullets": facts, "source": "calculated"}] + _drop_empty(
        [
            {"heading": "Why this option", "bullets": _bullets(out.why)},
            {"heading": "Trade-offs accepted", "bullets": _bullets(out.tradeoffs, 4)},
            {"heading": "Risks to watch", "bullets": _bullets(out.risks, 4)},
            {"heading": "Next steps", "bullets": _bullets(out.next_steps, 4)},
        ]
    )
    if len(sections) == 1:
        raise ActionOutputError("empty_answer", "The AI returned no usable brief.")
    return actions.advisory_payload(
        _summary(out.summary, f"A brief of the decision to choose {committed['option']}."), sections
    )


DECISION_BRIEF = actions.AIAction(
    name="decision_brief",
    title="Decision brief",
    description="A short written summary of a committed decision. The facts are calculated; the prose is AI.",
    kind="advisory",
    prompt_version="v1",
    model_tier="reasoning",
    system_prompt=BRIEF_SYSTEM,
    response_model=BriefOutput,
    build_user_prompt=lambda ctx: f"{decision_data_block(ctx)}\n\nWrite the brief.",
    build_payload=_brief_payload,
    requires_ranking=True,
    prepare=_prepare_committed,
)


# ---- AX-09 outcome-review coach ---------------------------------------------------------------------


class CoachOutput(BaseModel):
    summary: str = ""
    what_happened: str = ""
    confidence_vs_outcome: str = ""
    reflection_questions: list[str] = []
    patterns: list[str] = []


COACH_SYSTEM = """You are a reflective coach helping someone learn from a decision after seeing how \
it turned out. You describe and ask; you do not judge the person or the decision.

- what_happened: one or two sentences restating the outcome from the data.
- confidence_vs_outcome: one or two sentences comparing the confidence they stated at commitment \
with the satisfaction they recorded. "Worked out" means satisfaction of 4 or 5 out of 5.
- reflection_questions: 2 to 4 open questions that help them learn (what did they know then, what \
surprised them, what would they weigh differently). At most 4.
- patterns: ONLY patterns clearly supported by the calibration numbers provided. If calibration \
shows fewer than 5 reviews, return an empty list. Never infer patterns from a single decision.
- Use only the data provided. Do not invent facts, causes or advice about their life."""


async def _prepare_outcome(db: AsyncSession, decision: Decision, context: dict[str, Any]) -> None:
    commitment, name = await _active_commitment(db, decision)
    review = (
        await db.execute(
            select(OutcomeReview)
            .where(
                OutcomeReview.commitment_id == commitment.id,
                OutcomeReview.status == OutcomeStatus.SUBMITTED,
                OutcomeReview.satisfaction.is_not(None),
            )
            .order_by(OutcomeReview.submitted_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if review is None or review.satisfaction is None:
        raise ValidationAppError(
            "One or more fields are invalid.",
            fields={"outcome": ["Record how it turned out first; the coach reflects on that."]},
        )
    stats = await commitment_service.calibration_for(db, decision.owner_id)
    context["commitment"] = {
        "option": name,
        "confidence_percent": commitment.confidence,
        "rationale": guardrails.sanitize_text(commitment.rationale or "", 1000),
    }
    context["outcome"] = {
        "satisfaction_out_of_5": review.satisfaction,
        "worked_out": review.satisfaction >= 4,
        "notes": guardrails.sanitize_text(review.result_notes or "", 1000),
    }
    context["calibration"] = {
        "reviews": stats["reviews_count"],
        "enough_data_for_patterns": stats["sufficient"],
        "overall_read": stats["verdict"],
        "average_confidence_percent": stats["avg_confidence"],
        "worked_out_rate": stats["success_rate"],
    }


def _coach_payload(out: BaseModel, ctx: ActionContext) -> dict[str, Any]:
    assert isinstance(out, CoachOutput)
    commitment, outcome, calibration = (
        ctx.context["commitment"],
        ctx.context["outcome"],
        ctx.context["calibration"],
    )
    result = "worked out" if outcome["worked_out"] else "did not work out"
    facts = [
        f"You were {commitment['confidence_percent']}% confident and rated it "
        f"{outcome['satisfaction_out_of_5']}/5, so it {result}.",
    ]
    patterns = _bullets(out.patterns, 3)
    if calibration["enough_data_for_patterns"]:
        pattern_section = {"heading": "Patterns across your decisions", "bullets": patterns}
    else:  # a pattern needs a sample: whatever the model said is dropped, and we say why
        patterns = []
        facts.append(
            f"Patterns need at least 5 recorded outcomes; you have {calibration['reviews']}."
        )
        pattern_section = {"heading": "Patterns across your decisions", "bullets": []}
    sections = [{"heading": "Facts", "bullets": facts, "source": "calculated"}] + _drop_empty(
        [
            {"heading": "What happened", "bullets": _bullets([out.what_happened], 1)},
            {
                "heading": "Your confidence and the result",
                "bullets": _bullets([out.confidence_vs_outcome], 1),
            },
            {
                "heading": "Questions to reflect on",
                "bullets": _bullets(out.reflection_questions, 4),
            },
            pattern_section,
        ]
    )
    if len(sections) == 1:
        raise ActionOutputError("empty_answer", "The AI returned no usable reflection.")
    return actions.advisory_payload(
        _summary(out.summary, "A few questions to learn from this decision."), sections
    )


OUTCOME_COACH = actions.AIAction(
    name="outcome_coach",
    title="Outcome coach",
    description="Reflect on how your confidence compared with the result, with questions to learn from.",
    kind="advisory",
    prompt_version="v1",
    model_tier="reasoning",
    system_prompt=COACH_SYSTEM,
    response_model=CoachOutput,
    build_user_prompt=lambda ctx: f"{decision_data_block(ctx)}\n\nCoach me on this outcome.",
    build_payload=_coach_payload,
    prepare=_prepare_outcome,
)


def register_all() -> None:
    for action in (SETUP_DRAFT, DEVILS_ADVOCATE, DECISION_BRIEF, OUTCOME_COACH):
        actions.register(action)


register_all()
