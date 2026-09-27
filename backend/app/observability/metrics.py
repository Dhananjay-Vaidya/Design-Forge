"""Bounded custom Prometheus metrics for DecisionForge AI."""

from __future__ import annotations

from contextlib import contextmanager
from time import perf_counter

from prometheus_client import Counter, Gauge, Histogram

ALLOWED_STATUS = {"success", "failure", "rejected", "fallback"}
ALLOWED_PROVIDER = {"gemini", "fake"}
ALLOWED_ANALYSIS_TYPE = {
    "risks",
    "assumptions",
    "scenarios",
    "devil_advocate",
    "summary",
    "clarifying_questions",
    "chat",
    "unknown",
}
ALLOWED_RESULT = {"hit", "miss", "success", "failure"}
ALLOWED_TOKEN_TYPE = {"input", "output"}
ALLOWED_ERROR_CATEGORY = {
    "timeout",
    "rate_limit",
    "validation",
    "provider",
    "database",
    "unknown",
}
ALLOWED_FALLBACK_REASON = {"provider", "rate_limit", "timeout", "validation", "unknown"}

DECISIONS_CREATED = Counter(
    "decisionforge_decisions_created_total",
    "Total number of decisions created.",
)
RANKING_CALCULATIONS = Counter(
    "decisionforge_ranking_calculations_total",
    "Total deterministic ranking calculations.",
    ["status"],
)
RANKING_DURATION = Histogram(
    "decisionforge_ranking_duration_seconds",
    "Deterministic ranking calculation duration.",
    buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5),
)
SENSITIVITY_ANALYSES = Counter(
    "decisionforge_sensitivity_analyses_total",
    "Total sensitivity analyses.",
    ["status"],
)
SCENARIO_COMPARISONS = Counter(
    "decisionforge_scenario_comparisons_total",
    "Total scenario comparisons.",
    ["status"],
)
OUTCOME_REVIEWS = Counter(
    "decisionforge_outcome_reviews_total",
    "Total outcome reviews.",
)

AI_REQUESTS = Counter(
    "decisionforge_ai_requests_total",
    "Total AI provider requests.",
    ["provider", "analysis_type", "status"],
)
AI_REQUEST_DURATION = Histogram(
    "decisionforge_ai_request_duration_seconds",
    "AI provider request duration.",
    ["provider", "analysis_type"],
    buckets=(0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60),
)
AI_RATE_LIMITS = Counter(
    "decisionforge_ai_rate_limit_total",
    "Total AI provider rate limit events.",
    ["provider"],
)
AI_QUOTA_REJECTIONS = Counter(
    "decisionforge_ai_quota_rejections_total",
    "Total AI quota rejections.",
)
AI_CACHE_OPERATIONS = Counter(
    "decisionforge_ai_cache_operations_total",
    "Total AI cache operations.",
    ["result"],
)
AI_CIRCUIT_BREAKER_OPEN = Gauge(
    "decisionforge_ai_circuit_breaker_open",
    "AI circuit breaker state, 1 when open.",
    ["provider"],
    multiprocess_mode="max",
)
AI_TOKEN_USAGE = Counter(
    "decisionforge_ai_token_usage_total",
    "AI token usage reported by provider.",
    ["provider", "token_type"],
)
AI_JOBS = Counter(
    "decisionforge_ai_jobs_total",
    "Total AI jobs.",
    ["status"],
)
AI_JOB_DURATION = Histogram(
    "decisionforge_ai_job_duration_seconds",
    "AI job duration.",
    ["analysis_type"],
    buckets=(0.1, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30, 60, 120),
)
AI_FALLBACKS = Counter(
    "decisionforge_ai_fallback_total",
    "Total AI fallbacks.",
    ["reason"],
)

CELERY_TASKS = Counter(
    "decisionforge_celery_tasks_total",
    "Total Celery tasks.",
    ["task_name", "status"],
)
CELERY_TASK_DURATION = Histogram(
    "decisionforge_celery_task_duration_seconds",
    "Celery task duration.",
    ["task_name"],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300),
)
CELERY_TASK_RETRIES = Counter(
    "decisionforge_celery_task_retries_total",
    "Total Celery task retries.",
    ["task_name"],
)
CELERY_TASK_FAILURES = Counter(
    "decisionforge_celery_task_failures_total",
    "Total Celery task failures.",
    ["task_name", "error_category"],
)

CACHE_OPERATIONS = Counter(
    "decisionforge_cache_operations_total",
    "Total cache operations.",
    ["cache_name", "result"],
)
CACHE_OPERATION_DURATION = Histogram(
    "decisionforge_cache_operation_duration_seconds",
    "Cache operation duration.",
    ["cache_name", "operation"],
    buckets=(0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1),
)


def bounded(value: str, allowed: set[str], default: str = "unknown") -> str:
    return value if value in allowed else default


def record_decision_created() -> None:
    DECISIONS_CREATED.inc()


def record_sensitivity(status: str = "success") -> None:
    SENSITIVITY_ANALYSES.labels(status=bounded(status, ALLOWED_STATUS, "failure")).inc()


def record_scenario_comparison(status: str = "success") -> None:
    SCENARIO_COMPARISONS.labels(status=bounded(status, ALLOWED_STATUS, "failure")).inc()


def record_outcome_review() -> None:
    OUTCOME_REVIEWS.inc()


@contextmanager
def ranking_timer():
    """
    success | rejected (the caller's input cannot be ranked: a 4xx application error, not a
    system fault) | failure (anything else).
    """
    from app.core.exceptions import AppError

    start = perf_counter()
    status = "success"
    try:
        yield
    except AppError as exc:
        status = "rejected" if exc.status_code < 500 else "failure"
        raise
    except Exception:
        status = "failure"
        raise
    finally:
        RANKING_CALCULATIONS.labels(status=status).inc()
        RANKING_DURATION.observe(perf_counter() - start)


def record_ai_request(
    *,
    provider: str,
    analysis_type: str,
    status: str,
    duration_seconds: float | None = None,
) -> None:
    provider = bounded(provider, ALLOWED_PROVIDER, "fake")
    analysis_type = bounded(analysis_type, ALLOWED_ANALYSIS_TYPE)
    status = bounded(status, ALLOWED_STATUS, "failure")
    AI_REQUESTS.labels(provider=provider, analysis_type=analysis_type, status=status).inc()
    if duration_seconds is not None:
        AI_REQUEST_DURATION.labels(provider=provider, analysis_type=analysis_type).observe(
            max(duration_seconds, 0)
        )


def record_cache_operation(
    cache_name: str, result: str, operation: str, duration_seconds: float
) -> None:
    safe_cache_name = "default" if cache_name != "ai" else "ai"
    safe_result = bounded(result, ALLOWED_RESULT, "failure")
    safe_operation = operation if operation in {"get", "set", "delete"} else "get"
    CACHE_OPERATIONS.labels(cache_name=safe_cache_name, result=safe_result).inc()
    if safe_cache_name == "ai" and safe_result in {"hit", "miss"}:
        AI_CACHE_OPERATIONS.labels(result=safe_result).inc()
    CACHE_OPERATION_DURATION.labels(
        cache_name=safe_cache_name,
        operation=safe_operation,
    ).observe(max(duration_seconds, 0))


def categorize_error(exc: BaseException | None) -> str:
    if exc is None:
        return "unknown"
    name = exc.__class__.__name__.lower()
    if "timeout" in name:
        return "timeout"
    if "ratelimit" in name or "rate_limit" in name or "quota" in name or "toomanyrequests" in name:
        return "rate_limit"
    if "validation" in name or "value" in name:
        return "validation"
    if "database" in name or "operational" in name or "integrity" in name:
        return "database"
    if any(k in name for k in ("provider", "apierror", "connection", "unavailable", "http")):
        return "provider"
    return "unknown"


def record_quota_rejection() -> None:
    AI_QUOTA_REJECTIONS.inc()


def set_circuit_breaker_open(provider: str, is_open: bool) -> None:
    AI_CIRCUIT_BREAKER_OPEN.labels(provider=bounded(provider, ALLOWED_PROVIDER, "fake")).set(
        1 if is_open else 0
    )


def record_ai_tokens(provider: str, input_tokens: int | None, output_tokens: int | None) -> None:
    """Only when the SDK reports usage; None/negative values are ignored."""
    p = bounded(provider, ALLOWED_PROVIDER, "fake")
    for token_type, count in (("input", input_tokens), ("output", output_tokens)):
        if count is not None and count > 0:
            AI_TOKEN_USAGE.labels(provider=p, token_type=token_type).inc(count)


def record_ai_fallback(reason: str) -> None:
    AI_FALLBACKS.labels(reason=bounded(reason, ALLOWED_FALLBACK_REASON)).inc()


def record_ai_job(status: str, analysis_type: str, duration_seconds: float | None = None) -> None:
    AI_JOBS.labels(status=bounded(status, ALLOWED_STATUS, "failure")).inc()
    if duration_seconds is not None:
        AI_JOB_DURATION.labels(analysis_type=bounded(analysis_type, ALLOWED_ANALYSIS_TYPE)).observe(
            max(duration_seconds, 0)
        )
