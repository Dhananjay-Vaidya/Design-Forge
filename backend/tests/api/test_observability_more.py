import json
import re
import uuid
from decimal import Decimal
from pathlib import Path

import pytest
import yaml
from httpx import AsyncClient
from prometheus_client import REGISTRY
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import Settings
from app.models.decision import Alternative, AlternativeScore, Criterion, Decision
from app.models.user import User
from app.observability import health

INFRA = Path(__file__).resolve().parents[3] / "infrastructure"


def sample(name: str, **labels) -> float:
    return REGISTRY.get_sample_value(name, labels) or 0.0


async def _scored_decision(db: AsyncSession, owner: User, *, complete: bool = True) -> Decision:
    decision = Decision(owner_id=owner.id, title="Metrics ranking")
    db.add(decision)
    await db.commit()
    a = Alternative(decision_id=decision.id, name="A", position=0)
    b = Alternative(decision_id=decision.id, name="B", position=1)
    c = Criterion(decision_id=decision.id, name="C", weight=Decimal("1"), direction="benefit")
    db.add_all([a, b, c])
    await db.commit()
    rows = [(a, 9), (b, 4)] if complete else [(a, 9)]
    for alt, score in rows:
        db.add(AlternativeScore(alternative_id=alt.id, criterion_id=c.id, score=Decimal(score)))
    await db.commit()
    return decision


async def test_ranking_request_increments_ranking_and_sensitivity_counters(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    ok0 = sample("decisionforge_ranking_calculations_total", status="success")
    sens0 = sample("decisionforge_sensitivity_analyses_total", status="success")
    decision = await _scored_decision(db_session, user)
    r = await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    assert r.status_code == 200
    assert sample("decisionforge_ranking_calculations_total", status="success") == ok0 + 1
    assert sample("decisionforge_sensitivity_analyses_total", status="success") == sens0 + 1
    assert sample("decisionforge_ranking_duration_seconds_count") >= 1


async def test_unrankable_decision_is_recorded_as_rejected_not_failure(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    rej0 = sample("decisionforge_ranking_calculations_total", status="rejected")
    fail0 = sample("decisionforge_ranking_calculations_total", status="failure")
    decision = await _scored_decision(db_session, user, complete=False)
    r = await client.get(f"/api/v1/decisions/{decision.id}/ranking", headers=auth_headers)
    assert r.status_code == 400
    assert sample("decisionforge_ranking_calculations_total", status="rejected") == rej0 + 1
    assert sample("decisionforge_ranking_calculations_total", status="failure") == fail0


async def test_metrics_endpoint_content_type_and_not_in_openapi(client: AsyncClient):
    r = await client.get("/metrics")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/plain")
    assert "# HELP decisionforge_http_requests_total" in r.text
    assert "/metrics" not in (await client.get("/api/openapi.json")).json()["paths"]


async def test_metrics_scrape_does_not_measure_itself(client: AsyncClient):
    await client.get("/metrics")
    await client.get("/metrics")
    assert 'route="/metrics"' not in (await client.get("/metrics")).text


async def test_response_size_and_in_progress_metrics_exist(client: AsyncClient):
    await client.get("/health")
    text = (await client.get("/metrics")).text
    assert "decisionforge_http_response_size_bytes_bucket" in text
    assert "decisionforge_http_requests_in_progress" in text


async def test_metrics_contain_no_user_data_or_secrets(
    client: AsyncClient, db_session: AsyncSession, user: User, auth_headers: dict
):
    decision = await _scored_decision(db_session, user)
    await client.get(f"/api/v1/decisions/{decision.id}", headers=auth_headers)
    await client.get(f"/api/v1/decisions/{uuid.uuid4()}?token=abc123", headers=auth_headers)
    text = (await client.get("/metrics")).text
    forbidden = [
        str(decision.id),
        str(user.id),
        user.email,
        auth_headers["Authorization"].split()[1],
        "abc123",
        "Metrics ranking",  # decision title
    ]
    for item in forbidden:
        assert item not in text, f"{item!r} leaked into /metrics"
    assert not re.search(r"user_id|decision_id|email|token=|prompt", text)


async def test_http_label_values_are_bounded(client: AsyncClient):
    await client.get("/health")
    for path in ("/nope/1", "/api/v1/nope/" + "x" * 300):
        await client.get(path)
    text = (await client.get("/metrics")).text
    routes = set(re.findall(r'decisionforge_http_requests_total\{[^}]*route="([^"]+)"', text))
    assert all(len(r) < 120 for r in routes)
    assert "/nope/1" not in routes
    statuses = set(re.findall(r'decisionforge_http_requests_total\{[^}]*status="(\d+)"', text))
    assert all(len(s) == 3 for s in statuses)


# ---- readiness --------------------------------------------------------------------------------


async def test_ready_ok_reports_gemini_as_optional_state(client: AsyncClient):
    r = await client.get("/ready")
    assert r.status_code == 200
    body = r.json()
    assert body["checks"] == {"database": True, "redis": True}
    assert body["optional"]["gemini"] in {"disabled", "configured", "misconfigured"}


async def test_ready_is_503_when_postgres_is_down(client: AsyncClient, monkeypatch):
    dead = create_async_engine("postgresql+asyncpg://u:p@127.0.0.1:1/none")
    monkeypatch.setattr(health, "get_engine", lambda: dead)
    r = await client.get("/ready")
    assert r.status_code == 503
    assert r.json()["checks"] == {"database": False, "redis": True}
    assert "127.0.0.1" not in r.text and "asyncpg" not in r.text


async def test_ready_is_503_when_redis_is_down(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(health.settings, "redis_url", "redis://127.0.0.1:1/0")
    r = await client.get("/ready")
    assert r.status_code == 503
    assert r.json()["checks"] == {"database": True, "redis": False}
    assert "redis://" not in r.text


@pytest.mark.parametrize("enabled,key", [(True, ""), (True, "k"), (False, "")])
async def test_gemini_state_never_affects_readiness(
    client: AsyncClient, monkeypatch, enabled: bool, key: str
):
    monkeypatch.setattr(health.settings, "gemini_enabled", enabled)
    monkeypatch.setattr(health.settings, "gemini_api_key", key)
    r = await client.get("/ready")
    assert r.status_code == 200
    assert "k" != r.json()["optional"]["gemini"]  # the key itself is never echoed
    assert key == "" or key not in r.text


async def test_health_stays_ok_when_dependencies_are_down(client: AsyncClient, monkeypatch):
    monkeypatch.setattr(health.settings, "redis_url", "redis://127.0.0.1:1/0")
    assert (await client.get("/health")).json() == {"status": "ok"}


def test_enable_metrics_switch(monkeypatch):
    monkeypatch.setenv("ENABLE_METRICS", "false")
    assert Settings().prometheus_metrics_enabled is False
    monkeypatch.delenv("ENABLE_METRICS")
    monkeypatch.setenv("PROMETHEUS_METRICS_ENABLED", "0")
    assert Settings().prometheus_metrics_enabled is False  # legacy name still honoured
    monkeypatch.delenv("PROMETHEUS_METRICS_ENABLED")
    assert Settings().prometheus_metrics_enabled is True


# ---- static guards over the monitoring config ---------------------------------------------------


def _known_metric_names() -> set[str]:
    names = set()
    for family in REGISTRY.collect():
        base = family.name
        names |= {base, f"{base}_total", f"{base}_bucket", f"{base}_sum", f"{base}_count"}
    return names


def test_every_decisionforge_metric_in_rules_and_dashboards_is_emitted_by_the_app():
    import app.main  # noqa: F401  (registers all metric families)

    known = _known_metric_names()
    files = [*INFRA.glob("prometheus/*.yml"), *INFRA.glob("grafana/dashboards/*.json")]
    assert files
    for f in files:
        for name in set(re.findall(r"decisionforge_[a-z0-9_]+", f.read_text(encoding="utf-8"))):
            assert name in known, f"{f.name} references unknown metric {name}"


def test_alert_rules_are_complete():
    doc = yaml.safe_load((INFRA / "prometheus" / "alerts.yml").read_text(encoding="utf-8"))
    alerts = [r for g in doc["groups"] for r in g["rules"]]
    assert len(alerts) >= 12
    for a in alerts:
        assert a["expr"] and a["for"], a["alert"]
        assert a["labels"]["severity"] in {"warning", "critical"}, a["alert"]
        for key in ("summary", "description", "action"):
            assert a["annotations"].get(key), (a["alert"], key)


def test_recording_rules_use_decisionforge_namespace():
    doc = yaml.safe_load((INFRA / "prometheus" / "recording-rules.yml").read_text(encoding="utf-8"))
    for g in doc["groups"]:
        for rule in g["rules"]:
            assert rule["record"].startswith("decisionforge:")


def test_prometheus_scrapes_every_expected_target():
    cfg = yaml.safe_load((INFRA / "prometheus" / "prometheus.yml").read_text(encoding="utf-8"))
    jobs = {j["job_name"]: j["static_configs"][0]["targets"][0] for j in cfg["scrape_configs"]}
    assert jobs == {
        "prometheus": "prometheus:9090",
        "decisionforge-web": "web:8000",
        "decisionforge-worker": "worker:9808",
        "postgres-exporter": "postgres-exporter:9187",
        "redis-exporter": "redis-exporter:9121",
    }
    assert cfg["global"]["scrape_interval"] == "15s" == cfg["global"]["evaluation_interval"]


def test_grafana_datasource_is_default_and_uses_docker_dns():
    ds = yaml.safe_load(
        (INFRA / "grafana/provisioning/datasources/prometheus.yml").read_text(encoding="utf-8")
    )["datasources"][0]
    assert ds["url"] == "http://prometheus:9090" and ds["isDefault"] and ds["uid"]
    uid = ds["uid"]
    for f in (INFRA / "grafana/dashboards").glob("*.json"):
        for panel in json.loads(f.read_text(encoding="utf-8"))["panels"]:
            assert panel["datasource"]["uid"] == uid, (f.name, panel["title"])
            assert panel.get("description"), (f.name, panel["title"])
