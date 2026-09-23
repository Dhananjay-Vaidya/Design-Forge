from decimal import Decimal

import pytest

from apps.decisions.models import Alternative, AlternativeScore, Decision
from tests.factories import (
    AlternativeFactory,
    CriterionFactory,
    DecisionFactory,
    UserFactory,
)

pytestmark = pytest.mark.django_db


def test_create_decision_returns_to_owner_only(auth_client):
    response = auth_client.post(
        "/api/v1/decisions",
        {"title": "Job offer decision", "context": "A vs B", "category": "career"},
        format="json",
    )
    assert response.status_code == 201
    assert response.data["status"] == "DRAFT"
    assert response.data["title"] == "Job offer decision"


def test_list_decisions_only_returns_own(auth_client, user):
    DecisionFactory(owner=user, title="Mine")
    DecisionFactory(owner=UserFactory(), title="Someone else's")

    response = auth_client.get("/api/v1/decisions")
    assert response.status_code == 200
    titles = [d["title"] for d in response.data["results"]]
    assert titles == ["Mine"]


def test_cross_user_access_returns_404_not_403(auth_client):
    other_decision = DecisionFactory(owner=UserFactory())
    response = auth_client.get(f"/api/v1/decisions/{other_decision.id}")
    assert response.status_code == 404
    assert response.data["error"]["code"] == "not_found"


def test_patch_decision_can_archive(auth_client, user):
    decision = DecisionFactory(owner=user)
    response = auth_client.patch(
        f"/api/v1/decisions/{decision.id}", {"status": "ARCHIVED"}, format="json"
    )
    assert response.status_code == 200
    assert response.data["status"] == "ARCHIVED"
    decision.refresh_from_db()
    assert decision.archived_at is not None


def test_patch_decision_rejects_arbitrary_status(auth_client, user):
    decision = DecisionFactory(owner=user)
    response = auth_client.patch(
        f"/api/v1/decisions/{decision.id}", {"status": "COMMITTED"}, format="json"
    )
    assert response.status_code == 400


def test_delete_decision_cascades(auth_client, user):
    decision = DecisionFactory(owner=user)
    AlternativeFactory(decision=decision)
    response = auth_client.delete(f"/api/v1/decisions/{decision.id}")
    assert response.status_code == 204
    assert not Decision.objects.filter(id=decision.id).exists()
    assert not Alternative.objects.filter(decision_id=decision.id).exists()


def test_add_alternative_and_reject_duplicate_name(auth_client, user):
    decision = DecisionFactory(owner=user)
    response = auth_client.post(
        f"/api/v1/decisions/{decision.id}/alternatives", {"name": "Offer A"}, format="json"
    )
    assert response.status_code == 201

    dup_response = auth_client.post(
        f"/api/v1/decisions/{decision.id}/alternatives", {"name": "Offer A"}, format="json"
    )
    assert dup_response.status_code == 400
    assert "name" in dup_response.data["error"]["fields"]


def test_add_alternative_to_other_users_decision_is_404(auth_client):
    other_decision = DecisionFactory(owner=UserFactory())
    response = auth_client.post(
        f"/api/v1/decisions/{other_decision.id}/alternatives", {"name": "X"}, format="json"
    )
    assert response.status_code == 404


def test_add_criterion_rejects_non_positive_weight(auth_client, user):
    decision = DecisionFactory(owner=user)
    response = auth_client.post(
        f"/api/v1/decisions/{decision.id}/criteria",
        {"name": "Cost", "weight": "0", "direction": "cost"},
        format="json",
    )
    assert response.status_code == 400


def test_add_criterion_rejects_bad_direction(auth_client, user):
    decision = DecisionFactory(owner=user)
    response = auth_client.post(
        f"/api/v1/decisions/{decision.id}/criteria",
        {"name": "Cost", "weight": "1", "direction": "sideways"},
        format="json",
    )
    assert response.status_code == 400


def test_delete_alternative_scoped_to_owner(auth_client, user):
    decision = DecisionFactory(owner=user)
    alt = AlternativeFactory(decision=decision)
    response = auth_client.delete(f"/api/v1/alternatives/{alt.id}")
    assert response.status_code == 204
    assert not Alternative.objects.filter(id=alt.id).exists()


def _build_scorable_decision(user):
    decision = DecisionFactory(owner=user)
    a1 = AlternativeFactory(decision=decision, name="Offer A", position=0)
    a2 = AlternativeFactory(decision=decision, name="Offer B", position=1)
    c1 = CriterionFactory(
        decision=decision, name="Salary", weight=Decimal("6"), direction="benefit"
    )
    c2 = CriterionFactory(decision=decision, name="Cost", weight=Decimal("4"), direction="cost")
    return decision, a1, a2, c1, c2


def test_scores_upsert_and_missing_cells(auth_client, user):
    decision, a1, a2, c1, c2 = _build_scorable_decision(user)

    response = auth_client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        {
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 8},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 6},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 7},
            ]
        },
        format="json",
    )
    assert response.status_code == 200
    assert response.data["updated"] == 3
    assert response.data["missing_cells"] == [
        {"alternative_id": str(a2.id), "criterion_id": str(c2.id)}
    ]
    assert AlternativeScore.objects.count() == 3

    decision.refresh_from_db()
    assert decision.status == Decision.Status.DRAFT  # incomplete matrix


def test_scores_upsert_rejects_out_of_range_score(auth_client, user):
    decision, a1, a2, c1, c2 = _build_scorable_decision(user)
    response = auth_client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        {"scores": [{"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 99}]},
        format="json",
    )
    assert response.status_code == 400


def test_full_matrix_transitions_decision_to_scored(auth_client, user):
    decision, a1, a2, c1, c2 = _build_scorable_decision(user)
    auth_client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        {
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 10},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 10},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 1},
                {"alternative_id": str(a2.id), "criterion_id": str(c2.id), "score": 1},
            ]
        },
        format="json",
    )
    decision.refresh_from_db()
    assert decision.status == Decision.Status.SCORED


def test_ranking_deterministic_totals(auth_client, user):
    decision, a1, a2, c1, c2 = _build_scorable_decision(user)
    auth_client.put(
        f"/api/v1/decisions/{decision.id}/scores",
        {
            "scores": [
                {"alternative_id": str(a1.id), "criterion_id": str(c1.id), "score": 10},
                {"alternative_id": str(a1.id), "criterion_id": str(c2.id), "score": 10},
                {"alternative_id": str(a2.id), "criterion_id": str(c1.id), "score": 1},
                {"alternative_id": str(a2.id), "criterion_id": str(c2.id), "score": 1},
            ]
        },
        format="json",
    )

    response = auth_client.get(f"/api/v1/decisions/{decision.id}/ranking")
    assert response.status_code == 200
    assert response.data["deterministic"] is True
    # Weight/score fields round-trip through DB DecimalFields (fixed decimal_places), so compare
    # numeric value rather than exact string formatting (e.g. "0.6000" == "0.6" numerically).
    weights = {k: Decimal(v) for k, v in response.data["weights_normalized"].items()}
    assert weights == {str(c1.id): Decimal("0.6"), str(c2.id): Decimal("0.4")}
    assert response.data["ranking"][0]["alternative_id"] == str(a1.id)
    assert Decimal(response.data["ranking"][0]["total"]) == Decimal("0.6")
    assert Decimal(response.data["ranking"][1]["total"]) == Decimal("0.4")
    assert response.data["sensitivity"]["leader_stable"] is True


def test_ranking_with_fewer_than_two_alternatives_returns_400(auth_client, user):
    decision = DecisionFactory(owner=user)
    AlternativeFactory(decision=decision)
    CriterionFactory(decision=decision)
    response = auth_client.get(f"/api/v1/decisions/{decision.id}/ranking")
    assert response.status_code == 400
    assert "alternatives" in response.data["error"]["fields"]


def test_ranking_with_missing_scores_lists_them(auth_client, user):
    decision, a1, a2, c1, c2 = _build_scorable_decision(user)
    # No scores entered at all.
    response = auth_client.get(f"/api/v1/decisions/{decision.id}/ranking")
    assert response.status_code == 400
    assert "scores" in response.data["error"]["fields"]
    assert len(response.data["error"]["fields"]["scores"]) == 4


def test_ranking_requires_authentication(api_client):
    decision = DecisionFactory()
    response = api_client.get(f"/api/v1/decisions/{decision.id}/ranking")
    assert response.status_code == 401
