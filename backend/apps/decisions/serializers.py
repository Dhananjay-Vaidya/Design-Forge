from decimal import Decimal

from django.conf import settings
from rest_framework import serializers

from .models import Alternative, AlternativeScore, Criterion, Decision


class DecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Decision
        fields = [
            "id",
            "title",
            "context",
            "category",
            "status",
            "deadline",
            "created_at",
            "updated_at",
            "archived_at",
        ]
        read_only_fields = ["id", "status", "created_at", "updated_at", "archived_at"]


class DecisionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Decision
        fields = ["title", "context", "category", "deadline"]


class DecisionPatchSerializer(serializers.ModelSerializer):
    """API-11 — edit fields, or archive via status='ARCHIVED' (FR-003)."""

    class Meta:
        model = Decision
        fields = ["title", "context", "category", "deadline", "status"]

    def validate_status(self, value: str) -> str:
        if value != Decision.Status.ARCHIVED:
            raise serializers.ValidationError(
                "Status can only be set to ARCHIVED directly; other transitions are automatic "
                "or happen through dedicated actions (commit, outcome review)."
            )
        return value


class AlternativeSerializer(serializers.ModelSerializer):
    class Meta:
        model = Alternative
        fields = ["id", "decision", "name", "description", "position", "created_at", "updated_at"]
        read_only_fields = ["id", "decision", "created_at", "updated_at"]


class CriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Criterion
        fields = [
            "id",
            "decision",
            "name",
            "description",
            "weight",
            "direction",
            "is_active",
            "position",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "decision", "created_at", "updated_at"]

    def validate_weight(self, value):
        if value <= 0:
            raise serializers.ValidationError("Weight must be a positive number.")
        return value


class AlternativeScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = AlternativeScore
        fields = ["alternative", "criterion", "score", "rationale", "created_at", "updated_at"]


class ScoreCellSerializer(serializers.Serializer):
    """One cell in a PUT /decisions/{id}/scores request body (API-23)."""

    alternative_id = serializers.UUIDField()
    criterion_id = serializers.UUIDField()
    score = serializers.DecimalField(
        max_digits=6,
        decimal_places=3,
        min_value=Decimal(settings.SCORE_MIN),
        max_value=Decimal(settings.SCORE_MAX),
    )
    rationale = serializers.CharField(required=False, allow_blank=True, default="")


class ScoreUpsertRequestSerializer(serializers.Serializer):
    scores = ScoreCellSerializer(many=True)
