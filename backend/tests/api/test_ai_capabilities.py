"""
The four shipped AI capabilities (doc 18 Tier 1): AX-01 setup_draft, AX-07 devils_advocate,
AX-08 decision_brief, AX-09 outcome_coach. FakeChatProvider only: no network, no real quota.
"""

import json
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import guard
from app.ai.provider import FakeChatProvider
from app.models.decision import Alternative, Criterion
from app.models.user import User

# Imported for their fixtures and helpers (the autouse fixture wipes AI keys and the provider override).
from tests.api.test_ai_actions import _clean_ai_keys, run, scored, use_provider  # noqa: F401
from tests.api.test_commitments import alt_id, commit, make_reviewed
from tests.api.test_snapshots_insights import second_user

pytestmark = pytest.mark.asyncio


async def new_decision(client: AsyncClient, headers, title="Which job offer?") -> str:
    r = await client.post(
        "/api/v1/decisions", json={"title": title, "category": "Career"}, headers=headers
    )
    assert r.status_code == 201
    return r.json()["id"]


class Bare:
    """An empty decision (no options or criteria yet), shaped like the ORM object the helpers expect."""

    def __init__(self, decision_id: str) -> None:
        self.id = decision_id


async def names(db: AsyncSession, model, decision_id) -> list[str]:
    rows = await db.execute(select(model.name).where(model.decision_id == decision_id))
    return sorted(rows.scalars())


def sections(body: dict) -> dict[str, dict]:
    return {s["heading"]: s for s in body["proposal"]["payload"]["sections"]}


# ---- registry ----------------------------------------------------------------------------------


async def test_the_shipped_capabilities_are_listed(client: AsyncClient, user: User, auth_headers):
    listed = {
        a["name"]: a for a in (await client.get("/api/v1/ai/actions", headers=auth_headers)).json()
    }
    assert {
        "setup_draft": "proposal",
        "devils_advocate": "advisory",
        "decision_brief": "advisory",
        "outcome_coach": "advisory",
    }.items() <= {n: a["kind"] for n, a in listed.items()}.items()


# ---- AX-01 conversational setup ----------------------------------------------------------------

SETUP_REPLY = json.dumps(
    {
        "summary": "Two offers; judge them on pay, growth and commute.",
        "options": [
            {"name": "Offer A", "note": "Startup"},
            {"name": "Offer B", "note": "Big company"},
            {"name": "offer a", "note": "duplicate of the first"},
            {"name": "", "note": "nameless"},
        ],
        "criteria": [
            {"name": "Salary", "direction": "benefit", "note": "Total compensation", "weight": 5},
            {"name": "Commute time", "direction": "lower is better", "note": ""},
            {"name": "SALARY", "direction": "benefit"},
        ],
    }
)


async def test_setup_draft_proposes_options_and_criteria_without_weights(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    did = await new_decision(client, auth_headers)
    fake = FakeChatProvider(reply=SETUP_REPLY)
    use_provider(fake)
    r = await run(
        client,
        auth_headers,
        Bare(did),
        action="setup_draft",
        description="I have two job offers and cannot decide. Email me at jo@example.com",
    )
    assert r.status_code == 201, r.text
    proposal = r.json()["proposal"]
    items = proposal["payload"]["items"]
    assert [(i["kind"], i["label"]) for i in items] == [
        ("option", "Offer A"),
        ("option", "Offer B"),
        ("criterion", "Salary"),
        ("criterion", "Commute time"),
    ]
    assert items[3]["data"]["direction"] == "cost" and items[3]["detail"] == "Lower is better"
    assert items[2]["detail"] == "Higher is better. Total compensation"
    # BR-006: the model said "weight: 5"; none of that survives into the proposal.
    assert "weight" not in json.dumps(proposal["payload"]).lower()
    # The prompt carries the description as scrubbed data and the exact schema wanted.
    system, messages = fake.calls[0]
    prompt = messages[0].content
    assert '<untrusted_context label="description">' in prompt and "jo@example.com" not in prompt
    assert '"options"' in system and '"criteria"' in system and "JSON Schema" in system
    # Nothing was created by running it.
    assert (
        await names(db_session, Alternative, did) == []
        and await names(db_session, Criterion, did) == []
    )


async def test_accepting_a_setup_draft_creates_ordinary_entries_with_equal_weights(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    did = await new_decision(client, auth_headers)
    use_provider(FakeChatProvider(reply=SETUP_REPLY))
    proposal = (
        await run(
            client,
            auth_headers,
            Bare(did),
            action="setup_draft",
            description="Two offers to compare",
        )
    ).json()["proposal"]
    r = await client.post(
        f"/api/v1/ai/proposals/{proposal['id']}/accept",
        json={"item_ids": ["i1", "i2", "i3", "i4"]},
        headers=auth_headers,
    )
    assert r.status_code == 200 and r.json()["status"] == "ACCEPTED"
    assert {v["created"]["type"] for v in r.json()["resolution"].values()} == {
        "option",
        "criterion",
    }
    assert await names(db_session, Alternative, did) == ["Offer A", "Offer B"]
    crit = (await client.get(f"/api/v1/decisions/{did}/criteria", headers=auth_headers)).json()[
        "results"
    ]
    assert {c["name"]: (Decimal(c["weight"]), c["direction"]) for c in crit} == {
        "Salary": (Decimal(1), "benefit"),
        "Commute time": (Decimal(1), "cost"),
    }
    # Still a draft: scoring (and so any ranking) is the person's job.
    assert (await client.get(f"/api/v1/decisions/{did}", headers=auth_headers)).json()[
        "status"
    ] == "DRAFT"
    assert (
        await client.get(f"/api/v1/decisions/{did}/ranking", headers=auth_headers)
    ).status_code == 400


async def test_setup_draft_leaves_out_what_already_exists_and_clamps_the_counts(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)  # has Option A/B and Salary/Growth
    many = {
        "summary": "x",
        "options": [{"name": f"Choice {n}"} for n in range(12)] + [{"name": "option a"}],
        "criteria": [{"name": f"Factor {n}"} for n in range(12)] + [{"name": "growth"}],
    }
    use_provider(FakeChatProvider(reply=json.dumps(many)))
    items = (
        await run(
            client,
            auth_headers,
            decision,
            action="setup_draft",
            description="Add more detail please",
        )
    ).json()["proposal"]["payload"]["items"]
    labels = [i["label"] for i in items]
    assert (
        sum(i["kind"] == "option" for i in items) == 6
        and sum(i["kind"] == "criterion" for i in items) == 8
    )
    assert "option a" not in [x.lower() for x in labels] and "growth" not in [
        x.lower() for x in labels
    ]


async def test_setup_draft_with_nothing_new_is_discarded_and_refunded(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)
    use_provider(
        FakeChatProvider(
            reply=json.dumps({"options": [{"name": "Option A"}], "criteria": [{"name": "Salary"}]})
        )
    )
    body = (
        await run(
            client,
            auth_headers,
            decision,
            action="setup_draft",
            description="Nothing new to add here",
        )
    ).json()
    assert body["status"] == "FAILED" and body["failure_code"] == "no_new_items"
    assert await guard.used_today(user.id) == 0


async def test_setup_draft_needs_a_real_description(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    did = await new_decision(client, auth_headers)
    use_provider(FakeChatProvider(reply=SETUP_REPLY))
    for bad in ("short", "x" * 2001):
        r = await run(client, auth_headers, Bare(did), action="setup_draft", description=bad)
        assert r.status_code == 400 and "description" in r.json()["error"]["fields"]
    assert await guard.used_today(user.id) == 0


# ---- AX-07 devil's advocate --------------------------------------------------------------------

DEVILS_REPLY = json.dumps(
    {
        "summary": "Option B is clearly the leader.",  # the model is wrong about who leads
        "against_leader": [
            "Depends on one salary figure",
            "Depends on one salary figure",
            "Growth is a guess",
        ],
        "for_runner_up": ["Better long-term growth"],
        "questions": ["What if the salary is lower?", "", "Who decides?"],
    }
)


async def test_devils_advocate_names_the_leader_from_the_engine_not_the_model(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)  # Option A leads (66.7 vs 48.1)
    fake = FakeChatProvider(reply=DEVILS_REPLY)
    use_provider(fake)
    body = (await run(client, auth_headers, decision, action="devils_advocate")).json()
    assert body["status"] == "READY" and body["proposal"]["kind"] == "advisory"
    got = sections(body)
    assert list(got) == [
        "How Option A could be the wrong choice",
        "The case for Option B",
        "Questions to answer before you commit",
    ]
    assert got["How Option A could be the wrong choice"]["bullets"] == [
        "Depends on one salary figure",
        "Growth is a guess",
    ]  # duplicate dropped
    assert got["Questions to answer before you commit"]["bullets"] == [
        "What if the salary is lower?",
        "Who decides?",
    ]
    assert {s["source"] for s in got.values()} == {"ai"}
    # The prompt carries the calculated ranking; the model's own claim of a different leader is not used.
    assert "weighted sum" in fake.calls[0][1][0].content
    ranking = (
        await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    ).json()
    assert ranking["ranking"][0]["name"] == "Option A"


async def test_devils_advocate_needs_a_ranking_and_discards_empty_answers(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    incomplete = await scored(db_session, user, complete=False)
    use_provider(FakeChatProvider(reply=DEVILS_REPLY))
    r = await run(client, auth_headers, incomplete, action="devils_advocate")
    assert r.status_code == 400 and "scores" in r.json()["error"]["fields"]

    ready = await scored(db_session, user)
    use_provider(FakeChatProvider(reply=json.dumps({"summary": "nothing", "against_leader": [""]})))
    body = (await run(client, auth_headers, ready, action="devils_advocate")).json()
    assert body["status"] == "FAILED" and body["failure_code"] == "empty_answer"
    assert await guard.used_today(user.id) == 0


# ---- AX-08 decision brief ----------------------------------------------------------------------

BRIEF_REPLY = json.dumps(
    {
        "summary": "Chose the stronger salary with eyes open.",
        "why": ["Highest pay", "Clear growth path"],
        "tradeoffs": ["Longer commute"],
        "risks": ["Startup may not last"],
        "next_steps": ["Negotiate the start date"],
    }
)


async def test_decision_brief_needs_a_commitment(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)
    use_provider(FakeChatProvider(reply=BRIEF_REPLY))
    r = await run(client, auth_headers, decision, action="decision_brief")
    assert r.status_code == 400 and "commitment" in r.json()["error"]["fields"]
    assert await guard.used_today(user.id) == 0


async def test_decision_brief_keeps_calculated_facts_separate_from_ai_prose(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)
    await commit(
        client,
        auth_headers,
        decision,
        await alt_id(db_session, decision, "Option A"),
        72,
        "Best balance",
    )
    fake = FakeChatProvider(reply=BRIEF_REPLY)
    use_provider(fake)
    body = (await run(client, auth_headers, decision, action="decision_brief")).json()
    got = sections(body)
    assert got["Facts"]["source"] == "calculated"
    assert got["Facts"]["bullets"] == [
        "Committed to Option A with 72% confidence.",
        "Calculated ranking: Option A first with 66.7 points.",
        "The committed option is the top-ranked one.",
    ]
    assert [h for h in got if h != "Facts"] == [
        "Why this option",
        "Trade-offs accepted",
        "Risks to watch",
        "Next steps",
    ]
    assert {got[h]["source"] for h in got if h != "Facts"} == {"ai"}
    prompt = fake.calls[0][1][0].content
    assert "Best balance" in prompt and "72" in prompt  # the person's own rationale and confidence
    for secret in (user.email, str(user.id), str(decision.id)):
        assert secret not in prompt


async def test_the_brief_says_so_neutrally_when_the_choice_was_not_the_leader(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)
    await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option B"), 40)
    use_provider(FakeChatProvider(reply=BRIEF_REPLY))
    got = sections((await run(client, auth_headers, decision, action="decision_brief")).json())
    assert got["Facts"]["bullets"][2] == "The committed option ranked 2 of 2 (48.1 points)."


# ---- AX-09 outcome coach -----------------------------------------------------------------------

COACH_REPLY = json.dumps(
    {
        "summary": "It did not go as hoped.",
        "what_happened": "You rated the outcome 2 out of 5.",
        "confidence_vs_outcome": "You were fairly confident, and it was lower than expected.",
        "reflection_questions": ["What did you know then?", "What surprised you?"],
        "patterns": ["You tend to be overconfident about career decisions."],
    }
)


async def test_outcome_coach_needs_a_commitment_and_a_recorded_outcome(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored(db_session, user)
    use_provider(FakeChatProvider(reply=COACH_REPLY))
    r = await run(client, auth_headers, decision, action="outcome_coach")
    assert r.status_code == 400 and "commitment" in r.json()["error"]["fields"]
    await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option A"), 70)
    r = await run(client, auth_headers, decision, action="outcome_coach")
    assert r.status_code == 400 and "outcome" in r.json()["error"]["fields"]
    assert await guard.used_today(user.id) == 0


async def test_the_coach_will_not_name_patterns_from_a_single_decision(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await make_reviewed(client, db_session, user, auth_headers, 70, 2)
    fake = FakeChatProvider(reply=COACH_REPLY)
    use_provider(fake)
    body = (await run(client, auth_headers, decision, action="outcome_coach")).json()
    assert body["status"] == "READY"
    got = sections(body)
    assert got["Facts"]["source"] == "calculated"
    assert got["Facts"]["bullets"] == [
        "You were 70% confident and rated it 2/5, so it did not work out.",
        "Patterns need at least 5 recorded outcomes; you have 1.",
    ]
    assert "Patterns across your decisions" not in got  # the model's pattern claim was dropped
    assert "overconfident" not in json.dumps(body["proposal"]["payload"]).lower()
    assert got["Questions to reflect on"]["bullets"] == [
        "What did you know then?",
        "What surprised you?",
    ]
    prompt = fake.calls[0][1][0].content
    assert '"enough_data_for_patterns": false' in prompt and '"reviews": 1' in prompt


async def test_the_coach_keeps_patterns_once_there_are_five_reviews(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    for confidence, satisfaction in [(80, 5), (80, 2), (60, 4), (30, 1)]:
        await make_reviewed(client, db_session, user, auth_headers, confidence, satisfaction)
    decision = await make_reviewed(client, db_session, user, auth_headers, 90, 2)
    fake = FakeChatProvider(reply=COACH_REPLY)
    use_provider(fake)
    got = sections((await run(client, auth_headers, decision, action="outcome_coach")).json())
    assert got["Patterns across your decisions"]["bullets"] == [
        "You tend to be overconfident about career decisions."
    ]
    assert got["Facts"]["bullets"] == [
        "You were 90% confident and rated it 2/5, so it did not work out."
    ]
    assert '"enough_data_for_patterns": true' in fake.calls[0][1][0].content


# ---- shared behaviour --------------------------------------------------------------------------


@pytest.mark.parametrize(
    "action", ["setup_draft", "devils_advocate", "decision_brief", "outcome_coach"]
)
async def test_every_capability_is_off_cleanly_with_gemini_disabled_and_private_to_the_owner(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, action
):
    decision = await scored(db_session, user)
    use_provider(None)
    body = {"description": "A long enough description"} if action == "setup_draft" else {}
    r = await run(client, auth_headers, decision, action=action, **body)
    assert r.status_code == 503 and r.json()["error"]["code"] == "provider_unavailable"
    assert await guard.used_today(user.id) == 0
    other = await second_user(db_session)
    assert (await run(client, other, decision, action=action, **body)).status_code == 404
