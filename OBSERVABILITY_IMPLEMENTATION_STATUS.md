# Observability Implementation Status

## Repository Audit

- Active runtime backend: `backend/` Django + DRF served by Gunicorn through `docker-compose.yml`.
- FastAPI status: `backend_fastapi/` exists as a partial migration scaffold, but it has no application entrypoint and is not used by Docker Compose.
- Existing health endpoints: `GET /healthz` and `GET /readyz` in `backend/apps/observability/`.
- Existing metrics support: `django-prometheus` is already listed in `backend/requirements/base.txt`, but it was not wired into `INSTALLED_APPS`, middleware, or URLs.
- Existing Compose services: `db`, `redis`, `web`, `worker`, `beat`, and `frontend`.
- Missing Compose services: Prometheus, Grafana, PostgreSQL exporter, Redis exporter.
- Existing infrastructure directories: `infrastructure/prometheus/` and `infrastructure/grafana/` exist but did not contain usable config files.
- Celery is configured in `backend/config/celery.py`; no project task modules are currently present.
- Gemini integration code is not implemented yet in the active Django app; AI metrics will be provided as reusable instrumentation helpers until AI services land.
- Current Gunicorn command uses three workers. Python Prometheus multiprocess mode would be required for perfectly aggregated per-process counters. For this local Compose stack, the command will be changed to one worker to keep metrics correct and simple; horizontal scaling can be done by adding containers later.

## Files To Be Changed

- `.env.example`
- `Makefile`
- `README.md`
- `docker-compose.yml`
- `backend/config/settings/base.py`
- `backend/config/urls.py`
- `backend/config/celery.py`
- `backend/apps/decisions/services.py`
- `backend/apps/decisions/views.py`
- `backend/apps/observability/views.py`
- `IMPLEMENTATION_STATUS.md`
- `docs/03-system-architecture.md`
- `docs/11-devops-deployment-runbook.md`

## Files To Be Created

- `backend/apps/observability/metrics.py`
- `backend/apps/observability/celery.py`
- `backend/tests/observability/test_metrics.py`
- `infrastructure/prometheus/prometheus.yml`
- `infrastructure/prometheus/recording-rules.yml`
- `infrastructure/prometheus/alerts.yml`
- `infrastructure/grafana/provisioning/datasources/prometheus.yml`
- `infrastructure/grafana/provisioning/dashboards/dashboards.yml`
- `infrastructure/grafana/dashboards/decisionforge-overview.json`
- `infrastructure/grafana/dashboards/decisionforge-api.json`
- `infrastructure/grafana/dashboards/decisionforge-ai.json`
- `infrastructure/grafana/dashboards/decisionforge-infrastructure.json`
- `docs/observability-setup.md`

## Identified Risks

- The user brief asks for FastAPI metrics, but the currently runnable backend is Django. Implementing against the inactive FastAPI scaffold would not monitor the running application.
- Gunicorn multi-worker metrics are inaccurate without Prometheus multiprocess mode. The local Compose command will use one worker and documentation will capture the scaling decision.
- AI/Gemini services are not yet implemented in the active backend. Metric helpers will exist now; service-level increments can be expanded when AI code lands.
- Exporter metrics depend on Docker images being pullable in the local environment.

## Implementation Checklist

- [x] Audit active runtime and monitoring gaps.
- [x] Wire Django Prometheus HTTP metrics and `/metrics`.
- [x] Add DecisionForge custom metrics with bounded labels.
- [x] Instrument ranking and decision creation metrics.
- [x] Add Celery signal metrics.
- [x] Add PostgreSQL and Redis exporters.
- [x] Add Prometheus config, recording rules, and alert rules.
- [x] Add Grafana provisioning and dashboards.
- [x] Add Makefile commands.
- [x] Add observability tests and documentation.
- [x] Validate static configuration and tests where feasible.

## Verification Checklist

- [x] `docker compose config`
- [x] Backend lint with Ruff
- [x] Backend formatting with Black
- [x] Observability static tests
- [x] Prometheus config validation
- [x] Prometheus rules validation
- [x] Grafana YAML validation
- [x] Grafana dashboard JSON validation
- [ ] Full DB-backed observability tests: blocked by existing local Postgres volume credentials not matching current `.env`.
- [ ] Docker Compose startup: pending after Postgres volume reset or credential alignment.
- [ ] `/healthz`, `/readyz`, and `/metrics`: runtime check pending after Postgres volume reset or credential alignment.
- [ ] Prometheus readiness and targets: runtime check pending after Postgres volume reset or credential alignment.
- [ ] Grafana health: runtime check pending after Postgres volume reset or credential alignment.
