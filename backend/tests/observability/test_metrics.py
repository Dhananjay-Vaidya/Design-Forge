import json
from pathlib import Path

import pytest
import yaml

from apps.observability import metrics


@pytest.mark.django_db
def test_metrics_endpoint_returns_prometheus_text(api_client):
    response = api_client.get("/metrics")

    assert response.status_code == 200
    assert b"django_http" in response.content
    assert b"decisionforge_" in response.content


def test_health_endpoint_available(api_client):
    response = api_client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.django_db
def test_ready_endpoint_does_not_include_secrets(api_client):
    response = api_client.get("/ready")

    assert response.status_code in {200, 503}
    body = response.json()
    serialized = json.dumps(body)
    assert "postgres://" not in serialized
    assert "redis://" not in serialized
    assert "password" not in serialized.lower()


def test_bounded_metric_labels():
    assert metrics.bounded("success", metrics.ALLOWED_STATUS) == "success"
    assert metrics.bounded("user@example.com", metrics.ALLOWED_STATUS) == "unknown"
    assert metrics.categorize_error(TimeoutError()) == "timeout"


def test_grafana_dashboards_are_valid_json():
    root = Path(__file__).resolve().parents[2].parent
    dashboards = root / "infrastructure" / "grafana" / "dashboards"

    for dashboard in dashboards.glob("*.json"):
        payload = json.loads(dashboard.read_text(encoding="utf-8"))
        assert payload["uid"]
        assert payload["title"]
        assert payload["panels"]


def test_grafana_provisioning_files_are_valid_yaml():
    root = Path(__file__).resolve().parents[2].parent
    provisioning = root / "infrastructure" / "grafana" / "provisioning"

    for config_file in provisioning.rglob("*.yml"):
        assert yaml.safe_load(config_file.read_text(encoding="utf-8"))


def test_prometheus_config_files_are_valid_yaml():
    root = Path(__file__).resolve().parents[2].parent
    prometheus = root / "infrastructure" / "prometheus"

    for config_file in prometheus.glob("*.yml"):
        assert yaml.safe_load(config_file.read_text(encoding="utf-8"))
