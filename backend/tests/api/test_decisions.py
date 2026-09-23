"""
Decisions API tests — port of backend/tests/decisions/test_decisions_api.py's intent (Step 17).
Covers ownership isolation (AC-009), CRUD, duplicate-name rejection, score-range validation,
status auto-transition, and ranking success/AC-002/AC-004 failure paths.
"""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.decision import Alternative, Criterion, Decision
from app.models.user import User, UserProfile

pytestmark = pytest.mark.asyncio


async def _make_decision(db_session: AsyncSession, owner: User, **fields) -> Decision:
    decision = Decision(owner_id=owner.id, title=fields.pop("title", "Test Decision"), **fields)
    db_session.add(decision)
    await db_session.commit()  # must commit: the app under test uses a separate connection
    return decision


async def _make_alternative(
    db_session: AsyncSession, decision: Decision, name: str, position: int = 0
) -> Alternative:
    alt = Alternative(decision_id=decision.id, name=name, position=position)
    db_session.add(alt)
    await db_session.commit()
    return alt


async def _make_criterion(
    db_session: AsyncSession, decision: Decision, name: str, weight: Decimal, direction: str
) -> Criterion:
    crit = Criterion(decision_id=decision.id, name=name, weight=weight, direction=direction)
    db_session.add(crit)
    await db_session.commit()
    return crit


async def _other_user(db_session: AsyncSession) -> User:
    u = User(email=f"other-{uuid.uuid4().hex[:8]}@example.com", password_hash=hash_password("x"))
    db_session.add(u)
    await db_session.commit()
    db_session.add(UserProfile(user_id=u.id))
    await db_session.commit()
    return u


async def test_create_decision_returns_to_owner_only(client: AsyncClient, auth_headers: dict):
    response = await client.post(
        "/api/v1/decisions",
        json={"title": "Job offer decision", "context": "A vs B", "category": "career"},
        headers=auth_headers,
    )
    assert response.status_code == 201
    assert response.json()["status"] == "DRAFT"
    assert response.json()["title"] == "Job offer decision"


async def test_list_decisions_only_returns_own(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    await _make_decision(db_session, user, title="Mine")
    other = await _other_user(db_session)
    await _make_decision(db_session, other, title="Someone else's")

    response = await client.get("/api/v1/decisions", headers=auth_headers)
    assert response.status_code == 200
    titles = [d["title"] for d in response.json()["results"]]
    assert titles == ["Mine"]


async def test_cross_user_access_returns_404_not_403(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    other = await _other_user(db_session)
    other_decision = await _make_decision(db_session, other)
    response = await client.get(f"/api/v1/decisions/{other_decision.id}", headers=auth_headers)
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


async def test_patch_decision_can_archive(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    response = await client.patch(
        f"/api/v1/decisions/{decision.id}", json={"status": "ARCHIVED"}, headers=auth_headers
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ARCHIVED"
    assert response.json()["archived_at"] is not None


async def test_patch_decision_rejects_arbitrary_status(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    response = await client.patch(
        f"/api/v1/decisions/{decision.id}", json={"status": "COMMITTED"}, headers=auth_headers
    )
    assert response.status_code == 400


async def test_delete_decision_cascades(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    await _make_alternative(db_session, decision, "A")
    response = await client.delete(f"/api/v1/decisions/{decision.id}", headers=auth_headers)
    assert response.status_code == 204
    result = await db_session.execute(select(Decision).where(Decision.id == decision.id))
    assert result.scalar_one_or_none() is None


async def test_add_alternative_and_reject_duplicate_name(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    response = await client.post(
        f"/api/v1/decisions/{decision.id}/alternatives",
        json={"name": "Offer A"},
        headers=auth_headers,
    )
    assert response.status_code == 201

    dup_response = await client.post(
        f"/api/v1/decisions/{decision.id}/alternatives",
        json={"name": "Offer A"},
        headers=auth_headers,
    )
    assert dup_response.status_code == 400
    assert "name" in dup_response.json()["error"]["fields"]


async def test_add_criterion_rejects_non_positive_weight(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    response = await client.post(
        f"/api/v1/decisions/{decision.id}/criteria",
        json={"name": "Cost", "weight": "0", "direction": "cost"},
        headers=auth_headers,
    )
    assert response.status_code == 400


async def test_add_criterion_rejects_bad_direction(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    response = await client.post(
        f"/api/v1/decisions/{decision.id}/criteria",
        json={"name": "Cost", "weight": "1", "direction": "sideways"},
        headers=auth_headers,
    )
    # Pydantic's Literal rejection is a RequestValidationError, remapped by our exception handler
    # to 400 validation_error (not FastAPI's raw default 422) to match the Django error envelope.
    assert response.status_code == 400


async def _build_scorable_decision(db_session, user):
    decision = await _make_decision(db_session, user)
    a1 = await _make_alternative(db_session, decision, "Offer A", position=0)
    a2 = await _make_alternative(db_session, decision, "Offer B", position=1)
    c1 = await _make_criterion(db_session, decision, "Salary", Decimal("6"), "benefit")
    c2 = await _make_criterion(db_session, decision, "Cost", Decimal("4"), "cost")
    return decision, a1, a2, c1, c2


async def test_scores_upsert_and_missing_cells(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, a1, a2, c1, c2 = await _build_scorable_decision(db_session, user)

    response = await client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        json={
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 8},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 6},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 7},
            ]
        },
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["updated"] == 3
    assert body["missing_cells"] == [{"alternative_id": str(a2.id), "criterion_id": str(c2.id)}]


async def test_full_matrix_transitions_decision_to_scored(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, a1, a2, c1, c2 = await _build_scorable_decision(db_session, user)
    await client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        json={
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 10},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 10},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 1},
                {"alternative_id": str(a2.id), "criterion_id": str(c2.id), "score": 1},
            ]
        },
        headers=auth_headers,
    )
    response = await client.get(f"/api/v1/decisions/{decision.id}", headers=auth_headers)
    assert response.json()["status"] == "SCORED"


async def test_ranking_deterministic_totals(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, a1, a2, c1, c2 = await _build_scorable_decision(db_session, user)
    await client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        json={
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 10},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 10},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 1},
                {"alternative_id": str(a2.id), "criterion_id": str(c2.id), "score": 1},
            ]
        },
        headers=auth_headers,
    )

    response = await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    assert body["deterministic"] is True
    weights = {k: Decimal(v) for k, v in body["weights_normalized"].items()}
    assert weights == {str(c1.id): Decimal("0.6"), str(c2.id): Decimal("0.4")}
    assert body["ranking"][0]["alternative_id"] == str(a1.id)
    assert Decimal(body["ranking"][0]["total"]) == Decimal("0.6")
    assert Decimal(body["ranking"][1]["total"]) == Decimal("0.4")
    assert body["sensitivity"]["leader_stable"] is True


async def test_ranking_with_fewer_than_two_alternatives_returns_400(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _make_decision(db_session, user)
    await _make_alternative(db_session, decision, "Solo")
    await _make_criterion(db_session, decision, "Only", Decimal("1"), "benefit")
    response = await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    assert response.status_code == 400
    assert "alternatives" in response.json()["error"]["fields"]


async def test_ranking_with_missing_scores_lists_them(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, a1, a2, c1, c2 = await _build_scorable_decision(db_session, user)
    response = await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    assert response.status_code == 400
    assert "scores" in response.json()["error"]["fields"]
    assert len(response.json()["error"]["fields"]["scores"]) == 4


async def test_ranking_requires_authentication(
    client: AsyncClient, db_session: AsyncSession, user: User
):
    decision = await _make_decision(db_session, user)
    response = await client.get(f"/api/v1/decisions/{decision.id}/ranking")
    assert response.status_code == 401


async def test_add_alternative_to_other_users_decision_is_404(
    client: AsyncClient, db_session: AsyncSession, auth_headers: dict
):
    other = await _other_user(db_session)
    decision = await _make_decision(db_session, other)
    response = await client.post(
        f"/api/v1/decisions/{decision.id}/alternatives",
        json={"name": "Intruder"},
        headers=auth_headers,
    )
    assert response.status_code == 404


async def test_delete_alternative_scoped_to_owner(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    mine = await _make_alternative(db_session, await _make_decision(db_session, user), "Mine")
    other = await _other_user(db_session)
    theirs = await _make_alternative(db_session, await _make_decision(db_session, other), "Theirs")

    assert (
        await client.delete(f"/api/v1/alternatives/{theirs.id}", headers=auth_headers)
    ).status_code == 404
    assert (
        await client.delete(f"/api/v1/alternatives/{mine.id}", headers=auth_headers)
    ).status_code == 204
    remaining = (await db_session.execute(select(Alternative.id))).scalars().all()
    assert remaining == [theirs.id]


async def test_scores_upsert_rejects_out_of_range_score(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, a1, _a2, c1, _c2 = await _build_scorable_decision(db_session, user)
    response = await client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        json={"scores": [{"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 99}]},
        headers=auth_headers,
    )
    assert response.status_code == 400
