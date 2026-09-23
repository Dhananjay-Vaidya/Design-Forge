"""Ownership-scoped lookups — NFR-002/BR-008/AC-009: non-owned -> Http404 (never a content leak)."""

from django.shortcuts import get_object_or_404

from .models import Alternative, Criterion, Decision


def get_owned_decision(user, decision_id) -> Decision:
    return get_object_or_404(Decision, id=decision_id, owner=user)


def get_owned_alternative(user, alternative_id) -> Alternative:
    return get_object_or_404(Alternative, id=alternative_id, decision__owner=user)


def get_owned_criterion(user, criterion_id) -> Criterion:
    return get_object_or_404(Criterion, id=criterion_id, decision__owner=user)
