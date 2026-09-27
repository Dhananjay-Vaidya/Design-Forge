# DecisionForge AI

A decision-intelligence platform: structure a hard decision, score alternatives against weighted
criteria, get a **deterministic** ranking, and optionally enrich it with bounded Google Gemini
advisory analysis (clarifying questions, assumptions, risks, scenarios, devil's-advocate critique,
executive summary). The math is always authoritative; Gemini never touches a score, weight, or
ranking, and the app is fully usable when Gemini is disabled or unavailable.

Full product/technical documentation lives in [`docs/`](docs/) — see
[`docs/00-document-index.md`](docs/00-document-index.md) for the reading order and
source-of-truth hierarchy. Build progress is tracked in
[`IMPLEMENTATION_STATUS.md`](IMPLEMENTATION_STATUS.md).

> **Status:** under active implementation. This README will be filled in fully in the hardening
> phase (`docs/12-implementation-roadmap.md` DF-S-028); until then it documents what exists today.

## Repository layout

```
backend/          FastAPI API (async SQLAlchemy, Alembic), Celery worker, deterministic scoring engine
backend_django_legacy/  Previous Django/DRF backend, kept only for rollback (not run by Compose)
frontend/         React + TypeScript + Vite SPA
infrastructure/   Prometheus, Grafana, Nginx configuration (added in the observability phase)
docs/             Full requirements/architecture/API/DB/AI/observability/security/testing docs
scripts/          Developer utility scripts
```

## Prerequisites

- Docker Engine + Docker Compose v2
- Git
- (Optional, for non-container dev) Node.js LTS, Python 3.12

## Quick start

```bash
cp .env.example .env   # fill in local values (no real secrets needed to run in degraded/no-AI mode)
docker compose up -d --build
docker compose ps
curl -fsS http://localhost:8000/healthz
```

Frontend dev server: http://localhost:5173 · API: http://localhost:8000/api/v1 ·
OpenAPI/Swagger: http://localhost:8000/api/schema/swagger-ui/

Observability: liveness at http://localhost:8000/health, readiness at
http://localhost:8000/ready, metrics at http://localhost:8000/metrics, Prometheus at
http://localhost:9090, and Grafana at http://localhost:3001 (login `GRAFANA_ADMIN_USER` /
`GRAFANA_ADMIN_PASSWORD` from `.env`; four dashboards are provisioned automatically). See
[`docs/observability-setup.md`](docs/observability-setup.md).

Gemini is disabled by default (`GEMINI_ENABLED=0`); the whole product works without a Gemini API
key. To enable the **Ask AI** assistant (the violet button on any decision), set `GEMINI_API_KEY`
and `GEMINI_ENABLED=1` in `.env` (defaults: `GEMINI_MODEL=gemini-3.8-flash`,
`GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite`) and restart `web`. It streams answers grounded in
that decision's options, criteria, scores and calculated ranking, is labelled advisory, cannot
change the ranking, and is limited to `GEMINI_DAILY_USER_QUOTA` questions per user per day. Details:
[`docs/06-gemini-integration-design.md`](docs/06-gemini-integration-design.md) §0.

## Common commands

See the [`Makefile`](Makefile): `make setup`, `make up`, `make down`, `make logs`, `make migrate`,
`make seed`, `make test`, `make lint`, `make format`, `make backend-shell`, `make frontend-shell`,
`make clean`, and for monitoring `make observability-up`, `make observability-down`,
`make observability-logs`, `make prometheus-check`, `make prometheus-targets`,
`make test-observability`, `make grafana-restart`, `make verify-observability`.

## License

MIT — see [`LICENSE`](LICENSE).
