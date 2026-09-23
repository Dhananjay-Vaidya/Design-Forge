import json
from pathlib import Path

import yaml
from httpx import AsyncClient

from app.observability import metrics

INFRA = Path(__file__).resolve().parents[3] / "infrastructure"


async def test_health_ok(client: AsyncClient):
    for path in ("/health", "/healthz"):
        r = await client.get(path)
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


async def test_ready_reports_checks_without_secrets(client: AsyncClient):
    r = await client.get("/ready")
    assert r.status_code in {200, 503}
    body = r.json()
    assert set(body["checks"]) == {"database", "redis"}
    dumped = json.dumps(body).lower()
    for leak in ("postgres", "redis://", "password", "asyncpg"):
        assert leak not in dumped


async def test_metrics_endpoint_emits_http_and_custom_series(client: AsyncClient, auth_headers):
    await client.post(
        "/api/v1/decisions",
        json={"title": "Metrics probe", "context": "", "category": "", "deadline": None},
        headers=auth_headers,
    )
    text = (await client.get("/metrics")).text
    assert "decisionforge_http_requests_total" in text
    assert "decisionforge_http_request_duration_seconds_bucket" in text
    assert "decisionforge_decisions_created_total" in text


async def test_http_metric_labels_use_route_templates_not_raw_paths(
    client: AsyncClient, auth_headers
):
    await client.get("/api/v1/decisions/00000000-0000-0000-0000-000000000123", headers=auth_headers)
    await client.get("/definitely/not/a/route?token=secret")
    text = (await client.get("/metrics")).text
    assert 'route="/api/v1/decisions/{decision_id}"' in text
    assert 'route="unmatched"' in text
    assert "00000000-0000-0000-0000-000000000123" not in text
    assert "token=secret" not in text
    assert 'route="/metrics"' not in text


def test_bounded_metric_labels():
    assert metrics.bounded("success", metrics.ALLOWED_STATUS) == "success"
    assert metrics.bounded("user@example.com", metrics.ALLOWED_STATUS) == "unknown"
    assert metrics.categorize_error(TimeoutError()) == "timeout"


def test_grafana_dashboards_are_valid_and_use_no_django_metrics():
    for dashboard in (INFRA / "grafana" / "dashboards").glob("*.json"):
        payload = json.loads(dashboard.read_text(encoding="utf-8"))
        assert payload["uid"] and payload["title"] and payload["panels"]
        assert "django_" not in dashboard.read_text(encoding="utf-8")


def test_prometheus_and_grafana_configs_are_valid_yaml():
    for config_file in [
        *(INFRA / "prometheus").glob("*.yml"),
        *(INFRA / "grafana" / "provisioning").rglob("*.yml"),
    ]:
        assert yaml.safe_load(config_file.read_text(encoding="utf-8"))
        assert "django_" not in config_file.read_text(encoding="utf-8")
