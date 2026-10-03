"""Templates (FX-01), save-as-template (FX-16) and demo mode (FX-20)."""

import uuid
from decimal import Decimal

import pytest
from httpx import AsyncClient
from prometheus_client import REGISTRY
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import create_access_token, hash_password
from app.domain import templates as catalogue
from app.models.decision import Alternative, Criterion, Decision
from app.models.user import User, UserProfile

pytestmark = pytest.mark.asyncio

JOB = "builtin:job-offer"


def sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def _second_user(db: AsyncSession) -> tuple[User, dict]:
    other = User(
        email=f"o-{uuid.uuid4().hex[:8]}@example.com", password_hash=hash_password("x" * 12)
    )
    db.add(other)
    await db.commit()
    db.add(UserProfile(user_id=other.id))
    await db.commit()
    return other, {"Authorization": f"Bearer {create_access_token(other.id)}"}


async def _from_template(client: AsyncClient, headers: dict, **body) -> dict:
    payload = {"template_id": JOB, "title": "My decision", **body}
    r = await client.post("/api/v1/decisions/from-template", json=payload, headers=headers)
    assert r.status_code == 201, r.text
    return r.json()


async def _criteria(db: AsyncSession, decision_id: str) -> list[Criterion]:
    rows = await db.execute(
        select(Criterion)
        .where(Criterion.decision_id == uuid.UUID(decision_id))
        .order_by(Criterion.position)
    )
    return list(rows.scalars())


# ---- catalogue ---------------------------------------------------------------------------------


async def test_catalogue_lists_every_builtin_with_valid_criteria(client: AsyncClient, auth_headers):
    r = await client.get("/api/v1/templates", headers=auth_headers)
    assert r.status_code == 200
    items = r.json()
    assert [t["id"] for t in items] == [f"builtin:{t.slug}" for t in catalogue.BUILTIN_TEMPLATES]
    assert len(items) >= 6
    for t in items:
        assert t["kind"] == "builtin" and t["name"] and t["title_hint"]
        assert 4 <= len(t["criteria"]) <= 8
        assert len({c["name"] for c in t["criteria"]}) == len(t["criteria"])  # unique names
        for c in t["criteria"]:
            assert Decimal(c["weight"]) > 0 and c["direction"] in {"benefit", "cost"}
    assert any(c["direction"] == "cost" for t in items for c in t["criteria"])


async def test_templates_require_authentication(client: AsyncClient):
    assert (await client.get("/api/v1/templates")).status_code == 401
    assert (await client.post("/api/v1/demo/decision")).status_code == 401


# ---- create from template ----------------------------------------------------------------------


async def test_create_from_template_clones_criteria_and_options_exactly(
    client: AsyncClient, db_session: AsyncSession, auth_headers
):
    spec = catalogue.get_builtin(JOB)
    d = await _from_template(
        client, auth_headers, title="Offer showdown", options=["Alpha", "  Beta  ", ""]
    )
    assert d["title"] == "Offer showdown"
    assert d["category"] == spec.category and d["status"] == "DRAFT"

    criteria = await _criteria(db_session, d["id"])
    assert [(c.name, c.weight, c.direction, c.is_active) for c in criteria] == [
        (c.name, c.weight, c.direction, True) for c in spec.criteria
    ]
    assert [c.position for c in criteria] == list(range(len(spec.criteria)))

    alts = (
        await db_session.execute(
            select(Alternative)
            .where(Alternative.decision_id == uuid.UUID(d["id"]))
            .order_by(Alternative.position)
        )
    ).scalars()
    assert [a.name for a in alts] == ["Alpha", "Beta"]  # trimmed, blank dropped, ordered


async def test_category_override_and_context(client: AsyncClient, auth_headers):
    d = await _from_template(client, auth_headers, category="Personal", context="  because  ")
    assert d["category"] == "Personal" and d["context"] == "because"


async def test_template_creation_is_counted_by_bounded_source(client: AsyncClient, auth_headers):
    before = sample("decisionforge_decisions_from_template_total", source="builtin")
    created = sample("decisionforge_decisions_created_total")
    await _from_template(client, auth_headers)
    assert sample("decisionforge_decisions_from_template_total", source="builtin") == before + 1
    assert sample("decisionforge_decisions_created_total") == created + 1


@pytest.mark.parametrize(
    "body,field",
    [
        ({"title": "   "}, "title"),
        ({"options": ["Same", "same"]}, "options"),
        ({"options": [f"Option {i}" for i in range(21)]}, "options"),
        ({"options": ["x" * 201]}, "options"),
    ],
)
async def test_invalid_requests_are_rejected_and_create_nothing(
    client: AsyncClient, db_session: AsyncSession, auth_headers, body, field
):
    r = await client.post(
        "/api/v1/decisions/from-template",
        json={"template_id": JOB, "title": "T", **body},
        headers=auth_headers,
    )
    assert r.status_code == 400
    assert field in r.json()["error"]["fields"]
    assert (await db_session.execute(select(func.count()).select_from(Decision))).scalar_one() == 0


async def test_unknown_template_is_404(client: AsyncClient, auth_headers):
    for bad in ("builtin:nope", "job-offer", str(uuid.uuid4()), "not-a-uuid"):
        r = await client.post(
            "/api/v1/decisions/from-template",
            json={"template_id": bad, "title": "T"},
            headers=auth_headers,
        )
        assert r.status_code == 404, bad


# ---- save as template + ownership --------------------------------------------------------------


async def test_save_and_reuse_a_personal_template_round_trips(
    client: AsyncClient, db_session: AsyncSession, auth_headers
):
    source = await _from_template(client, auth_headers, title="Source")
    # Deactivate one criterion: inactive criteria must not be templated.
    first = (await _criteria(db_session, source["id"]))[0]
    await client.patch(
        f"/api/v1/criteria/{first.id}", json={"is_active": False}, headers=auth_headers
    )

    saved = await client.post(
        "/api/v1/templates",
        json={"decision_id": source["id"], "name": "My offer rubric", "description": "mine"},
        headers=auth_headers,
    )
    assert saved.status_code == 201
    mine = saved.json()
    assert mine["kind"] == "mine" and mine["name"] == "My offer rubric"
    spec = catalogue.get_builtin(JOB)
    assert [c["name"] for c in mine["criteria"]] == [c.name for c in spec.criteria[1:]]

    listed = (await client.get("/api/v1/templates", headers=auth_headers)).json()
    assert [t["id"] for t in listed if t["kind"] == "mine"] == [mine["id"]]

    before = sample("decisionforge_decisions_from_template_total", source="mine")
    clone = await _from_template(client, auth_headers, template_id=mine["id"], title="Reuse")
    assert sample("decisionforge_decisions_from_template_total", source="mine") == before + 1
    names = [c.name for c in await _criteria(db_session, clone["id"])]
    assert names == [c.name for c in spec.criteria[1:]]


async def test_save_template_validation(client: AsyncClient, db_session, auth_headers):
    empty = await client.post(
        "/api/v1/decisions", json={"title": "No criteria"}, headers=auth_headers
    )
    r = await client.post(
        "/api/v1/templates",
        json={"decision_id": empty.json()["id"], "name": "Nope"},
        headers=auth_headers,
    )
    assert r.status_code == 400 and "decision_id" in r.json()["error"]["fields"]

    source = await _from_template(client, auth_headers)
    body = {"decision_id": source["id"], "name": "Dup"}
    assert (
        await client.post("/api/v1/templates", json=body, headers=auth_headers)
    ).status_code == 201
    dup = await client.post("/api/v1/templates", json=body, headers=auth_headers)
    assert dup.status_code == 400 and "name" in dup.json()["error"]["fields"]


async def test_templates_are_private_to_their_owner(
    client: AsyncClient, db_session: AsyncSession, auth_headers
):
    source = await _from_template(client, auth_headers)
    mine = (
        await client.post(
            "/api/v1/templates",
            json={"decision_id": source["id"], "name": "Private"},
            headers=auth_headers,
        )
    ).json()
    _other, other_headers = await _second_user(db_session)

    # Not listed, not usable, not deletable by someone else.
    listed = (await client.get("/api/v1/templates", headers=other_headers)).json()
    assert all(t["kind"] == "builtin" for t in listed)
    use = await client.post(
        "/api/v1/decisions/from-template",
        json={"template_id": mine["id"], "title": "Steal"},
        headers=other_headers,
    )
    assert use.status_code == 404
    assert (
        await client.delete(f"/api/v1/templates/{mine['id']}", headers=other_headers)
    ).status_code == 404

    # Cannot template someone else's decision either.
    r = await client.post(
        "/api/v1/templates",
        json={"decision_id": source["id"], "name": "Stolen"},
        headers=other_headers,
    )
    assert r.status_code == 404

    # The owner can delete; afterwards it is gone.
    assert (
        await client.delete(f"/api/v1/templates/{mine['id']}", headers=auth_headers)
    ).status_code == 204
    assert (
        await client.delete(f"/api/v1/templates/{mine['id']}", headers=auth_headers)
    ).status_code == 404


# ---- demo mode ---------------------------------------------------------------------------------


async def test_demo_creates_a_scored_close_call_and_is_resettable(
    client: AsyncClient, db_session: AsyncSession, auth_headers
):
    assert (await client.get("/api/v1/demo", headers=auth_headers)).json() == {"decision_id": None}

    created = await client.post("/api/v1/demo/decision", headers=auth_headers)
    assert created.status_code == 201
    first = created.json()
    assert first["status"] == "SCORED"  # fully scored: rankable immediately
    assert (await client.get("/api/v1/demo", headers=auth_headers)).json() == {
        "decision_id": first["id"]
    }

    ranking = (
        await client.get(f"/api/v1/decisions/{first['id']}/ranking", headers=auth_headers)
    ).json()
    assert len(ranking["ranking"]) == 3
    assert ranking["sensitivity"]["leader_stable"] is False  # the demo is deliberately close

    reset = (await client.post("/api/v1/demo/decision", headers=auth_headers)).json()
    assert reset["id"] != first["id"]
    assert (
        await client.get(f"/api/v1/decisions/{first['id']}", headers=auth_headers)
    ).status_code == 404
    count = (await db_session.execute(select(func.count()).select_from(Decision))).scalar_one()
    assert count == 1  # reset replaced it, no pile-up
    assert sample("decisionforge_decisions_from_template_total", source="demo") >= 2


async def test_demo_status_ignores_a_deleted_sample_and_other_users(
    client: AsyncClient, db_session: AsyncSession, auth_headers
):
    demo = (await client.post("/api/v1/demo/decision", headers=auth_headers)).json()
    _other, other_headers = await _second_user(db_session)
    assert (await client.get("/api/v1/demo", headers=other_headers)).json() == {"decision_id": None}

    await client.delete(f"/api/v1/decisions/{demo['id']}", headers=auth_headers)
    assert (await client.get("/api/v1/demo", headers=auth_headers)).json() == {"decision_id": None}
