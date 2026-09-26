"""
Reusable instrumentation for code that does not exist yet as concrete features (Gemini provider,
AI jobs, caches) plus the Celery integration.

Everything here funnels through app.observability.metrics, which bounds every label value, so
callers cannot introduce high-cardinality labels: user/decision IDs, prompts, model output and
exception text are never accepted as label values (exceptions are reduced to a fixed category).
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from time import perf_counter
from typing import Any

from app.observability import metrics

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------------------------
# AI provider calls
# --------------------------------------------------------------------------------------------


class AICallRecorder:
    """Handle yielded by observe_ai_call so providers can attach optional facts."""

    def __init__(self, provider: str) -> None:
        self._provider = provider
        self.status = "success"

    def record_tokens(self, input_tokens: int | None, output_tokens: int | None) -> None:
        metrics.record_ai_tokens(self._provider, input_tokens, output_tokens)

    def mark_fallback(self, reason: str) -> None:
        """The provider failed but a safe deterministic fallback was served."""
        self.status = "fallback"
        metrics.record_ai_fallback(reason)


@contextmanager
def observe_ai_call(provider: str, analysis_type: str) -> Iterator[AICallRecorder]:
    """
    Wrap ONE provider request (not the whole job). Records request count + duration, and on an
    exception a bounded status ("failure"), a rate-limit event when applicable, then re-raises
    so normal exception handling is untouched.

        with observe_ai_call("gemini", "risks") as call:
            response = await client.generate(...)
            call.record_tokens(response.usage.input, response.usage.output)
    """
    recorder = AICallRecorder(provider)
    start = perf_counter()
    try:
        yield recorder
    except BaseException as exc:
        recorder.status = "failure"
        if metrics.categorize_error(exc) == "rate_limit":
            metrics.AI_RATE_LIMITS.labels(
                provider=metrics.bounded(provider, metrics.ALLOWED_PROVIDER, "fake")
            ).inc()
        raise
    finally:
        metrics.record_ai_request(
            provider=provider,
            analysis_type=analysis_type,
            status=recorder.status,
            duration_seconds=perf_counter() - start,
        )


@contextmanager
def observe_ai_job(analysis_type: str) -> Iterator[None]:
    """Wrap a whole analysis job (may include several provider calls and retries)."""
    start = perf_counter()
    status = "success"
    try:
        yield
    except BaseException:
        status = "failure"
        raise
    finally:
        metrics.record_ai_job(status, analysis_type, perf_counter() - start)


# --------------------------------------------------------------------------------------------
# Caches
# --------------------------------------------------------------------------------------------


class CacheOpRecorder:
    def __init__(self) -> None:
        self.result = "miss"

    def hit(self) -> None:
        self.result = "hit"

    def miss(self) -> None:
        self.result = "miss"


@contextmanager
def observe_cache(cache_name: str, operation: str = "get") -> Iterator[CacheOpRecorder]:
    """Record one cache operation with timing. An exception is recorded as result="failure"."""
    recorder = CacheOpRecorder()
    start = perf_counter()
    try:
        yield recorder
    except BaseException:
        recorder.result = "failure"
        raise
    finally:
        metrics.record_cache_operation(
            cache_name,
            recorder.result if operation == "get" else "success",
            operation,
            perf_counter() - start,
        )


# --------------------------------------------------------------------------------------------
# Celery
# --------------------------------------------------------------------------------------------

WORKER_METRICS_PORT_ENV = "CELERY_METRICS_PORT"
DEFAULT_WORKER_METRICS_PORT = 9808
_task_started: dict[str, float] = {}
_installed = False


def _task_name(sender: Any, registry: Any) -> str:
    """Only names registered with the Celery app are used; anything else collapses to 'unknown'."""
    name = getattr(sender, "name", None)
    return name if isinstance(name, str) and name in registry else "unknown"


def install_celery_metrics(celery_app: Any) -> None:
    """
    Connect task lifecycle signals. Labels: task_name (from the app's task registry, never from
    arguments) and bounded status / error_category. Idempotent.
    """
    global _installed
    if _installed:
        return
    _installed = True

    from celery import signals

    registry = celery_app.tasks

    @signals.task_prerun.connect(weak=False)
    def _prerun(task_id=None, task=None, **_: Any) -> None:
        if task_id:
            _task_started[task_id] = perf_counter()

    @signals.task_postrun.connect(weak=False)
    def _postrun(task_id=None, task=None, state=None, **_: Any) -> None:
        start = _task_started.pop(task_id, None) if task_id else None
        name = _task_name(task, registry)
        if start is not None:
            metrics.CELERY_TASK_DURATION.labels(task_name=name).observe(perf_counter() - start)
        if state == "SUCCESS":
            metrics.CELERY_TASKS.labels(task_name=name, status="success").inc()

    @signals.task_failure.connect(weak=False)
    def _failure(sender=None, exception=None, **_: Any) -> None:
        name = _task_name(sender, registry)
        category = metrics.bounded(
            metrics.categorize_error(exception), metrics.ALLOWED_ERROR_CATEGORY
        )
        metrics.CELERY_TASKS.labels(task_name=name, status="failure").inc()
        metrics.CELERY_TASK_FAILURES.labels(task_name=name, error_category=category).inc()

    @signals.task_retry.connect(weak=False)
    def _retry(sender=None, **_: Any) -> None:
        name = _task_name(sender, registry)
        metrics.CELERY_TASKS.labels(task_name=name, status="retry").inc()
        metrics.CELERY_TASK_RETRIES.labels(task_name=name).inc()

    @signals.worker_ready.connect(weak=False)
    def _serve_metrics(**_: Any) -> None:
        start_worker_metrics_server()

    @signals.worker_process_shutdown.connect(weak=False)
    def _child_gone(pid=None, **_: Any) -> None:
        if os.environ.get("PROMETHEUS_MULTIPROC_DIR") and pid:
            from prometheus_client import multiprocess

            multiprocess.mark_process_dead(pid)


def start_worker_metrics_server() -> None:
    """
    The worker is a separate process from the API, so its counters cannot appear on the API's
    /metrics. Prefork children run the tasks, so multiprocess mode aggregates their files here.
    """
    from prometheus_client import CollectorRegistry, multiprocess, start_http_server

    port = int(os.environ.get(WORKER_METRICS_PORT_ENV, DEFAULT_WORKER_METRICS_PORT))
    if os.environ.get("PROMETHEUS_MULTIPROC_DIR"):
        registry = CollectorRegistry()
        multiprocess.MultiProcessCollector(registry)
        start_http_server(port, registry=registry)
    else:
        start_http_server(port)
    logger.info("Celery worker metrics served on :%s", port)
