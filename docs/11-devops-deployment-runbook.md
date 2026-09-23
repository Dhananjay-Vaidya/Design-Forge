# 11 — DevOps & Deployment Runbook

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
Traces to BRD NFR-012 (Docker Compose), §DoD, DPR §Runtime. Additions tagged **[REC]**. All commands are illustrative; the repo's README is authoritative once code exists.

---

## 1. Local Prerequisites

- Docker Engine + Docker Compose v2.
- Git.
- (Optional, for non-container dev) Node.js LTS and Python 3.12 [REC].
- A Google Gemini API key for live AI (the app runs fully without it in degraded mode — BR-011).

## 2. Environment Variables

Repository ships **`.env.example`** with variable **names only** (no values, no secrets — SEC-03/09). Copy to `.env` and fill in.

| Variable | Purpose |
|----------|---------|
| `DJANGO_SECRET_KEY` | Django cryptographic secret |
| `DJANGO_DEBUG` | `0` in any shared environment |
| `DJANGO_ALLOWED_HOSTS` | Comma-separated hosts |
| `DATABASE_URL` | Postgres DSN (or discrete `POSTGRES_*`) |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB init |
| `REDIS_URL` | Broker + cache |
| `CELERY_BROKER_URL` / `CELERY_RESULT_BACKEND` | Usually the Redis URL |
| `CORS_ALLOWED_ORIGINS` | Frontend origin(s) |
| `GEMINI_API_KEY` | Backend-only Gemini key (never in FE) |
| `GEMINI_MODEL` | Primary Flash-class model id |
| `GEMINI_FALLBACK_MODEL` | Flash-Lite-class fallback [REC] |
| `GEMINI_TIMEOUT_SECONDS` / `GEMINI_MAX_RETRIES` | Adapter tuning |
| `GEMINI_DAILY_USER_QUOTA` | Per-user daily AI limit (BR-013) |
| `GEMINI_CACHE_TTL_SECONDS` | AI cache TTL (AC-011) |
| `GEMINI_BREAKER_THRESHOLD` / `GEMINI_BREAKER_COOLDOWN_SECONDS` | Circuit breaker |
| `VITE_API_BASE_URL` | Frontend → API base (public, non-secret) |
| `GF_SECURITY_ADMIN_USER` / `GF_SECURITY_ADMIN_PASSWORD` | Grafana admin |

Only `VITE_*` values reach the browser; **no secret is ever a `VITE_*`** (enforced by review + bundle scan, AC-012).

## 3. Docker Compose Services

| Service | Role |
|---------|------|
| `web` | Django REST API (`/api/v1`, `/metrics`, `/healthz`, `/readyz`) |
| `worker` | Celery worker (AI jobs, reminders) |
| `beat` | Celery beat scheduler |
| `frontend` | Vite build served (or dev server) [REC nginx for prod-like] |
| `db` | PostgreSQL |
| `redis` | Redis (broker + cache) |
| `prometheus` | Prometheus server |
| `grafana` | Grafana |
| `postgres-exporter` | DB metrics |
| `redis-exporter` | Redis metrics |
| `nginx` [REC] | Reverse proxy / static serving / TLS termination |

## 4. Development Startup

```bash
cp .env.example .env        # then fill in values
docker compose up -d --build
docker compose ps           # all services healthy
```
API: `http://localhost:8000`, Frontend: `http://localhost:5173` (dev) or via nginx, Grafana: `http://localhost:3001`, Prometheus: `http://localhost:9090`.

## 5. Database Migration

```bash
docker compose exec web python manage.py migrate
docker compose exec web python manage.py makemigrations --check --dry-run   # should report no changes
```

## 6. Seed-Data Loading

```bash
docker compose exec web python manage.py seed_demo   # idempotent; safe to re-run
```
Loads one demo user + a fully-scored sample decision and a **mock** AI result (no live Gemini call), so dashboards/UI have data offline (see 04 §11).

## 7. Creating an Admin User

```bash
docker compose exec web python manage.py createsuperuser
```

## 8. Starting Workers

Workers/beat start via Compose (`worker`, `beat`). Manual (inside `web`/`worker` image) for debugging:
```bash
docker compose exec worker celery -A decisionforge worker -l info
docker compose exec beat   celery -A decisionforge beat  -l info
```

## 9. Starting Prometheus and Grafana

Both start via Compose. Verify:
```bash
curl -s localhost:8000/metrics | head        # backend metrics present
open http://localhost:9090/targets            # all targets UP
open http://localhost:3001                     # Grafana (login with GF_* creds)
```

## 10. Grafana Provisioning

- Datasource + dashboards are provisioned as files (no click-ops), mounted read-only:
  - `infrastructure/grafana/provisioning/datasources/prometheus.yml`
  - `infrastructure/grafana/provisioning/dashboards/dashboards.yml` + JSON dashboards
- Dashboards: Application health, Gemini health, Worker health, Database health, Product overview (08 §16). They appear automatically on first start.

## 11. Backup and Restore

```bash
# Backup
docker compose exec db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup_$(date +%F).sql
# Restore (into a running, empty db)
cat backup_YYYY-MM-DD.sql | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```
Production path [REC]: scheduled, encrypted backups + periodic restore drills (09 §15). Backups contain no secrets (env-provided).

## 12. Log Inspection

```bash
docker compose logs -f web
docker compose logs -f worker
docker compose logs --since=15m web | grep request_id   # correlate a failing request
```
Logs are redacted (no secrets/tokens/prompts, SEC-08). Use the `request_id` from the API error envelope to trace.

## 13. Common Failures

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| `web` unhealthy on boot | DB not ready | Wait for `db` healthcheck; `web` should retry; check `DATABASE_URL` |
| 500s on all requests | Missing `DJANGO_SECRET_KEY` / migrations not run | Set env; run `migrate` (§5) |
| AI jobs stuck QUEUED | Worker/Redis down | `docker compose ps`; restart `worker`/`redis`; check `REDIS_URL` |
| AI always fails | Missing/invalid `GEMINI_API_KEY` or breaker open | App still works (degraded); fix key; check `ai_circuit_state` |
| Frontend can't reach API | Wrong `VITE_API_BASE_URL` / CORS | Fix env; set `CORS_ALLOWED_ORIGINS` |
| Grafana empty | Prometheus target down | `/targets`; check exporters and scrape config |

## 14. Gemini Troubleshooting

1. Confirm `GEMINI_API_KEY`/`GEMINI_MODEL` set (backend only).
2. Check `decisionforge_ai_errors_total{error_category}` and `ai_circuit_state` (08).
3. 429s → quota; users see the actionable message (AC-008); scoring unaffected.
4. Sustained failures → breaker opens → fallback responses; it half-opens after cooldown.
5. Verify deterministic endpoints still healthy — they must be (BR-011). If they aren't, the problem is not Gemini.

## 15. Prometheus Troubleshooting

1. `http://localhost:9090/targets` — every target `UP`?
2. Backend down as a target → check `web:8000/metrics` reachable on the Compose network.
3. Worker metrics missing → verify worker scrape/Pushgateway config (08 §2/§10).
4. Exporter down → check `postgres-exporter`/`redis-exporter` logs and credentials.
5. Rules not firing → validate with `promtool check rules` and `promtool test rules` [REC].

## 16. Clean Shutdown

```bash
docker compose down            # stop, keep volumes (data persists)
docker compose down -v         # stop AND remove volumes (DESTROYS data)
```

## 17. Production-Hardening Checklist [REC] (beyond MVP acceptance)

- [ ] `DJANGO_DEBUG=0`, real `DJANGO_ALLOWED_HOSTS`, TLS at the edge (nginx/reverse proxy).
- [ ] Secrets from a secrets manager, not `.env` files.
- [ ] Managed/hardened PostgreSQL (least-privilege user, TLS, encrypted backups).
- [ ] Internal-only exposure of `/metrics`, DB, Redis, exporters.
- [ ] Non-root containers; pinned image digests; image scanning in CI.
- [ ] Alertmanager wired to a real channel; on-call routing.
- [ ] Rate limits/quotas tuned (14/OQ-6); log shipping with redaction.
- [ ] Backup + restore drill completed and documented.
- [ ] Bundle-secret scan and dependency audit gates in CI (AC-012, 09 §9/§12).
