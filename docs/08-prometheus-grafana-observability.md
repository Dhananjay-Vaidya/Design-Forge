# 08 — Prometheus & Grafana Observability

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
**Mandatory** per FR-018 / NFR-009. Traces to BRD §Monitoring + §Alert conditions and DPR §Prometheus instrumentation plan. Additions tagged **[REC]**.

---

## 1. Observability Goals

- Detect slow APIs, failed AI calls, and delayed jobs (US-008).
- Prove core reliability: deterministic workflow healthy even when Gemini is down (BR-011).
- Surface product signals (decisions created, analyses completed, reviews completed).
- Keep label cardinality bounded; never leak private data (BR-015, OBS-03).

## 2. Prometheus Scrape Targets

| Target | Endpoint | Notes |
|--------|----------|-------|
| Backend API | `web:8000/metrics` | django-prometheus or equivalent (FR-018) |
| Celery workers | worker metrics endpoint (scrape) or Pushgateway [REC] | queue/task metrics |
| PostgreSQL | `postgres_exporter:9187/metrics` | DB health |
| Redis | `redis_exporter:9121/metrics` | broker/cache health |

Prometheus config lives under `infra/prometheus/prometheus.yml`; provisioned via Compose (see `11-devops-deployment-runbook.md`).

## 3. Metric Naming Conventions

- Prefix all app metrics with `decisionforge_`.
- Units in the suffix: `_seconds`, `_bytes`, `_total` (counters).
- Names describe **what**, labels describe **dimensions** (bounded).

## 4. Metric Types

Counters (`_total`), Histograms (`_seconds` with buckets), Gauges (current values). Use histograms for latency/duration to derive P50/P95/P99.

## 5. Labels & Label-Cardinality Rules (BR-015, OBS-03)

**Allowed labels (low-cardinality):** `method` (GET/POST/…), `route` (normalized template like `/decisions/{id}` — never the raw URL with IDs), `status_class` (2xx/4xx/5xx) or `status`, `operation` (clarify/risks/…), `model`, `result` (success/failure/cache_hit/quota), `error_category`, `queue`, `task`.

**Forbidden as labels:** user IDs, decision IDs, snapshot IDs, emails, prompts, raw URLs, full status text, exception messages, any free-form/private value.

Route normalization is mandatory: map `/decisions/abc-123` → `/decisions/{id}` before labeling.

## 6. Backend HTTP Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `decisionforge_http_requests_total` | Counter | method, route, status_class | Request count (DPR) |
| `decisionforge_http_request_duration_seconds` | Histogram | method, route | Latency (P50/95/99), NFR-004 |
| `decisionforge_http_responses_total` | Counter | route, status | Status distribution |
| `decisionforge_http_active_requests` | Gauge | — | In-flight requests |

## 7. Frontend / API Experience Indicators

- MVP measures API-side experience (latency/error rate above) as the proxy for UX.
- **[REC]** optional Real-User-Monitoring (web-vitals beacon to a backend `POST /rum`) is post-MVP; not required for acceptance.

## 8. Database Metrics (via postgres_exporter + app)

| Metric | Type | Purpose |
|--------|------|---------|
| `pg_stat_activity_count` / connections | Gauge | Connection usage (alert near capacity) |
| transactions, rollbacks | Counter | DB throughput/errors |
| `decisionforge_db_query_duration_seconds` [REC] | Histogram | App-side query timing (NFR-009) |
| storage/disk (node/pg) | Gauge | Storage growth (alert on low disk) |

## 9. Redis Metrics (via redis_exporter)

Memory used, evicted keys, connected clients, commands processed, keyspace hits/misses (cache effectiveness), broker list length for Celery queues.

## 10. Celery / Worker Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `decisionforge_job_duration_seconds` | Histogram | task | Task execution time (DPR) |
| `decisionforge_jobs_failed_total` | Counter | task | Failures (DPR) |
| `decisionforge_jobs_total` | Counter | task, result | Throughput/outcomes [REC] |
| `decisionforge_queue_depth` | Gauge | queue | Backlog (alert on growth) |
| `decisionforge_last_reminder_success_timestamp` | Gauge | — | Missed-reminder alert (AC-010) |

## 11. Gemini Metrics

| Metric | Type | Labels | Purpose |
|--------|------|--------|---------|
| `decisionforge_ai_requests_total` | Counter | operation, model, result | AI requests by outcome (DPR) |
| `decisionforge_ai_request_duration_seconds` | Histogram | operation, model | Gemini latency |
| `decisionforge_ai_errors_total` | Counter | operation, error_category | Errors by category (timeout/invalid/unavailable/429) |
| `decisionforge_ai_quota_rejections_total` | Counter | scope (user/provider) | Quota rejections (AC-008) |
| `decisionforge_ai_cache_hits_total` | Counter | operation | Saved provider calls (AC-011) |
| `decisionforge_ai_tokens_total` | Counter | operation, direction (input/output) | Token usage when reported |
| `decisionforge_ai_circuit_state` | Gauge | — | 0 closed / 1 open / 2 half-open |

## 12. Business Metrics

| Metric | Type | Purpose |
|--------|------|---------|
| `decisionforge_decisions_created_total` | Counter | Core activity (DPR) |
| `decisionforge_active_decisions` | Gauge | Open decisions (DPR) |
| `decisionforge_analyses_requested_total` | Counter | AI demand |
| `decisionforge_analyses_completed_total` | Counter | AI completion (validity trend) |
| `decisionforge_deterministic_calculations_total` | Counter | Ranking computations |
| `decisionforge_outcome_reviews_completed_total` | Counter | Follow-up completion |

## 13. Health, Readiness, Liveness

| Endpoint | Meaning |
|----------|---------|
| `GET /healthz` | Liveness — process is up |
| `GET /readyz` | Readiness — DB + Redis reachable; returns 503 if a dependency is down |
| `GET /metrics` | Prometheus scrape (network-restricted) |

Worker liveness via Celery ping/heartbeat and `last_reminder_success_timestamp` (§10).

## 14. Prometheus Recording Rules (examples)

```yaml
groups:
  - name: decisionforge_recording
    rules:
      - record: job:http_request_error_rate:5m
        expr: |
          sum(rate(decisionforge_http_requests_total{status_class="5xx"}[5m]))
          / sum(rate(decisionforge_http_requests_total[5m]))
      - record: job:http_latency_p95:5m
        expr: |
          histogram_quantile(0.95,
            sum(rate(decisionforge_http_request_duration_seconds_bucket[5m])) by (le))
      - record: job:ai_failure_rate:10m
        expr: |
          sum(rate(decisionforge_ai_requests_total{result="failure"}[10m]))
          / clamp_min(sum(rate(decisionforge_ai_requests_total[10m])), 1)
```

## 15. Alert Rules (BRD §Alert conditions)

```yaml
groups:
  - name: decisionforge_alerts
    rules:
      - alert: HighApiErrorRate
        expr: job:http_request_error_rate:5m > 0.05
        for: 5m
        labels: { severity: page }
        annotations: { summary: "API 5xx error rate high (>5% for 5m)" }

      - alert: HighApiLatencyP95
        expr: job:http_latency_p95:5m > 0.5
        for: 10m
        labels: { severity: warn }
        annotations: { summary: "API P95 latency > 500ms for 10m (NFR-004)" }

      - alert: GeminiFailureSpike
        expr: job:ai_failure_rate:10m > 0.3
        for: 10m
        labels: { severity: warn }
        annotations: { summary: "Gemini failure/quota-rejection rate rising" }

      - alert: WorkerQueueGrowing
        expr: max_over_time(decisionforge_queue_depth[15m]) > 100 and deriv(decisionforge_queue_depth[15m]) > 0
        for: 15m
        labels: { severity: warn }
        annotations: { summary: "Celery queue growing / no worker draining it" }

      - alert: ReminderJobStale
        expr: time() - decisionforge_last_reminder_success_timestamp > 86400
        for: 5m
        labels: { severity: warn }
        annotations: { summary: "Scheduled reminder has not succeeded in its window (AC-010)" }

      - alert: PostgresConnectionsHigh
        expr: sum(pg_stat_activity_count) / on() pg_settings_max_connections > 0.8
        for: 5m
        labels: { severity: warn }
        annotations: { summary: "PostgreSQL connections near capacity" }

      - alert: DiskSpaceLow
        expr: node_filesystem_avail_bytes / node_filesystem_size_bytes < 0.1
        for: 5m
        labels: { severity: page }
        annotations: { summary: "Disk space below 10% safety threshold" }
```
(Exporter metric names may vary by exporter version; adjust selectors to the deployed exporters.)

## 16. Grafana Dashboard Catalogue (BRD §Monitoring requirements)

| Dashboard | Minimum panels |
|-----------|----------------|
| **Application health** | Request rate; error rate; P50/P95/P99 latency; availability |
| **Gemini health** | Request count; failure count; latency; quota rejections; cache-hit rate; tokens (when available); circuit state |
| **Worker health** | Queue depth; job duration; retries; failures; last successful reminder run |
| **Database health** | Connections; transaction rate; errors; storage growth |
| **Product overview** | Decisions created; analysis completion; outcome-review completion; active decisions |

Dashboards are provisioned as JSON under `infra/grafana/provisioning/dashboards` (see runbook §Grafana provisioning).

## 17. Recommended Panels (mapping to metrics)

- Request rate: `sum(rate(decisionforge_http_requests_total[5m]))` by `status_class`.
- Error rate: recording rule `job:http_request_error_rate:5m`.
- Latency percentiles: `job:http_latency_p95:5m` (+ p50/p99 variants).
- AI latency: `histogram_quantile(0.95, sum(rate(decisionforge_ai_request_duration_seconds_bucket[5m])) by (le, operation))`.
- Cache-hit rate: `sum(rate(decisionforge_ai_cache_hits_total[5m])) / sum(rate(decisionforge_ai_requests_total[5m]))`.
- Queue depth: `decisionforge_queue_depth` by `queue`.
- Product: `increase(decisionforge_decisions_created_total[1d])`, `increase(decisionforge_analyses_completed_total[1d])`.

## 18. Useful PromQL Queries

```promql
# 5xx error ratio (last 5m)
sum(rate(decisionforge_http_requests_total{status_class="5xx"}[5m]))
  / sum(rate(decisionforge_http_requests_total[5m]))

# API P95 by route
histogram_quantile(0.95,
  sum(rate(decisionforge_http_request_duration_seconds_bucket[5m])) by (le, route))

# Gemini errors by category
sum(rate(decisionforge_ai_errors_total[15m])) by (error_category)

# Cache effectiveness
sum(rate(decisionforge_ai_cache_hits_total[1h]))
  / clamp_min(sum(rate(decisionforge_ai_requests_total[1h])), 1)

# Analyses completed today
increase(decisionforge_analyses_completed_total[1d])
```

## 19. Troubleshooting Workflow

1. **Alert fires** → open the matching Grafana dashboard.
2. **API latency/error** → check `route`-level panels to localize; correlate with DB connections and worker queue.
3. **Gemini issues** → check `ai_errors_total{error_category}`, quota rejections, and circuit state; confirm deterministic endpoints are still healthy (they must be — BR-011).
4. **Worker backlog** → queue depth + last reminder success; check worker liveness and Redis.
5. **DB** → connections/storage panels; slow queries via `db_query_duration_seconds` [REC].
6. Use the `request_id` from the error envelope/logs to trace a specific failing request (logs never contain secrets, SEC-08).

## 20. Cardinality Guardrails (enforced)

- Route templating in middleware before metric emission.
- A CI/lint check [REC] asserts no metric is labeled with `*_id`, `email`, `url`, `prompt`, or `exception`.
- Periodic review of Prometheus `topk` series counts to catch cardinality creep (mitigates the DPR "high-cardinality metrics" risk).
