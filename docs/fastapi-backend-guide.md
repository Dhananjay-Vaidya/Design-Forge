# FastAPI Backend Guide

Everything runs in Docker; no local Python is required. `make up` (or
`docker compose up --build`) starts the full stack. Interactive docs: `http://localhost:8000/docs`,
ReDoc `/redoc`, schema `/api/openapi.json`.

## Layout (`backend/`)

```
app/
  main.py                 app assembly + middleware order
  api/                    HTTP only: routers, dependencies (auth, DB session), pagination
    v1/endpoints/         auth, users, decisions, alternatives, criteria, scores, rankings
  schemas/                Pydantic v2 request/response models (wire contract)
  services/               business rules + explicit transactions (commit lives here)
  repositories/           SQLAlchemy queries only; never commit
  models/                 SQLAlchemy 2 ORM (tables keep their Django-era names)
  domain/scoring/         deterministic engine: pure Python + Decimal, no FastAPI/SQLAlchemy
  core/                   config (pydantic-settings), database, security, exceptions, middleware
  observability/          health/readiness, HTTP metrics middleware, custom metrics
  tasks/                  Celery app (no tasks yet)
alembic/                  migrations (baseline adopts the Django-created schema)
scripts/                  db_migrate, db_fresh, db_adopt_existing, db_status, create_user,
                          seed_demo, export_openapi, verify_e2e, parity_django_vs_fastapi
tests/                    unit, integration, api, contract
```

Rule of thumb: routes validate and delegate; services enforce rules and own the transaction;
repositories talk to the database; `domain/` stays framework-free (a test enforces it).

## Configuration

Typed settings in `app/core/config.py`, read from environment variables (see `.env.example`).
`ENVIRONMENT=production` enables startup validation and the app **refuses to start** unless:
`JWT_SECRET_KEY` is ≥ 32 random chars, `DEBUG` is off, `JWT_REFRESH_COOKIE_SECURE` is on, no
wildcard CORS/hosts, and `GEMINI_API_KEY` is set if `GEMINI_ENABLED`. List variables
(`ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`) are comma-separated. Legacy `DJANGO_DEBUG` /
`DJANGO_ALLOWED_HOSTS` are still read as fallbacks.

## Database and migrations

`make migrate` → `python -m scripts.db_migrate` (also runs automatically when `web` starts, gated
by `RUN_MIGRATIONS=1`). It inspects the database and does exactly one of: upgrade (normal), create
from scratch (empty DB), or **adopt** a Django-created database (verify columns → stamp baseline →
apply additive revisions). Only additive DDL ever runs. `make db-status` shows the revision and any
schema drift. New migration: `make migration m="add x"` then **review the generated file**.
Design and rollback: `docs/adr/ADR-fastapi-database-migration.md`.

Important invariant: the Django schema has *no server-side defaults* on NOT NULL timestamps, so the
ORM supplies `created_at`/`updated_at` in Python (`app/models/base.py`), and the baseline migration
must not add DB defaults. `tests/integration/test_schema_parity.py` guards this.

## Auth

Access JWT (15 min) in memory on the client; refresh token in an httpOnly cookie (`df_refresh`,
path `/api/v1/auth/`), rotated on every refresh and tracked in `refresh_tokens`; CSRF via the
`df_csrftoken` cookie + `X-CSRFToken` header on the two cookie-authenticated endpoints. Passwords:
Argon2id; legacy Django PBKDF2 hashes verify and are upgraded on login. A resource owned by
someone else is reported as 404 (not 403) so IDs cannot be probed. See
`docs/adr/ADR-fastapi-authentication.md`.

## Errors

Always `{"error": {"code", "message", "request_id", "fields"?, "retry_after_seconds"?}}`.
Validation → 400 with per-field messages in DRF wording; auth 401; CSRF/permission 403;
missing or not-yours 404; duplicate email 409; unexpected → 500 with no internals (logged with the
request ID, secrets redacted). Every response carries `X-Request-ID`.

## Observability

`/health`, `/ready` (Postgres + Redis, 200/503; never Gemini), `/metrics`. Metrics are described in
`docs/observability-setup.md`. Gunicorn runs several workers, so `entrypoint.sh` sets
`PROMETHEUS_MULTIPROC_DIR` (wiped on start) and `/metrics` aggregates across workers.
**Never** use IDs, emails, raw paths, query strings, tokens, prompts or exception text as a metric
label.

## Celery

`app/tasks/celery_app.py`, worker started by Compose (`celery -A app.tasks.celery_app worker`).
There are no tasks yet. When adding them: create a *synchronous* session per task from
`app.core.database.sync_session_factory` (do not reuse a request's async session or run an event
loop in the worker), keep tasks idempotent, record start/finish/failure, and call
`asyncio.run()` only around the specific async call (e.g. the Gemini SDK). `celery-beat` was
removed because nothing is scheduled; re-add it with the first periodic task.

## Everyday commands

| Task | Command |
|---|---|
| Start / stop (keeps data) | `make up` / `make down` |
| Backend tests (all 140+) | `make test-backend` |
| Lint, format, types | `make lint`, `make format`, `make typecheck` |
| Live end-to-end check | `make verify` |
| Regenerate OpenAPI snapshot | `make openapi` (after an *intentional* contract change) |
| Seed demo data | `make seed DF_DEMO_PASSWORD='...'` |
| Create a user | `DF_PASSWORD='...' docker compose exec -e DF_PASSWORD web python -m scripts.create_user a@b.com` |
| Hot-reload dev server | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build` |
| Delete all data (destructive, asks) | `make destroy-volumes` |

`make clean` only removes containers; it never touches volumes.

## Adding an endpoint

1. Schemas in `app/schemas/` (`extra="forbid"` on requests). 2. Query in a repository.
3. Rule + `commit()` in a service. 4. Thin route in `app/api/v1/endpoints/`, register it in
`router.py`. 5. Tests: happy path, validation, unauthenticated (add to the parametrized list in
`tests/api/test_security.py`), cross-user (404), then `make openapi` and review the diff.
