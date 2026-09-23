# Observability Implementation Status

Last updated: 2026-09-24. (The earlier Django-era log of this file is in git history; the backend is
now FastAPI, see `FASTAPI_MIGRATION_STATUS.md`.)

## Audit (repository state before this pass)

**Already present and correct (reused, not duplicated):** ASGI HTTP metrics middleware
(`decisionforge_http_*`, route-template labels, `/metrics` excluded), `app/observability/metrics.py`
(all requested `decisionforge_*` series *defined*, bounded-label helpers), `/health`+`/healthz`,
`/ready`+`/readyz` (Postgres+Redis, no secrets), Prometheus multiprocess mode for the 3 Gunicorn
workers, Compose services `prometheus` (15d retention, named volume, :9090), `grafana` (named
volume, :3001, provisioned datasource `http://prometheus:9090`), `postgres-exporter`,
`redis-exporter`, 13 recording rules, 11 alert rules, 4 dashboards, Makefile targets, 7 monitoring
tests, `docs/observability-setup.md`.

**Missing / weak (this pass):**
1. Only `decisions_created` and `ranking_*` are emitted. Celery, cache, AI-request and sensitivity
   series are defined but nothing records them. Celery has no signal instrumentation; there is no
   AI-call wrapper; there is no cache helper with timing.
2. No `ENABLE_METRICS` switch (only `PROMETHEUS_METRICS_ENABLED`); no response-size metric.
3. `/ready` has no non-blocking Gemini state and no per-check timeout.
4. Ranking counter records user-input rejections (HTTP 400) as `failure`.
5. No Celery backlog signal/alert (redis exporter is not told to watch the queue key).
6. Dashboards: overview lacks Gemini rate-limit and Celery panels; API dashboard lacks p99, slowest
   routes, active requests, response size, health-route filtering; infrastructure lacks PG cache
   hit ratio and Redis hits/misses; AI dashboard lacks job panels, cache ratio, error ratio.
7. Dashboard queries have never been executed against Prometheus to prove they are valid.
8. Tests do not cover cache, AI wrapper, Celery signals, /ready with a dependency down, PII/label
   scanning, or rule-file structure.
9. `promtool` never run successfully (Git Bash path mangling in the Makefile).

**Not present and out of scope (no such code exists):** Gemini provider, fake AI provider, AI jobs,
Celery tasks, scenario comparison, outcome reviews, snapshots. Their metrics are instrumented through
reusable helpers/signal handlers so they light up when those features land; they cannot be
*exercised end-to-end* today. No Alertmanager exists (documented as next step).

## Files to change
`backend/app/observability/{metrics,http_metrics,health}.py`, `backend/app/main.py`,
`backend/app/core/config.py`, `backend/app/tasks/celery_app.py`,
`backend/app/api/v1/endpoints/rankings.py`, `docker-compose.yml`, `Makefile`, `.env.example`,
`infrastructure/prometheus/{recording-rules,alerts}.yml`, the 4 dashboards, `docs/observability-setup.md`,
`README.md`, `docs/11-devops-deployment-runbook.md`.

## Files to create
`backend/app/observability/instrumentation.py` (Celery signals, AI/cache wrappers),
`backend/scripts/check_dashboards.py` (executes every dashboard query against Prometheus),
new tests under `backend/tests/`.

## Risks
- Multiprocess mode: per-process gauges need explicit modes; Celery worker is a separate process
  and is *not* scraped by Prometheus (see plan: expose via the worker's own metrics port).
- Windows/Git Bash path mangling for `promtool` docker mounts.
- Label cardinality: task names must come from the Celery registry, never from arguments.

## Checklist / Verification
Filled in at the end of this pass (only executed checks are marked).
