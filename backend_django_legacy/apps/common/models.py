import uuid

from django.db import models


class TimeStampedModel(models.Model):
    """Abstract base carrying created_at/updated_at per docs/04-database-design.md §4 conventions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class CreatedOnlyModel(models.Model):
    """Abstract base for insert-only rows (snapshots, AI results, activity events) — BR-007."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        abstract = True
