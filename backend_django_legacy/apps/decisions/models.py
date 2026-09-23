"""
Decision/Alternative/Criterion/AlternativeScore — docs/04-database-design.md §4.3-4.6.
Ownership: every nested model resolves back to `decision.owner` (NFR-002, BR-008).
"""

from django.conf import settings
from django.db import models

from apps.common.models import TimeStampedModel

SCORE_MIN = settings.SCORE_MIN
SCORE_MAX = settings.SCORE_MAX


class Decision(TimeStampedModel):
    """STT-DEC lifecycle — docs/02-software-requirements-specification.md §7.1."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT"
        SCORED = "SCORED"
        COMMITTED = "COMMITTED"
        UNDER_REVIEW = "UNDER_REVIEW"
        REVIEWED = "REVIEWED"
        ARCHIVED = "ARCHIVED"

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="decisions"
    )
    title = models.CharField(max_length=200)
    context = models.TextField(blank=True, default="")
    category = models.CharField(max_length=64, blank=True, default="")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    deadline = models.DateField(null=True, blank=True)
    archived_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["owner", "status"]),
            models.Index(fields=["owner", "-updated_at"]),
        ]
        ordering = ["-updated_at"]

    def __str__(self) -> str:
        return self.title


class Alternative(TimeStampedModel):
    decision = models.ForeignKey(Decision, on_delete=models.CASCADE, related_name="alternatives")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    position = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["decision", "name"], name="unique_alternative_name"),
        ]
        indexes = [models.Index(fields=["decision", "position"])]
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return self.name


class Criterion(TimeStampedModel):
    class Direction(models.TextChoices):
        BENEFIT = "benefit"
        COST = "cost"

    decision = models.ForeignKey(Decision, on_delete=models.CASCADE, related_name="criteria")
    name = models.CharField(max_length=200)
    description = models.TextField(blank=True, default="")
    weight = models.DecimalField(max_digits=6, decimal_places=3)
    direction = models.CharField(max_length=8, choices=Direction.choices)
    is_active = models.BooleanField(default=True)
    position = models.IntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["decision", "name"], name="unique_criterion_name"),
            models.CheckConstraint(check=models.Q(weight__gt=0), name="criterion_weight_positive"),
        ]
        indexes = [models.Index(fields=["decision", "is_active"])]
        ordering = ["position", "created_at"]

    def __str__(self) -> str:
        return self.name


class AlternativeScore(TimeStampedModel):
    alternative = models.ForeignKey(Alternative, on_delete=models.CASCADE, related_name="scores")
    criterion = models.ForeignKey(Criterion, on_delete=models.CASCADE, related_name="scores")
    score = models.DecimalField(max_digits=6, decimal_places=3)
    rationale = models.TextField(blank=True, default="")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["alternative", "criterion"], name="unique_score_cell"),
            models.CheckConstraint(
                check=models.Q(score__gte=SCORE_MIN) & models.Q(score__lte=SCORE_MAX),
                name="score_within_configured_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.alternative_id}/{self.criterion_id}={self.score}"
