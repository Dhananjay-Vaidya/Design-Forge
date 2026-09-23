"""
Contract details preserved from the Django/DRF backend. Each assertion here was observed on the
running legacy backend (scripts/parity_django_vs_fastapi.py) -- not inferred from documentation.
"""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.decision import Alternative, AlternativeScore, Criterion, Decision
from app.models.user import User

DECISIONS = "/api/v1/decisions"


async def _decision_with_children(db: AsyncSession, owner: User, alternatives: int = 3):
    decision = Decision(owner_id=owner.id, title="Contract")
    db.add(decision)
    await db.commit()
    alts = [
        Alternative(decision_id=decision.id, name=f"A{i}", position=i) for i in range(alternatives)
    ]
    crit = Criterion(decision_id=decision.id, name="C", weight=Decimal("1"), direction="benefit")
    db.add_all([*alts, crit])
    await db.commit()
    db.add(AlternativeScore(alternative_id=alts[0].id, criterion_id=crit.id, score=Decimal("5")))
    await db.commit()
    return decision, alts, crit


# ---- pagination (DRF PageNumberPagination semantics) ------------------------------------------


@pytest.mark.parametrize("query", ["page=0", "page=abc", "page=-1", "page=99"])
async def test_invalid_or_out_of_range_page_is_404_invalid_page(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict, query: str
):
    decision, *_ = await _decision_with_children(db_session, user)
    for path in (DECISIONS, f"{DECISIONS}/{decision.id}/alternatives"):
        r = await client.get(f"{path}?{query}", headers=auth_headers)
        assert r.status_code == 404, (path, query)
        assert r.json()["error"] == {
            "code": "not_found",
            "message": "Invalid page.",
            "request_id": r.json()["error"]["request_id"],
        }


@pytest.mark.parametrize(
    "query,expected",
    [("", 20), ("page_size=0", 20), ("page_size=abc", 20), ("page_size=-5", 20)]
    + [("page_size=7", 7), ("page_size=100", 100), ("page_size=1000", 100)],
)
async def test_page_size_falls_back_or_clamps(
    client: AsyncClient, auth_headers: dict, query: str, expected: int
):
    r = await client.get(f"{DECISIONS}?{query}", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["page_size"] == expected


async def test_empty_first_page_is_valid(client: AsyncClient, auth_headers: dict):
    r = await client.get(DECISIONS, headers=auth_headers)
    assert r.json() == {"count": 0, "page": 1, "page_size": 20, "results": []}


async def test_unknown_status_filter_returns_empty_page_not_error(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    await _decision_with_children(db_session, user)
    r = await client.get(f"{DECISIONS}?status=BOGUS", headers=auth_headers)
    assert r.status_code == 200 and r.json()["count"] == 0


async def test_alternatives_and_criteria_lists_are_paginated_envelopes(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, *_ = await _decision_with_children(db_session, user, alternatives=3)
    r = await client.get(
        f"{DECISIONS}/{decision.id}/alternatives?page_size=2&page=2", headers=auth_headers
    )
    body = r.json()
    assert (body["count"], body["page"], body["page_size"], len(body["results"])) == (3, 2, 2, 1)
    r = await client.get(f"{DECISIONS}/{decision.id}/criteria", headers=auth_headers)
    assert set(r.json()) == {"count", "page", "page_size", "results"}


# ---- wire field names ------------------------------------------------------------------------------


async def test_alternative_and_criterion_use_decision_not_decision_id(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, alts, crit = await _decision_with_children(db_session, user)
    a = (await client.get(f"{DECISIONS}/{decision.id}/alternatives", headers=auth_headers)).json()
    c = (await client.get(f"{DECISIONS}/{decision.id}/criteria", headers=auth_headers)).json()
    for item in (a["results"][0], c["results"][0]):
        assert item["decision"] == str(decision.id)
        assert "decision_id" not in item
    created = await client.post(
        f"{DECISIONS}/{decision.id}/alternatives", json={"name": "New"}, headers=auth_headers
    )
    assert created.json()["decision"] == str(decision.id)


async def test_score_list_uses_alternative_and_criterion_keys(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, alts, crit = await _decision_with_children(db_session, user)
    r = await client.get(f"{DECISIONS}/{decision.id}/scores", headers=auth_headers)
    row = r.json()[0]
    assert row["alternative"] == str(alts[0].id) and row["criterion"] == str(crit.id)
    assert "alternative_id" not in row and "criterion_id" not in row


async def test_score_upsert_request_still_takes_alternative_id_and_criterion_id(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision, alts, crit = await _decision_with_children(db_session, user)
    r = await client.put(
        f"{DECISIONS}/{decision.id}/scores",
        json={
            "scores": [
                {"alternative_id": str(alts[1].id), "criterion_id": str(crit.id), "score": 7}
            ]
        },
        headers=auth_headers,
    )
    assert r.status_code == 200 and r.json()["updated"] == 1


# ---- error wording the frontend renders ---------------------------------------------------------------


async def test_validation_messages_use_drf_wording(client: AsyncClient, auth_headers: dict):
    r = await client.post(DECISIONS, json={"title": ""}, headers=auth_headers)
    assert r.json()["error"]["fields"]["title"] == ["This field may not be blank."]

    await client.get("/api/v1/auth/csrf")
    csrf = {"X-CSRFToken": client.cookies.get("df_csrftoken") or ""}
    r = await client.post(
        "/api/v1/auth/register", json={"email": "nope", "password": "short"}, headers=csrf
    )
    fields = r.json()["error"]["fields"]
    assert fields["email"] == ["Enter a valid email address."]
    assert fields["password"] == ["Ensure this field has at least 10 characters."]


async def test_unknown_uuid_is_404_not_found(client: AsyncClient, auth_headers: dict):
    r = await client.get(f"{DECISIONS}/{uuid.uuid4()}", headers=auth_headers)
    assert r.status_code == 404 and r.json()["error"]["code"] == "not_found"
