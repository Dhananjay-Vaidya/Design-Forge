"""Static guards for the monitoring stack configuration (Prometheus rules, Grafana, Compose)."""

import json
import re
from pathlib import Path

import pytest
import yaml

ROOT = Path(__file__).resolve().parents[3]
INFRA = ROOT / "infrastructure"
COMPOSE = ROOT / "docker-compose.yml"
API_SCOPE = 'route=~"/api/v1/.+"'


def _rules(name: str) -> dict[str, str]:
    doc = yaml.safe_load((INFRA / "prometheus" / name).read_text(encoding="utf-8"))
    key = "record" if name.startswith("recording") else "alert"
    return {r[key]: r["expr"] for g in doc["groups"] for r in g["rules"]}


def test_required_recording_rules_exist():
    rules = _rules("recording-rules.yml")
    for name in (
        "api_request_rate5m",
        "api_4xx_rate5m",
        "api_5xx_rate5m",
        "api_5xx_ratio5m",
        "api_latency_p50",
        "api_latency_p95",
        "api_latency_p99",
        "ai_request_rate5m",
        "ai_error_ratio5m",
        "ai_latency_p95",
        "ai_cache_hit_ratio5m",
        "ai_rate_limit_rate5m",
        "ranking_calculation_rate5m",
        "celery_failure_rate5m",
        "postgres_available",
        "redis_available",
    ):
        assert f"decisionforge:{name}" in rules, name


def test_api_rules_exclude_probe_and_docs_routes():
    """Health/ready/docs traffic must never dilute API latency or error ratios."""
    for name, expr in _rules("recording-rules.yml").items():
        if name.startswith("decisionforge:api_"):
            assert API_SCOPE in expr, name


def test_ratios_guard_against_zero_denominators():
    for name, expr in _rules("recording-rules.yml").items():
        if "ratio" in name:
            assert "clamp_min(" in expr, name


def test_database_availability_means_the_database_not_the_exporter():
    rules = _rules("recording-rules.yml")
    assert "pg_up" in rules["decisionforge:postgres_available"]
    assert "redis_up" in rules["decisionforge:redis_available"]


def test_required_alerts_exist():
    alerts = _rules("alerts.yml")
    for name in (
        "DecisionForgeBackendUnavailable",
        "DecisionForgeHighHttp5xxRatio",
        "DecisionForgeHighApiLatency",
        "DecisionForgePostgresExporterUnavailable",
        "DecisionForgeRedisExporterUnavailable",
        "DecisionForgePostgresUnavailable",
        "DecisionForgeRedisUnavailable",
        "DecisionForgeGeminiErrorSpike",
        "DecisionForgeGeminiRateLimitSpike",
        "DecisionForgeGeminiCircuitBreakerOpen",
        "DecisionForgeAiQuotaRejections",
        "DecisionForgeCeleryTaskFailureSpike",
        "DecisionForgeCeleryBacklog",
        "DecisionForgePrometheusRuleEvaluationFailures",
        "DecisionForgePrometheusConfigReloadFailed",
    ):
        assert name in alerts, name


def test_dashboards_every_target_uses_the_provisioned_datasource():
    uid = yaml.safe_load(
        (INFRA / "grafana/provisioning/datasources/prometheus.yml").read_text(encoding="utf-8")
    )["datasources"][0]["uid"]
    titles = set()
    for f in (INFRA / "grafana/dashboards").glob("*.json"):
        dashboard = json.loads(f.read_text(encoding="utf-8"))
        titles.add(dashboard["title"])
        assert dashboard["uid"] and dashboard["time"]["from"].startswith("now-")
        for panel in dashboard["panels"]:
            for target in panel.get("targets", []):
                assert target.get("expr", "").strip(), (f.name, panel["title"])
                ds = target.get("datasource")
                assert ds is None or ds["uid"] == uid, (f.name, panel["title"])
    assert titles == {
        "DecisionForge Overview",
        "FastAPI Performance",
        "Gemini and AI Operations",
        "PostgreSQL and Redis Infrastructure",
    }


def test_dashboard_provider_points_at_mounted_dashboards():
    provider = yaml.safe_load(
        (INFRA / "grafana/provisioning/dashboards/dashboards.yml").read_text(encoding="utf-8")
    )["providers"][0]
    assert provider["type"] == "file"
    assert provider["options"]["path"] == "/var/lib/grafana/dashboards"


@pytest.mark.skipif(not COMPOSE.exists(), reason="docker-compose.yml is not mounted here")
def test_compose_monitoring_services_are_safe():
    compose = yaml.safe_load(COMPOSE.read_text(encoding="utf-8"))
    services = compose["services"]
    for name in ("prometheus", "grafana", "postgres-exporter", "redis-exporter"):
        svc = services[name]
        assert svc["healthcheck"], name
        image = svc["image"]
        assert ":" in image and not image.endswith(":latest"), f"{name} image must be pinned"
    # Exporters stay on the internal network.
    assert "ports" not in services["postgres-exporter"]
    assert "ports" not in services["redis-exporter"]
    # No credential is hardcoded: everything is interpolated from the environment.
    raw = COMPOSE.read_text(encoding="utf-8")
    # Any YAML key ending in PASSWORD/PASS must take its value from ${...} interpolation.
    assert not re.search(r"^\s*[A-Z_]*PASS(WORD)?:\s*(?!\$)\S", raw, re.MULTILINE)
    grafana_env = services["grafana"]["environment"]
    assert grafana_env["GF_USERS_ALLOW_SIGN_UP"] == "false"
    assert "--storage.tsdb.retention.time=15d" in services["prometheus"]["command"]
    for volume in ("prometheus_data", "grafana_data", "postgres_data", "redis_data"):
        assert volume in compose["volumes"]
