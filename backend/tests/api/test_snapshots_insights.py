"""Snapshots / version diff (FX-04, BR-007) and sensitivity + explainer endpoints (FX-03, FX-05)."""

import asyncio
import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from prometheus_client import REGISTRY
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.models.decision import Alternative, AlternativeScore, Criterion, Decision
from app.models.snapshot import DecisionSnapshot
from app.models.user import User, UserProfile
from app.services import snapshot_service

pytestmark = pytest.mark.asyncio


def sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def scored_decision(db: AsyncSession, owner: User, *, complete: bool = True) -> Decision:
    """The hand-checked decision: A 9/3, B 4/8, weights Salary=2 Growth=1 (A leads by 18.5)."""
    decision = Decision(owner_id=owner.id, title="Job choice", category="Career")
    db.add(decision)
    await db.commit()
    a = Alternative(decision_id=decision.id, name="Option A", position=0)
    b = Alternative(decision_id=decision.id, name="Option B", position=1)
    x = Criterion(
        decision_id=decision.id, name="Salary", weight=Decimal("2"), direction="benefit", position=0
    )
    y = Criterion(
        decision_id=decision.id, name="Growth", weight=Decimal("1"), direction="benefit", position=1
    )
    db.add_all([a, b, x, y])
    await db.commit()
    cells = [(a, x, 9), (a, y, 3), (b, x, 4)] + ([(b, y, 8)] if complete else [])
    for alt, crit, score in cells:
        db.add(AlternativeScore(alternative_id=alt.id, criterion_id=crit.id, score=Decimal(score)))
    await db.commit()
    return decision


async def second_user(db: AsyncSession) -> dict:
    other = User(
        email=f"o-{uuid.uuid4().hex[:8]}@example.com", password_hash=hash_password("x" * 12)
    )
    db.add(other)
    await db.commit()
    db.add(UserProfile(user_id=other.id))
    await db.commit()
    return {"Authorization": f"Bearer {create_access_token(other.id)}"}


async def save(client: AsyncClient, headers: dict, decision: Decision, label: str = "") -> dict:
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/snapshots", json={"label": label}, headers=headers
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- snapshots ---------------------------------------------------------------------------------


async def test_versions_are_numbered_listed_newest_first_and_labelled(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    before = sample("decisionforge_snapshots_created_total", reason="manual")
    one = await save(client, auth_headers, decision, "  First draft  ")
    two = await save(client, auth_headers, decision)

    assert (one["version"], one["reason"], one["label"]) == (1, "manual", "First draft")
    assert (
        one["complete"] is True and one["leader"] == "Option A" and one["leader_points"] == 66.667
    )
    assert two["version"] == 2 and two["label"] == ""
    listed = (
        await client.get(f"/api/v1/decisions/{decision.id}/snapshots", headers=auth_headers)
    ).json()
    assert [s["version"] for s in listed] == [2, 1]
    assert sample("decisionforge_snapshots_created_total", reason="manual") == before + 2


async def test_a_snapshot_is_a_frozen_copy_of_the_inputs_and_the_ranking(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    snap = await save(client, auth_headers, decision)

    # Change the live decision afterwards; the stored version must not move (BR-007).
    salary = (
        await db_session.execute(select(Criterion).where(Criterion.name == "Salary"))
    ).scalar_one()
    await client.patch(f"/api/v1/criteria/{salary.id}", json={"weight": "9"}, headers=auth_headers)

    stored = (await client.get(f"/api/v1/snapshots/{snap['id']}", headers=auth_headers)).json()
    payload = stored["payload"]
    assert [c["weight"] for c in payload["criteria"]] == ["2", "1"]
    assert payload["decision"]["title"] == "Job choice"
    assert {s["score"] for s in payload["scores"]} == {"9", "3", "4", "8"}
    assert payload["ranking"]["order"][0]["name"] == "Option A"
    assert payload["ranking"]["order"][0]["points"] == "66.667"


async def test_an_incomplete_decision_snapshots_without_a_ranking(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user, complete=False)
    snap = await save(client, auth_headers, decision)
    assert snap["complete"] is False and snap["leader"] is None and snap["leader_points"] is None
    stored = (await client.get(f"/api/v1/snapshots/{snap['id']}", headers=auth_headers)).json()
    assert stored["payload"]["ranking"] is None
    assert len(stored["payload"]["scores"]) == 3


async def test_concurrent_saves_never_share_a_version_number(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    results = await asyncio.gather(
        *[
            client.post(f"/api/v1/decisions/{decision.id}/snapshots", json={}, headers=auth_headers)
            for _ in range(6)
        ]
    )
    assert [r.status_code for r in results] == [201] * 6
    assert sorted(r.json()["version"] for r in results) == [1, 2, 3, 4, 5, 6]


async def test_the_version_cap_is_enforced(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, monkeypatch
):
    monkeypatch.setattr(snapshot_service, "MAX_SNAPSHOTS_PER_DECISION", 2)
    decision = await scored_decision(db_session, user)
    await save(client, auth_headers, decision)
    await save(client, auth_headers, decision)
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/snapshots", json={}, headers=auth_headers
    )
    assert r.status_code == 400 and "label" in r.json()["error"]["fields"]


async def test_snapshots_cannot_be_edited_or_deleted_and_go_with_their_decision(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    snap = await save(client, auth_headers, decision)
    url = f"/api/v1/snapshots/{snap['id']}"
    assert (await client.patch(url, json={"label": "x"}, headers=auth_headers)).status_code == 405
    assert (await client.put(url, json={}, headers=auth_headers)).status_code == 405
    assert (await client.delete(url, headers=auth_headers)).status_code == 405

    await client.delete(f"/api/v1/decisions/{decision.id}", headers=auth_headers)
    count = (
        await db_session.execute(select(func.count()).select_from(DecisionSnapshot))
    ).scalar_one()
    assert count == 0


async def test_snapshots_are_private_to_the_decision_owner(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    snap = await save(client, auth_headers, decision)
    other = await second_user(db_session)
    base = f"/api/v1/decisions/{decision.id}/snapshots"
    assert (await client.get(base, headers=other)).status_code == 404
    assert (await client.post(base, json={}, headers=other)).status_code == 404
    assert (await client.get(f"{base}/compare?a=1&b=current", headers=other)).status_code == 404
    assert (await client.get(f"/api/v1/snapshots/{snap['id']}", headers=other)).status_code == 404
    assert (await client.get(base)).status_code == 401


# ---- comparing versions ------------------------------------------------------------------------


async def test_compare_reports_a_leader_change_and_what_caused_it(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    await save(client, auth_headers, decision, "Before")
    scores = (await db_session.execute(select(AlternativeScore))).scalars().all()
    a_salary = next(s for s in scores if s.score == 9)
    b_salary = next(s for s in scores if s.score == 4)
    await client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        json={
            "scores": [
                {
                    "alternative_id": str(a_salary.alternative_id),
                    "criterion_id": str(a_salary.criterion_id),
                    "score": 3,
                },
                {
                    "alternative_id": str(b_salary.alternative_id),
                    "criterion_id": str(b_salary.criterion_id),
                    "score": 9,
                },
            ]
        },
        headers=auth_headers,
    )
    await save(client, auth_headers, decision, "After")

    before = sample("decisionforge_snapshot_compares_total")
    r = await client.get(
        f"/api/v1/decisions/{decision.id}/snapshots/compare?a=1&b=2", headers=auth_headers
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["a"]["version"], body["a"]["label"], body["b"]["version"], body["b"]["label"]) == (
        1,
        "Before",
        2,
        "After",
    )
    assert body["summary"][0] == "Leader changed from Option A to Option B."
    assert body["ranking"]["leader_changed"] is True
    assert {
        (s["alternative"], s["criterion"]): (s["before"], s["after"]) for s in body["scores"]
    } == {
        ("Option A", "Salary"): (9.0, 3.0),
        ("Option B", "Salary"): (4.0, 9.0),
    }
    assert sample("decisionforge_snapshot_compares_total") == before + 1


async def test_compare_against_the_live_decision(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    await save(client, auth_headers, decision)
    unchanged = (
        await client.get(
            f"/api/v1/decisions/{decision.id}/snapshots/compare?a=1&b=current", headers=auth_headers
        )
    ).json()
    assert unchanged["b"] == {
        "version": None,
        "label": "Current",
        "created_at": None,
        "is_current": True,
    }
    assert unchanged["summary"] == ["Leader unchanged: Option A.", "No other differences."]

    salary = (
        await db_session.execute(select(Criterion).where(Criterion.name == "Salary"))
    ).scalar_one()
    await client.patch(f"/api/v1/criteria/{salary.id}", json={"weight": "4"}, headers=auth_headers)
    changed = (
        await client.get(
            f"/api/v1/decisions/{decision.id}/snapshots/compare?a=1&b=current", headers=auth_headers
        )
    ).json()
    weights = {c["name"]: c for c in changed["criteria"]}
    assert weights["Salary"]["changes"] == [{"field": "weight", "before": "2", "after": "4"}]
    assert (
        weights["Growth"]["changes"] == []
        and weights["Growth"]["share_before"] > weights["Growth"]["share_after"]
    )


@pytest.mark.parametrize(
    "query,status",
    [
        ("a=9&b=current", 404),
        ("a=1&b=9", 404),
        ("a=1&b=banana", 400),
        ("a=0&b=current", 400),
        ("b=current", 400),
    ],
)
async def test_compare_rejects_bad_versions(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, query, status
):
    decision = await scored_decision(db_session, user)
    await save(client, auth_headers, decision)
    r = await client.get(
        f"/api/v1/decisions/{decision.id}/snapshots/compare?{query}", headers=auth_headers
    )
    assert r.status_code == status


# ---- sensitivity + explanation -----------------------------------------------------------------


async def test_sensitivity_endpoint_returns_the_calculated_analysis_with_gemini_off(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, monkeypatch
):
    from app.ai import provider

    monkeypatch.setattr(
        provider, "build_default_provider", lambda *a, **k: pytest.fail("AI must not be used")
    )
    decision = await scored_decision(db_session, user)
    before = sample("decisionforge_sensitivity_lab_requests_total", status="success")

    r = await client.get(f"/api/v1/decisions/{decision.id}/sensitivity", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["deterministic"] is True
    assert (body["leader"]["name"], body["runner_up"]["name"]) == ("Option A", "Option B")
    assert body["margin_points"] == 18.519
    assert (body["tornado_low_factor"], body["tornado_high_factor"]) == (0.5, 1.5)
    assert [b["name"] for b in body["tornado"]] == ["Salary", "Growth"]
    flips = {f["name"]: f for f in body["weight_flips"]}
    assert (
        flips["Salary"]["direction"] == "decrease" and flips["Salary"]["flip_share_percent"] == 50.0
    )
    assert flips["Growth"]["direction"] == "increase" and flips["Growth"]["flip_weight"] == 2.0
    assert body["score_flips"][0] == {
        "alternative_id": body["score_flips"][0]["alternative_id"],
        "alternative_name": "Option A",
        "criterion_id": body["score_flips"][0]["criterion_id"],
        "criterion_name": "Salary",
        "role": "leader_down",
        "current_score": 9.0,
        "flip_score": 6.4,
        "delta": 2.6,
        "feasible": True,
    }
    assert sample("decisionforge_sensitivity_lab_requests_total", status="success") == before + 1


async def test_explanation_is_template_text_from_the_ranking_with_gemini_off(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, monkeypatch
):
    from app.ai import provider

    monkeypatch.setattr(
        provider, "build_default_provider", lambda *a, **k: pytest.fail("AI must not be used")
    )
    decision = await scored_decision(db_session, user)
    r = await client.get(f"/api/v1/decisions/{decision.id}/explanation", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["deterministic"] is True
    assert body["headline"] == "Option A ranks first with 66.7 points, 18.5 ahead of Option B."
    assert body["drivers"][0] == {"criterion": "Salary", "share_percent": 66.667, "points": 59.259}
    assert body["ahead_on"] == [{"criterion": "Salary", "points": 37.037}]
    assert body["behind_on"] == [{"criterion": "Growth", "points": -18.519}]
    assert body["text"].startswith(body["headline"])


async def test_insights_reject_unrankable_decisions_like_the_ranking_does(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user, complete=False)
    for path in ("sensitivity", "explanation"):
        r = await client.get(f"/api/v1/decisions/{decision.id}/{path}", headers=auth_headers)
        assert r.status_code == 400, path
        assert "scores" in r.json()["error"]["fields"]
    assert sample("decisionforge_sensitivity_lab_requests_total", status="rejected") >= 1
    assert sample("decisionforge_explanations_total", status="rejected") >= 1


async def test_insights_are_private_to_the_decision_owner(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    other = await second_user(db_session)
    for path in ("sensitivity", "explanation"):
        assert (
            await client.get(f"/api/v1/decisions/{decision.id}/{path}", headers=other)
        ).status_code == 404
        assert (await client.get(f"/api/v1/decisions/{decision.id}/{path}")).status_code == 401
