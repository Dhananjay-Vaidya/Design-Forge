"""Behavioural tests for the metric helpers, AI/cache wrappers and Celery signal handlers.
The provider here is a stub: no Gemini SDK is imported and no quota can ever be used."""

import pytest
from prometheus_client import REGISTRY

from app.observability import instrumentation as inst
from app.observability import metrics


def sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


class RateLimitError(Exception):
    pass


class ProviderTimeoutError(Exception):
    pass


def test_successful_ai_call_records_success_duration_and_tokens():
    before = sample(
        "decisionforge_ai_requests_total", provider="fake", analysis_type="risks", status="success"
    )
    with inst.observe_ai_call("fake", "risks") as call:
        call.record_tokens(120, 30)
    assert (
        sample(
            "decisionforge_ai_requests_total",
            provider="fake",
            analysis_type="risks",
            status="success",
        )
        == before + 1
    )
    assert sample("decisionforge_ai_token_usage_total", provider="fake", token_type="input") >= 120
    assert (
        sample(
            "decisionforge_ai_request_duration_seconds_count",
            provider="fake",
            analysis_type="risks",
        )
        >= 1
    )


def test_failed_ai_call_records_failure_and_reraises():
    lbl = {"provider": "gemini", "analysis_type": "summary", "status": "failure"}
    before = sample("decisionforge_ai_requests_total", **lbl)
    with pytest.raises(ProviderTimeoutError), inst.observe_ai_call("gemini", "summary"):
        raise ProviderTimeoutError("secret prompt text must never reach a label")
    assert sample("decisionforge_ai_requests_total", **lbl) == before + 1


def test_rate_limit_error_increments_rate_limit_counter():
    before = sample("decisionforge_ai_rate_limit_total", provider="gemini")
    with pytest.raises(RateLimitError), inst.observe_ai_call("gemini", "risks"):
        raise RateLimitError("429")
    assert sample("decisionforge_ai_rate_limit_total", provider="gemini") == before + 1


def test_fallback_is_recorded_with_bounded_reason():
    before = sample("decisionforge_ai_fallback_total", reason="unknown")
    with inst.observe_ai_call("gemini", "assumptions") as call:
        call.mark_fallback("user@example.com invented reason")  # not in the allowed set
    assert sample("decisionforge_ai_fallback_total", reason="unknown") == before + 1
    assert (
        sample(
            "decisionforge_ai_requests_total",
            provider="gemini",
            analysis_type="assumptions",
            status="fallback",
        )
        >= 1
    )


def test_unknown_label_values_collapse_to_bounded_defaults():
    metrics.record_ai_request(provider="mystery", analysis_type="<script>", status="weird")
    assert (
        sample(
            "decisionforge_ai_requests_total",
            provider="fake",
            analysis_type="unknown",
            status="failure",
        )
        >= 1
    )


def test_cache_hit_and_miss_are_recorded_for_ai_cache():
    hit0 = sample("decisionforge_ai_cache_operations_total", result="hit")
    miss0 = sample("decisionforge_ai_cache_operations_total", result="miss")
    with inst.observe_cache("ai") as op:
        op.hit()
    with inst.observe_cache("ai"):
        pass  # default is a miss
    assert sample("decisionforge_ai_cache_operations_total", result="hit") == hit0 + 1
    assert sample("decisionforge_ai_cache_operations_total", result="miss") == miss0 + 1
    assert sample("decisionforge_cache_operations_total", cache_name="ai", result="hit") >= 1
    assert (
        sample(
            "decisionforge_cache_operation_duration_seconds_count", cache_name="ai", operation="get"
        )
        >= 2
    )


def test_cache_exception_is_recorded_as_failure():
    before = sample("decisionforge_cache_operations_total", cache_name="default", result="failure")
    with pytest.raises(ConnectionError), inst.observe_cache("some-arbitrary-name"):
        raise ConnectionError
    after = sample("decisionforge_cache_operations_total", cache_name="default", result="failure")
    assert after == before + 1  # arbitrary cache names collapse to "default"


def test_ai_job_and_circuit_breaker_and_quota():
    metrics.record_quota_rejection()
    assert sample("decisionforge_ai_quota_rejections_total") >= 1
    metrics.set_circuit_breaker_open("gemini", True)
    assert sample("decisionforge_ai_circuit_breaker_open", provider="gemini") == 1
    metrics.set_circuit_breaker_open("gemini", False)
    assert sample("decisionforge_ai_circuit_breaker_open", provider="gemini") == 0
    with pytest.raises(RuntimeError), inst.observe_ai_job("risks"):
        raise RuntimeError
    assert sample("decisionforge_ai_jobs_total", status="failure") >= 1


def test_ranking_rejection_is_not_counted_as_failure():
    from app.core.exceptions import ValidationAppError

    rejected0 = sample("decisionforge_ranking_calculations_total", status="rejected")
    failure0 = sample("decisionforge_ranking_calculations_total", status="failure")
    with pytest.raises(ValidationAppError), metrics.ranking_timer():
        raise ValidationAppError("cannot rank")
    with pytest.raises(RuntimeError), metrics.ranking_timer():
        raise RuntimeError
    assert sample("decisionforge_ranking_calculations_total", status="rejected") == rejected0 + 1
    assert sample("decisionforge_ranking_calculations_total", status="failure") == failure0 + 1


def test_error_categories_are_bounded():
    assert metrics.categorize_error(TimeoutError()) == "timeout"
    assert metrics.categorize_error(RateLimitError()) == "rate_limit"
    assert metrics.categorize_error(ValueError()) == "validation"
    assert metrics.categorize_error(ConnectionError()) == "provider"
    assert metrics.categorize_error(KeyError()) == "unknown"
    for exc in (TimeoutError(), RateLimitError(), ValueError(), KeyError(), RuntimeError()):
        assert metrics.categorize_error(exc) in metrics.ALLOWED_ERROR_CATEGORY


def test_celery_signals_record_success_failure_retry_and_bounded_names(monkeypatch):
    import logging

    from celery import Celery

    # Celery's eager "Task succeeded" record is %-formatted with a mapping that pytest's log
    # capture on Python 3.13 cannot format; it is unrelated to the metrics under test.
    monkeypatch.setattr(logging.getLogger("celery.app.trace"), "disabled", True)

    app = Celery("t")

    @app.task(name="t.ok")
    def ok():
        return 1

    @app.task(name="t.boom", bind=True, max_retries=1)
    def boom(self):
        raise TimeoutError("slow provider")

    inst._installed = False  # install against this throwaway app's registry
    inst.install_celery_metrics(app)
    app.conf.task_always_eager = True
    app.conf.task_eager_propagates = False

    ok_before = sample("decisionforge_celery_tasks_total", task_name="t.ok", status="success")
    ok.apply()
    assert (
        sample("decisionforge_celery_tasks_total", task_name="t.ok", status="success")
        == ok_before + 1
    )
    assert sample("decisionforge_celery_task_duration_seconds_count", task_name="t.ok") >= 1

    boom.apply()
    assert sample("decisionforge_celery_tasks_total", task_name="t.boom", status="failure") >= 1
    assert (
        sample(
            "decisionforge_celery_task_failures_total", task_name="t.boom", error_category="timeout"
        )
        >= 1
    )

    # unregistered task names never become label values
    class Fake:
        name = "unregistered.user-supplied-name"

    assert inst._task_name(Fake(), app.tasks) == "unknown"
