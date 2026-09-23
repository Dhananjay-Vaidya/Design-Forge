from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle


class UserWriteRateThrottle(SimpleRateThrottle):
    """Global per-user write throttle — docs/09-security-and-privacy.md §6, [REC] threshold (OQ-6)."""

    scope = "user_write"

    def allow_request(self, request, view):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return super().allow_request(request, view)

    def get_cache_key(self, request, view):
        if not request.user or not request.user.is_authenticated:
            ident = self.get_ident(request)
        else:
            ident = request.user.pk
        return self.cache_format % {"scope": self.scope, "ident": ident}


class AuthRateThrottle(ScopedRateThrottle):
    """Throttle for register/login to resist brute force — SEC threat T1."""

    scope = "auth"


class AIAnalysisRateThrottle(ScopedRateThrottle):
    """App-level rate limit on AI analysis requests, distinct from the daily quota (BR-013)."""

    scope = "ai_analysis"
