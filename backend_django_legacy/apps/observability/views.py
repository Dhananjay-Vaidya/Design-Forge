"""Health/readiness endpoints — OBS-06, docs/08-prometheus-grafana-observability.md §13.

Prometheus /metrics is added in the observability phase (DF-S-021); these two endpoints are
needed from Phase 1 so the stack's own health can be verified (`docs/13-...md` §5).
"""

from django.db import connections
from django.db.utils import OperationalError
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def healthz(request):
    """Liveness — process is up. No dependency checks (keep this cheap)."""
    return Response({"status": "ok"})


@api_view(["GET"])
@permission_classes([AllowAny])
def readyz(request):
    """Readiness — DB and Redis reachable; 503 if a dependency is down."""
    checks = {"database": _check_database(), "redis": _check_redis()}
    healthy = all(checks.values())
    return Response(
        {"status": "ok" if healthy else "unavailable", "checks": checks},
        status=200 if healthy else 503,
    )


def _check_database() -> bool:
    try:
        connections["default"].cursor()
        return True
    except OperationalError:
        return False


def _check_redis() -> bool:
    import redis
    from django.conf import settings

    try:
        client = redis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
        return bool(client.ping())
    except Exception:
        return False
