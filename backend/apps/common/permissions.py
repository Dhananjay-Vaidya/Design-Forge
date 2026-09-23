"""
Object-level ownership enforcement — NFR-002, BR-008, AC-009.

Cross-user access must return 404, never 403 (avoids existence leakage). The pattern used
throughout is: querysets are always filtered by the owning user first (see each app's
`get_queryset`), so a non-owned object is simply absent and DRF's `get_object_or_404`-style
lookup naturally yields 404. `IsOwner` is a defense-in-depth second check for the rare case
an object-level permission check runs against an already-fetched instance.
"""

from rest_framework.permissions import BasePermission


def decision_owner_id(obj) -> str:
    """Resolve the owning user id for any decision-nested object."""
    if hasattr(obj, "owner_id"):
        return obj.owner_id
    if hasattr(obj, "decision"):
        return obj.decision.owner_id
    raise AttributeError(f"{obj!r} has no owner/decision to check ownership against")


class IsOwner(BasePermission):
    """Object-level permission: request.user must own the decision this object belongs to."""

    def has_object_permission(self, request, view, obj) -> bool:
        return decision_owner_id(obj) == request.user.id
