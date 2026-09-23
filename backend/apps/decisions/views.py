"""
UC-03..08 — Decision/Alternative/Criterion/Score CRUD and the deterministic ranking endpoint.
Every view resolves objects through `apps.decisions.selectors` (owner-scoped -> 404 on
cross-user access, NFR-002/AC-009) and never trusts a client-supplied score/weight/ranking
value as authoritative (BR-006).
"""

from django.utils import timezone
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.scoring.engine import (
    InsufficientAlternativesError,
    MissingScoresError,
    NoActiveCriteriaError,
)

from . import services
from .models import Alternative, AlternativeScore, Criterion, Decision
from .selectors import get_owned_alternative, get_owned_criterion, get_owned_decision
from .serializers import (
    AlternativeScoreSerializer,
    AlternativeSerializer,
    CriterionSerializer,
    DecisionCreateSerializer,
    DecisionPatchSerializer,
    DecisionSerializer,
    ScoreUpsertRequestSerializer,
)

ALLOWED_DECISION_ORDERING = {
    "updated_at",
    "-updated_at",
    "created_at",
    "-created_at",
    "title",
    "-title",
    "deadline",
    "-deadline",
}


class DecisionListCreateView(generics.ListCreateAPIView):
    """API-08 GET /decisions, API-09 POST /decisions."""

    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        return DecisionCreateSerializer if self.request.method == "POST" else DecisionSerializer

    def get_queryset(self):
        qs = Decision.objects.filter(owner=self.request.user)
        status_param = self.request.query_params.get("status")
        if status_param:
            qs = qs.filter(status=status_param)
        category = self.request.query_params.get("category")
        if category:
            qs = qs.filter(category=category)
        ordering = self.request.query_params.get("ordering", "-updated_at")
        if ordering not in ALLOWED_DECISION_ORDERING:
            raise ValidationError({"ordering": [f"Unknown ordering field '{ordering}'."]})
        return qs.order_by(ordering)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        decision = serializer.save(owner=request.user)
        return Response(DecisionSerializer(decision).data, status=201)


class DecisionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """API-10/11/12."""

    permission_classes = [IsAuthenticated]
    serializer_class = DecisionSerializer
    http_method_names = ["get", "patch", "delete"]

    def get_object(self):
        return get_owned_decision(self.request.user, self.kwargs["decision_id"])

    def get_serializer_class(self):
        return DecisionPatchSerializer if self.request.method == "PATCH" else DecisionSerializer

    def patch(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        decision = serializer.save()
        if decision.status == Decision.Status.ARCHIVED and decision.archived_at is None:
            decision.archived_at = timezone.now()
            decision.save(update_fields=["archived_at"])
        return Response(DecisionSerializer(decision).data)


class AlternativeListCreateView(generics.ListCreateAPIView):
    """API-14/15."""

    permission_classes = [IsAuthenticated]
    serializer_class = AlternativeSerializer

    def get_decision(self) -> Decision:
        return get_owned_decision(self.request.user, self.kwargs["decision_id"])

    def get_queryset(self):
        return self.get_decision().alternatives.all()

    def create(self, request, *args, **kwargs):
        decision = self.get_decision()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        if Alternative.objects.filter(decision=decision, name=name).exists():
            raise ValidationError(
                {"name": ["An alternative with this name already exists in this decision."]}
            )
        alternative = serializer.save(decision=decision)
        services.refresh_decision_status(decision)
        return Response(AlternativeSerializer(alternative).data, status=201)


class AlternativeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """API-16/17."""

    permission_classes = [IsAuthenticated]
    serializer_class = AlternativeSerializer

    def get_object(self):
        return get_owned_alternative(self.request.user, self.kwargs["alternative_id"])

    def perform_update(self, serializer):
        alternative = serializer.save()
        services.refresh_decision_status(alternative.decision)

    def perform_destroy(self, instance):
        decision = instance.decision
        instance.delete()
        services.refresh_decision_status(decision)


class CriterionListCreateView(generics.ListCreateAPIView):
    """API-18/19."""

    permission_classes = [IsAuthenticated]
    serializer_class = CriterionSerializer

    def get_decision(self) -> Decision:
        return get_owned_decision(self.request.user, self.kwargs["decision_id"])

    def get_queryset(self):
        return self.get_decision().criteria.all()

    def create(self, request, *args, **kwargs):
        decision = self.get_decision()
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        name = serializer.validated_data["name"]
        if Criterion.objects.filter(decision=decision, name=name).exists():
            raise ValidationError(
                {"name": ["A criterion with this name already exists in this decision."]}
            )
        criterion = serializer.save(decision=decision)
        services.refresh_decision_status(decision)
        return Response(CriterionSerializer(criterion).data, status=201)


class CriterionDetailView(generics.RetrieveUpdateDestroyAPIView):
    """API-20/21."""

    permission_classes = [IsAuthenticated]
    serializer_class = CriterionSerializer

    def get_object(self):
        return get_owned_criterion(self.request.user, self.kwargs["criterion_id"])

    def perform_update(self, serializer):
        criterion = serializer.save()
        services.refresh_decision_status(criterion.decision)

    def perform_destroy(self, instance):
        decision = instance.decision
        instance.delete()
        services.refresh_decision_status(decision)


class ScoresView(APIView):
    """API-22 GET /decisions/{id}/scores, API-23 PUT /decisions/{id}/scores."""

    permission_classes = [IsAuthenticated]

    def get(self, request, decision_id):
        decision = get_owned_decision(request.user, decision_id)
        scores = AlternativeScore.objects.filter(alternative__decision=decision)
        return Response(AlternativeScoreSerializer(scores, many=True).data)

    def put(self, request, decision_id):
        decision = get_owned_decision(request.user, decision_id)
        serializer = ScoreUpsertRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        updated, missing = services.upsert_scores(decision, serializer.validated_data["scores"])
        return Response(
            {
                "updated": updated,
                "missing_cells": [
                    {"alternative_id": m.alternative_id, "criterion_id": m.criterion_id}
                    for m in missing
                ],
            }
        )


class RankingView(APIView):
    """API-24 GET /decisions/{id}/ranking — UC-07, AC-002/003/004."""

    permission_classes = [IsAuthenticated]

    def get(self, request, decision_id):
        decision = get_owned_decision(request.user, decision_id)
        try:
            result = services.calculate_ranking(decision)
        except InsufficientAlternativesError as exc:
            raise ValidationError(
                {"alternatives": ["At least two alternatives are required."]}
            ) from exc
        except NoActiveCriteriaError as exc:
            raise ValidationError(
                {"criteria": ["At least one active criterion is required."]}
            ) from exc
        except MissingScoresError as exc:
            alt_names = {str(a.id): a.name for a in decision.alternatives.all()}
            crit_names = {str(c.id): c.name for c in decision.criteria.all()}
            messages = [
                f"Missing score for alternative '{alt_names.get(m.alternative_id, m.alternative_id)}' "
                f"on criterion '{crit_names.get(m.criterion_id, m.criterion_id)}'."
                for m in exc.missing
            ]
            raise ValidationError({"scores": messages}) from exc

        return Response(
            {
                "decision_id": str(decision.id),
                "deterministic": True,
                "computed_at": timezone.now().isoformat(),
                "calculation_method": result.calculation_method,
                "weights_normalized": {k: str(v) for k, v in result.weights_normalized.items()},
                "ranking": [
                    {
                        "rank": r.rank,
                        "alternative_id": r.alternative_id,
                        "name": r.name,
                        "total": str(r.total),
                        "breakdown": {k: str(v) for k, v in r.breakdown.items()},
                    }
                    for r in result.ranking
                ],
                "sensitivity": {
                    "leader_stable": result.sensitivity.leader_stable,
                    "note": result.sensitivity.note,
                    "margin": str(result.sensitivity.margin),
                },
            }
        )
