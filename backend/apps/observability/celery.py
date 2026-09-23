"""Celery signal instrumentation for low-cardinality task metrics."""

from __future__ import annotations

from time import perf_counter

from celery import signals

from . import metrics

_TASK_STARTS: dict[str, float] = {}


def _task_name(sender) -> str:
    name = getattr(sender, "name", "unknown")
    if name.startswith("apps."):
        return name
    if name.startswith("config."):
        return name
    return "unknown"


@signals.task_prerun.connect
def task_prerun_handler(task_id=None, sender=None, **kwargs):
    if task_id:
        _TASK_STARTS[task_id] = perf_counter()


@signals.task_success.connect
def task_success_handler(sender=None, result=None, **kwargs):
    name = _task_name(sender)
    metrics.CELERY_TASKS.labels(task_name=name, status="success").inc()


@signals.task_failure.connect
def task_failure_handler(task_id=None, exception=None, sender=None, **kwargs):
    name = _task_name(sender)
    metrics.CELERY_TASKS.labels(task_name=name, status="failure").inc()
    metrics.CELERY_TASK_FAILURES.labels(
        task_name=name,
        error_category=metrics.categorize_error(exception),
    ).inc()


@signals.task_retry.connect
def task_retry_handler(request=None, sender=None, **kwargs):
    metrics.CELERY_TASK_RETRIES.labels(task_name=_task_name(sender)).inc()


@signals.task_postrun.connect
def task_postrun_handler(task_id=None, sender=None, **kwargs):
    start = _TASK_STARTS.pop(task_id, None) if task_id else None
    if start is not None:
        metrics.CELERY_TASK_DURATION.labels(task_name=_task_name(sender)).observe(
            max(perf_counter() - start, 0)
        )
