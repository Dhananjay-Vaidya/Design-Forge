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
# Registered AI action names (app/ai/actions.register adds to this and to ALLOWED_ANALYSIS_TYPE).
ALLOWED_AI_ACTIONS: set[str] = {"public_draft"}
ALLOWED_PROPOSAL_STATUS = {"created", "accepted", "rejected", "expired", "failed"}
ALLOWED_ITEM_OUTCOME = {"accepted", "rejected", "failed"}
ALLOWED_RESULT = {"hit", "miss", "success", "failure"}
ALLOWED_TOKEN_TYPE = {"input", "output"}
CONTACT_SUBMISSIONS = Counter(
    "decisionforge_contact_submissions_total",
    "Contact submissions by bounded outcome, without personal information.",
    ["result"],
)
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
DECISIONS_FROM_TEMPLATE = Counter(
    "decisionforge_decisions_from_template_total",
    "Decisions created from a template, by template source.",
    ["source"],
)
SNAPSHOTS_CREATED = Counter(
    "decisionforge_snapshots_created_total",
    "Immutable decision snapshots created, by reason.",
    ["reason"],
)
SNAPSHOT_COMPARES = Counter(
    "decisionforge_snapshot_compares_total",
    "Snapshot comparisons (version diffs) requested.",
)
SENSITIVITY_LAB = Counter(
    "decisionforge_sensitivity_lab_requests_total",
    "Sensitivity lab (tornado + flip points) requests.",
    ["status"],
)
EXPLANATIONS = Counter(
    "decisionforge_explanations_total",
    "Deterministic ranking explanations (template-based, no AI).",
    ["status"],
)
COMMITMENTS = Counter(
    "decisionforge_commitments_total",
    "Final choices recorded, by whether it was a first commitment or a changed mind.",
    ["kind"],
)
OUTCOME_REVIEWS = Counter(
    "decisionforge_outcome_reviews_total",
    "Outcome review lifecycle events.",
    ["status"],
)
CALIBRATION_VIEWS = Counter(
    "decisionforge_calibration_views_total",
    "Calibration summaries requested.",
)
AI_PROPOSALS = Counter(
    "decisionforge_ai_proposals_total",
    "AI proposals by action and lifecycle status.",
    ["action", "status"],
)
AI_PROPOSAL_ITEMS = Counter(
    "decisionforge_ai_proposal_acceptance_total",
    "What people did with individual AI-proposed items (acceptance rate = accepted / all).",
    ["action", "outcome"],
)
AI_INJECTION_FLAGS = Counter(
    "decisionforge_ai_injection_flags_total",
    "User-supplied AI inputs that contained a likely prompt-injection phrase (flag only).",
    ["action"],
)
AI_SCHEMA_FAILURES = Counter(
    "decisionforge_ai_schema_failures_total",
    "AI answers discarded because they failed schema or referential validation.",
    ["action"],
)
GUIDE_DRAFTS = Counter(
    "decisionforge_guide_draft_total",
    "Public home-page draft requests, by result.",
    ["result"],
)
GUIDE_DRAFT_DURATION = Histogram(
    "decisionforge_guide_draft_duration_seconds",
    "Time to answer a public home-page draft request.",
    buckets=(0.05, 0.25, 0.5, 1, 2.5, 5, 10, 20, 30),
)
GUIDE_BUDGET_REMAINING = Gauge(
    "decisionforge_guide_budget_remaining",
    "Model calls left today in the public lane's global budget.",
)
SCAFFOLD_HANDOFFS = Counter(
    "decisionforge_scaffold_handoffs_total",
    "Home-page drafts saved as decisions after sign-up, by result.",
    ["result"],
)
TEMPLATES_SAVED = Counter(
    "decisionforge_templates_saved_total",
    "Templates a user saved from one of their decisions.",
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


ALLOWED_TEMPLATE_SOURCE = {"builtin", "mine", "demo"}


def record_decision_from_template(source: str) -> None:
    DECISIONS_FROM_TEMPLATE.labels(source=bounded(source, ALLOWED_TEMPLATE_SOURCE)).inc()


ALLOWED_SNAPSHOT_REASON = {"manual", "analysis", "commitment"}


def record_snapshot_created(reason: str) -> None:
    SNAPSHOTS_CREATED.labels(reason=bounded(reason, ALLOWED_SNAPSHOT_REASON, "manual")).inc()


def record_snapshot_compare() -> None:
    SNAPSHOT_COMPARES.inc()


def record_sensitivity_lab(status: str) -> None:
    SENSITIVITY_LAB.labels(status=bounded(status, ALLOWED_STATUS, "failure")).inc()


def record_explanation(status: str) -> None:
    EXPLANATIONS.labels(status=bounded(status, ALLOWED_STATUS, "failure")).inc()


ALLOWED_COMMIT_KIND = {"first", "changed"}
ALLOWED_OUTCOME_STATUS = {"scheduled", "submitted", "cancelled"}


def record_commitment(kind: str) -> None:
    COMMITMENTS.labels(kind=bounded(kind, ALLOWED_COMMIT_KIND, "first")).inc()


def record_outcome_review(status: str) -> None:
    OUTCOME_REVIEWS.labels(status=bounded(status, ALLOWED_OUTCOME_STATUS, "scheduled")).inc()


def record_calibration_view() -> None:
    CALIBRATION_VIEWS.inc()


def record_ai_proposal(action: str, status: str) -> None:
    AI_PROPOSALS.labels(
        action=bounded(action, ALLOWED_AI_ACTIONS), status=bounded(status, ALLOWED_PROPOSAL_STATUS)
    ).inc()


def record_ai_proposal_item(action: str, outcome: str, count: int = 1) -> None:
    AI_PROPOSAL_ITEMS.labels(
        action=bounded(action, ALLOWED_AI_ACTIONS), outcome=bounded(outcome, ALLOWED_ITEM_OUTCOME)
    ).inc(count)


def record_ai_injection_flag(action: str) -> None:
    AI_INJECTION_FLAGS.labels(action=bounded(action, ALLOWED_AI_ACTIONS)).inc()


def record_ai_schema_failure(action: str) -> None:
    AI_SCHEMA_FAILURES.labels(action=bounded(action, ALLOWED_AI_ACTIONS)).inc()


ALLOWED_GUIDE_RESULT = {"ok", "capped", "rate_limited", "refused", "degraded"}
ALLOWED_HANDOFF_RESULT = {"created", "invalid", "reused"}


def record_guide_draft(result: str) -> None:
    GUIDE_DRAFTS.labels(result=bounded(result, ALLOWED_GUIDE_RESULT, "degraded")).inc()


def observe_guide_draft_duration(seconds: float) -> None:
    GUIDE_DRAFT_DURATION.observe(max(seconds, 0))


def set_guide_budget_remaining(value: int) -> None:
    GUIDE_BUDGET_REMAINING.set(value)


def record_scaffold_handoff(result: str) -> None:
    SCAFFOLD_HANDOFFS.labels(result=bounded(result, ALLOWED_HANDOFF_RESULT, "invalid")).inc()


def record_template_saved() -> None:
    TEMPLATES_SAVED.inc()


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
