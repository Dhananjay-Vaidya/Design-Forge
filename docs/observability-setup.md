# Observability Setup

DecisionForge observability runs through Docker Compose:

- Django/DRF backend exposes `/metrics` with `django-prometheus` and custom `decisionforge_` metrics.
- Prometheus scrapes the backend, PostgreSQL exporter, Redis exporter, and itself.
- Grafana reads Prometheus through the internal URL `http://prometheus:9090`.
- Exporters are internal-only; Prometheus is exposed on `9090` and Grafana on `3001` for local development.

The repository contains a partial `backend_fastapi/` migration scaffold, but the active Compose backend is `backend/` Django. Monitoring is therefore wired to the runnable Django service.

## Environment

Set these in `.env`:

```env
ENABLE_METRICS=true
PROMETHEUS_METRICS_ENABLED=1
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=change-me-local
```

`GF_SECURITY_ADMIN_USER` and `GF_SECURITY_ADMIN_PASSWORD` are still accepted for compatibility.

## Startup

```bash
docker compose up -d --build
docker compose ps
```

Useful URLs:

- Backend health: `http://localhost:8000/healthz` or `http://localhost:8000/health`
- Backend readiness: `http://localhost:8000/readyz` or `http://localhost:8000/ready`
- Backend metrics: `http://localhost:8000/metrics`
- Prometheus: `http://localhost:9090`
- Prometheus targets: `http://localhost:9090/api/v1/targets`
- Grafana: `http://localhost:3001`

Grafana login uses `GRAFANA_ADMIN_USER` and `GRAFANA_ADMIN_PASSWORD`.

## Commands

```bash
make observability-up
make observability-logs
make prometheus-check
make prometheus-targets
make test-observability
make grafana-restart
```

## Directory Structure

```text
infrastructure/
  prometheus/
    prometheus.yml
    recording-rules.yml
    alerts.yml
  grafana/
    provisioning/
      datasources/prometheus.yml
      dashboards/dashboards.yml
    dashboards/
      decisionforge-overview.json
      decisionforge-api.json
      decisionforge-ai.json
      decisionforge-infrastructure.json
```

## Metric Catalogue

HTTP metrics are emitted by `django-prometheus`. Custom application metrics use the `decisionforge_` prefix:

- `decisionforge_decisions_created_total`
- `decisionforge_ranking_calculations_total{status}`
- `decisionforge_ranking_duration_seconds`
- `decisionforge_sensitivity_analyses_total{status}`
- `decisionforge_scenario_comparisons_total{status}`
- `decisionforge_outcome_reviews_total`
- `decisionforge_ai_requests_total{provider,analysis_type,status}`
- `decisionforge_ai_request_duration_seconds{provider,analysis_type}`
- `decisionforge_ai_rate_limit_total{provider}`
- `decisionforge_ai_quota_rejections_total`
- `decisionforge_ai_cache_operations_total{result}`
- `decisionforge_ai_circuit_breaker_open{provider}`
- `decisionforge_ai_token_usage_total{provider,token_type}`
- `decisionforge_ai_jobs_total{status}`
- `decisionforge_ai_job_duration_seconds{analysis_type}`
- `decisionforge_ai_fallback_total{reason}`
- `decisionforge_celery_tasks_total{task_name,status}`
- `decisionforge_celery_task_duration_seconds{task_name}`
- `decisionforge_celery_task_retries_total{task_name}`
- `decisionforge_celery_task_failures_total{task_name,error_category}`
- `decisionforge_cache_operations_total{cache_name,result}`
- `decisionforge_cache_operation_duration_seconds{cache_name,operation}`

Labels are bounded. Do not add user IDs, decision IDs, email addresses, raw URLs, prompts, provider outputs, exception messages, tokens, or API keys.

## Dashboards

- DecisionForge Overview
- DecisionForge API
- DecisionForge Gemini and AI Operations
- DecisionForge Infrastructure

## Useful PromQL

```promql
decisionforge:api_request_rate5m
decisionforge:api_5xx_ratio5m
decisionforge:api_latency_p95
sum by (status) (rate(decisionforge_ranking_calculations_total[5m]))
sum by (analysis_type, status) (rate(decisionforge_ai_requests_total[5m]))
up{job=~"decisionforge-web|postgres-exporter|redis-exporter"}
```

## Alerts

Local alert rules cover backend availability, HTTP 5xx ratio, API latency, PostgreSQL exporter availability, Redis exporter availability, Gemini error/rate-limit/circuit-breaker events, AI quota rejections, Celery failures, and Prometheus rule evaluation failures.

Alertmanager delivery is not configured. Add Alertmanager later for Slack, Teams, email, or PagerDuty routing.

## Adding A Custom Metric

1. Add the metric to `backend/apps/observability/metrics.py`.
2. Use controlled label values only.
3. Instrument the service layer rather than adding business metrics only in views.
4. Add a test under `backend/tests/observability/`.
5. Add dashboard/rule updates if the metric should be operator-visible.

## Cardinality Checks

Use Prometheus to inspect high-cardinality series:

```promql
topk(20, count by (__name__)({__name__=~".+"}))
topk(20, count by (view) (django_http_requests_total_by_view_transport_method_total))
```

## Security

For production:

- Do not expose Prometheus or exporters publicly.
- Put Grafana behind HTTPS and authentication or SSO.
- Use a strong Grafana admin password.
- Restrict `/metrics` with network policy or reverse proxy rules.
- Keep Gemini prompts, responses, secrets, and PII out of metrics and logs.
- Choose retention based on disk capacity.

## Backup

Grafana state is stored in the `grafana_data` volume and Prometheus time series in `prometheus_data`. Back up these volumes if local dashboards or time-series history matter. Dashboard definitions are also committed as JSON and will be reprovisioned automatically.
