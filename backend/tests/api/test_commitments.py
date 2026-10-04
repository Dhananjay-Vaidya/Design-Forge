"""Commitments, outcome reviews and calibration (FX-06; API-31..34, API-36)."""

from datetime import UTC, datetime, timedelta

import pytest
from httpx import AsyncClient
from prometheus_client import REGISTRY
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.commitment import Commitment, OutcomeReview
from app.models.decision import Alternative, Decision
from app.models.user import User
from app.services import decision_service
from tests.api import test_snapshots_insights as helpers
from tests.api.test_snapshots_insights import second_user

pytestmark = pytest.mark.asyncio


async def scored_decision(db: AsyncSession, owner: User, *, complete: bool = True) -> Decision:
    """The shared fixture decision, with its status derived the way the app derives it."""
    decision = await helpers.scored_decision(db, owner, complete=complete)
    await decision_service.refresh_status(db, decision)
    await db.commit()
    return decision


def sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


def iso(delta: timedelta) -> str:
    return (datetime.now(UTC) + delta).isoformat()


async def alt_id(db: AsyncSession, decision: Decision, name: str) -> str:
    row = (
        await db.execute(
            select(Alternative).where(
                Alternative.decision_id == decision.id, Alternative.name == name
            )
        )
    ).scalar_one()
    return str(row.id)


async def commit(client, headers, decision, alternative_id, confidence=70, rationale=""):
    return await client.post(
        f"/api/v1/decisions/{decision.id}/commit",
        json={"alternative_id": alternative_id, "confidence": confidence, "rationale": rationale},
        headers=headers,
    )


async def status_of(client, headers, decision) -> str:
    return (await client.get(f"/api/v1/decisions/{decision.id}", headers=headers)).json()["status"]


# ---- commit ------------------------------------------------------------------------------------


async def test_commit_records_the_choice_snapshots_it_and_marks_the_decision_committed(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    before = sample("decisionforge_commitments_total", kind="first")
    r = await commit(
        client,
        auth_headers,
        decision,
        await alt_id(db_session, decision, "Option A"),
        72,
        "  Best balance ",
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert (body["alternative_name"], body["confidence"], body["rationale"]) == (
        "Option A",
        72,
        "Best balance",
    )
    assert body["is_active"] is True and body["snapshot_version"] == 1
    assert await status_of(client, auth_headers, decision) == "COMMITTED"
    assert sample("decisionforge_commitments_total", kind="first") == before + 1

    snaps = (
        await client.get(f"/api/v1/decisions/{decision.id}/snapshots", headers=auth_headers)
    ).json()
    assert [(s["version"], s["reason"], s["label"]) for s in snaps] == [
        (1, "commitment", "Committed: Option A")
    ]


async def test_you_may_commit_to_an_option_that_is_not_the_leader(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)  # A leads
    r = await commit(
        client, auth_headers, decision, await alt_id(db_session, decision, "Option B"), 40
    )
    assert r.status_code == 201 and r.json()["alternative_name"] == "Option B"


async def test_changing_your_mind_keeps_history_and_cancels_open_reviews(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    a, b = (
        await alt_id(db_session, decision, "Option A"),
        await alt_id(db_session, decision, "Option B"),
    )
    first = (await commit(client, auth_headers, decision, a, 80)).json()
    await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=30))},
        headers=auth_headers,
    )
    before = sample("decisionforge_commitments_total", kind="changed")
    second = (await commit(client, auth_headers, decision, b, 55)).json()

    history = (
        await client.get(f"/api/v1/decisions/{decision.id}/commitments", headers=auth_headers)
    ).json()
    assert [(c["id"], c["is_active"]) for c in history] == [
        (second["id"], True),
        (first["id"], False),
    ]
    assert second["snapshot_version"] == 2
    reviews = (
        await client.get(f"/api/v1/decisions/{decision.id}/outcomes", headers=auth_headers)
    ).json()
    assert [r["status"] for r in reviews] == ["CANCELLED"]
    assert await status_of(client, auth_headers, decision) == "COMMITTED"
    assert sample("decisionforge_commitments_total", kind="changed") == before + 1
    active = (
        await db_session.execute(
            select(func.count()).select_from(Commitment).where(Commitment.is_active)
        )
    ).scalar_one()
    assert active == 1


async def test_the_database_itself_allows_only_one_active_commitment(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    from sqlalchemy.exc import IntegrityError

    decision = await scored_decision(db_session, user)
    first = (
        await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option A"))
    ).json()
    existing = await db_session.get(Commitment, first["id"])
    db_session.add(
        Commitment(
            decision_id=decision.id,
            alternative_id=existing.alternative_id,
            snapshot_id=existing.snapshot_id,
            confidence=10,
            is_active=True,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.commit()
    await db_session.rollback()


@pytest.mark.parametrize("confidence", [-1, 101])
async def test_confidence_must_be_between_zero_and_a_hundred(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, confidence
):
    decision = await scored_decision(db_session, user)
    r = await commit(
        client, auth_headers, decision, await alt_id(db_session, decision, "Option A"), confidence
    )
    assert r.status_code == 400 and "confidence" in r.json()["error"]["fields"]


async def test_commit_is_refused_until_the_decision_is_fully_scored(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user, complete=False)
    r = await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option A"))
    assert r.status_code == 400 and "status" in r.json()["error"]["fields"]
    assert (
        await client.get(f"/api/v1/decisions/{decision.id}/commitments", headers=auth_headers)
    ).json() == []


async def test_commit_to_an_option_from_another_decision_is_refused(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    one = await scored_decision(db_session, user)
    two = await scored_decision(db_session, user)
    r = await commit(client, auth_headers, one, await alt_id(db_session, two, "Option A"))
    assert r.status_code == 400 and "alternative_id" in r.json()["error"]["fields"]


async def test_a_committed_option_cannot_be_deleted_but_can_be_renamed(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    a = await alt_id(db_session, decision, "Option A")
    await commit(client, auth_headers, decision, a)
    r = await client.delete(f"/api/v1/alternatives/{a}", headers=auth_headers)
    assert r.status_code == 409
    assert (
        await client.patch(
            f"/api/v1/alternatives/{a}", json={"name": "Renamed"}, headers=auth_headers
        )
    ).status_code == 200
    # An option that was never committed to is still deletable.
    b = await alt_id(db_session, decision, "Option B")
    assert (
        await client.delete(f"/api/v1/alternatives/{b}", headers=auth_headers)
    ).status_code == 204


async def test_deleting_a_committed_decision_removes_everything_with_it(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option A"))
    await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=5))},
        headers=auth_headers,
    )
    assert (
        await client.delete(f"/api/v1/decisions/{decision.id}", headers=auth_headers)
    ).status_code == 204
    for table in ("commitments", "outcome_reviews", "decision_snapshots"):
        assert (await db_session.execute(text(f"SELECT count(*) FROM {table}"))).scalar_one() == 0


async def test_commitments_and_outcomes_are_private_to_the_owner(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    a = await alt_id(db_session, decision, "Option A")
    await commit(client, auth_headers, decision, a)
    review = (
        await client.post(
            f"/api/v1/decisions/{decision.id}/outcomes",
            json={"due_at": iso(timedelta(days=5))},
            headers=auth_headers,
        )
    ).json()
    other = await second_user(db_session)
    base = f"/api/v1/decisions/{decision.id}"
    assert (await commit(client, other, decision, a)).status_code == 404
    assert (await client.get(f"{base}/commitments", headers=other)).status_code == 404
    assert (await client.get(f"{base}/outcomes", headers=other)).status_code == 404
    assert (
        await client.post(f"{base}/outcomes", json={"satisfaction": 3}, headers=other)
    ).status_code == 404
    assert (
        await client.post(
            f"/api/v1/outcomes/{review['id']}/submit", json={"satisfaction": 3}, headers=other
        )
    ).status_code == 404
    assert (
        await client.post(f"/api/v1/outcomes/{review['id']}/cancel", headers=other)
    ).status_code == 404
    assert (
        await client.post(f"{base}/commit", json={"alternative_id": a, "confidence": 1})
    ).status_code == 401


# ---- outcome reviews ---------------------------------------------------------------------------


async def committed(client, db_session, user, auth_headers, confidence=70):
    decision = await scored_decision(db_session, user)
    await commit(
        client, auth_headers, decision, await alt_id(db_session, decision, "Option A"), confidence
    )
    return decision


async def test_a_review_needs_an_active_commitment(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=3))},
        headers=auth_headers,
    )
    assert r.status_code == 400 and "commitment" in r.json()["error"]["fields"]


async def test_a_review_needs_a_date_or_a_rating(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes", json={}, headers=auth_headers
    )
    assert r.status_code == 400 and "due_at" in r.json()["error"]["fields"]


@pytest.mark.parametrize(
    "body",
    [
        {"due_at": "2030-01-01T00:00:00"},  # no time zone
        {"due_at": "2099-01-01T00:00:00Z"},  # beyond five years
        {"satisfaction": 0},
        {"satisfaction": 6},
    ],
)
async def test_bad_review_input_is_rejected(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, body
):
    decision = await committed(client, db_session, user, auth_headers)
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes", json=body, headers=auth_headers
    )
    assert r.status_code in (400, 422)


async def test_scheduled_review_falls_due_and_moves_the_decision_to_under_review(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    sched = before = sample("decisionforge_outcome_reviews_total", status="scheduled")
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=30))},
        headers=auth_headers,
    )
    assert r.status_code == 201 and r.json()["status"] == "SCHEDULED"
    assert sample("decisionforge_outcome_reviews_total", status="scheduled") == sched + 1
    assert await status_of(client, auth_headers, decision) == "COMMITTED"

    # Time passes: the review's date is now behind us.
    await db_session.execute(
        text("UPDATE outcome_reviews SET due_at = now() - interval '1 day' WHERE decision_id = :d"),
        {"d": decision.id},
    )
    await db_session.commit()
    assert await status_of(client, auth_headers, decision) == "UNDER_REVIEW"
    reviews = (
        await client.get(f"/api/v1/decisions/{decision.id}/outcomes", headers=auth_headers)
    ).json()
    assert [r["status"] for r in reviews] == ["DUE"]
    # Reading again changes nothing (idempotent).
    assert await status_of(client, auth_headers, decision) == "UNDER_REVIEW"
    assert before == sched


async def test_due_status_shows_up_in_the_decision_list_too(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=1))},
        headers=auth_headers,
    )
    await db_session.execute(text("UPDATE outcome_reviews SET due_at = now() - interval '1 hour'"))
    await db_session.commit()
    listing = (await client.get("/api/v1/decisions", headers=auth_headers)).json()
    assert [d["status"] for d in listing["results"]] == ["UNDER_REVIEW"]


async def test_submitting_a_scheduled_review_marks_the_decision_reviewed(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    review = (
        await client.post(
            f"/api/v1/decisions/{decision.id}/outcomes",
            json={"due_at": iso(timedelta(days=30))},
            headers=auth_headers,
        )
    ).json()
    r = await client.post(
        f"/api/v1/outcomes/{review['id']}/submit",
        json={"satisfaction": 4, "result_notes": " Happy with it "},
        headers=auth_headers,
    )
    assert r.status_code == 200
    body = r.json()
    assert (body["status"], body["satisfaction"], body["result_notes"]) == (
        "SUBMITTED",
        4,
        "Happy with it",
    )
    assert body["submitted_at"] is not None
    assert await status_of(client, auth_headers, decision) == "REVIEWED"
    # A submitted review is final.
    again = await client.post(
        f"/api/v1/outcomes/{review['id']}/submit", json={"satisfaction": 1}, headers=auth_headers
    )
    assert again.status_code == 400
    assert (
        await client.post(f"/api/v1/outcomes/{review['id']}/cancel", headers=auth_headers)
    ).status_code == 400


async def test_recording_an_outcome_directly(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"satisfaction": 2, "result_notes": "Meh"},
        headers=auth_headers,
    )
    assert r.status_code == 201 and r.json()["status"] == "SUBMITTED"
    assert await status_of(client, auth_headers, decision) == "REVIEWED"


async def test_cancelling_the_only_due_review_returns_the_decision_to_committed(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    review = (
        await client.post(
            f"/api/v1/decisions/{decision.id}/outcomes",
            json={"due_at": iso(timedelta(days=1))},
            headers=auth_headers,
        )
    ).json()
    await db_session.execute(text("UPDATE outcome_reviews SET due_at = now() - interval '1 hour'"))
    await db_session.commit()
    assert await status_of(client, auth_headers, decision) == "UNDER_REVIEW"
    r = await client.post(f"/api/v1/outcomes/{review['id']}/cancel", headers=auth_headers)
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    assert await status_of(client, auth_headers, decision) == "COMMITTED"


async def test_a_commitment_can_have_several_reviews_up_to_a_cap(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers, monkeypatch
):
    from app.services import commitment_service

    monkeypatch.setattr(commitment_service, "MAX_REVIEWS_PER_COMMITMENT", 2)
    decision = await committed(client, db_session, user, auth_headers)
    for days in (30, 90):
        r = await client.post(
            f"/api/v1/decisions/{decision.id}/outcomes",
            json={"due_at": iso(timedelta(days=days))},
            headers=auth_headers,
        )
        assert r.status_code == 201
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=200))},
        headers=auth_headers,
    )
    assert r.status_code == 400
    total = (await db_session.execute(select(func.count()).select_from(OutcomeReview))).scalar_one()
    assert total == 2


# ---- calibration -------------------------------------------------------------------------------


async def make_reviewed(
    client, db_session, user, headers, confidence, satisfaction, category="Career"
):
    decision = await scored_decision(db_session, user)
    await client.patch(
        f"/api/v1/decisions/{decision.id}", json={"category": category}, headers=headers
    )
    await commit(
        client, headers, decision, await alt_id(db_session, decision, "Option A"), confidence
    )
    r = await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"satisfaction": satisfaction},
        headers=headers,
    )
    assert r.status_code == 201
    return decision


async def test_calibration_starts_empty_with_guidance(
    client: AsyncClient, user: User, auth_headers
):
    r = await client.get("/api/v1/dashboard/calibration", headers=auth_headers)
    assert r.status_code == 200
    body = r.json()
    assert (
        body["deterministic"] is True and body["reviews_count"] == 0 and body["brier_score"] is None
    )
    assert "Submit an outcome review" in body["note"]


async def test_calibration_uses_each_commitments_confidence_and_outcome(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    before = sample("decisionforge_calibration_views_total")
    for confidence, satisfaction in [(80, 5), (80, 2), (60, 4), (30, 1), (90, 5)]:
        await make_reviewed(client, db_session, user, auth_headers, confidence, satisfaction)
    body = (await client.get("/api/v1/dashboard/calibration", headers=auth_headers)).json()
    assert body["reviews_count"] == 5 and body["sufficient"] is True
    assert (body["avg_confidence"], body["avg_satisfaction"], body["success_rate"]) == (
        68.0,
        3.4,
        0.6,
    )
    assert (body["brier_score"], body["brier_skill"]) == (0.188, 0.217)
    assert body["categories"][0]["category"] == "Career" and body["categories"][0]["count"] == 5
    assert sample("decisionforge_calibration_views_total") == before + 1


async def test_only_the_latest_review_of_a_commitment_counts(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await make_reviewed(client, db_session, user, auth_headers, 70, 2)
    await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes", json={"satisfaction": 5}, headers=auth_headers
    )
    body = (await client.get("/api/v1/dashboard/calibration", headers=auth_headers)).json()
    assert body["reviews_count"] == 1 and body["avg_satisfaction"] == 5.0


async def test_calibration_never_mixes_users(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    await make_reviewed(client, db_session, user, auth_headers, 70, 5)
    other = await second_user(db_session)
    body = (await client.get("/api/v1/dashboard/calibration", headers=other)).json()
    assert body["reviews_count"] == 0
    assert (await client.get("/api/v1/dashboard/calibration")).status_code == 401


async def test_cancelled_and_unsubmitted_reviews_do_not_count(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    await client.post(
        f"/api/v1/decisions/{decision.id}/outcomes",
        json={"due_at": iso(timedelta(days=2))},
        headers=auth_headers,
    )
    body = (await client.get("/api/v1/dashboard/calibration", headers=auth_headers)).json()
    assert body["reviews_count"] == 0


async def test_the_commitment_is_final_once_a_review_is_due_or_recorded(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await committed(client, db_session, user, auth_headers)
    b = await alt_id(db_session, decision, "Option B")
    review = (
        await client.post(
            f"/api/v1/decisions/{decision.id}/outcomes",
            json={"due_at": iso(timedelta(days=1))},
            headers=auth_headers,
        )
    ).json()
    await db_session.execute(text("UPDATE outcome_reviews SET due_at = now() - interval '1 hour'"))
    await db_session.commit()
    assert await status_of(client, auth_headers, decision) == "UNDER_REVIEW"
    r = await commit(client, auth_headers, decision, b)
    assert r.status_code == 400 and "review is due" in r.json()["error"]["fields"]["status"][0]

    await client.post(
        f"/api/v1/outcomes/{review['id']}/submit", json={"satisfaction": 4}, headers=auth_headers
    )
    r = await commit(client, auth_headers, decision, b)
    assert r.status_code == 400 and "final" in r.json()["error"]["fields"]["status"][0]


async def test_an_archived_decision_cannot_be_committed(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers
):
    decision = await scored_decision(db_session, user)
    await client.patch(
        f"/api/v1/decisions/{decision.id}", json={"status": "ARCHIVED"}, headers=auth_headers
    )
    r = await commit(client, auth_headers, decision, await alt_id(db_session, decision, "Option A"))
    assert r.status_code == 400 and "archived" in r.json()["error"]["fields"]["status"][0]
