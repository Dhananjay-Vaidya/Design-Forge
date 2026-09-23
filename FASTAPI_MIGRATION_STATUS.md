# FastAPI Migration Status

Last updated: 2026-09-23

This file tracks the Django → FastAPI backend migration so another session can resume from the
exact verified state. Companion documents: `docs/fastapi-migration-audit.md` (inventory + parity
matrix), `docs/adr/ADR-fastapi-database-migration.md`, `docs/adr/ADR-fastapi-authentication.md`.

**Read `docs/fastapi-migration-audit.md` §0 first** — the actual Django backend only covers
Phases 1-2 (auth + decision CRUD/scoring). There is no Gemini/Celery-task/Prometheus/CI behavior
to migrate because none was built yet. This drastically narrows real migration scope versus what
the original 25-step brief assumed.

## Strategy (Migration Safety Rules)

- FastAPI is being built in `backend_fastapi/`, alongside the untouched `backend/` (Django).
- `backend/` is not modified or deleted during this work.
- No destructive database operations. The dev Postgres volume/data is left alone; verification
  uses a throwaway `alembic upgrade head` against a fresh test database plus a *read-only*
  baseline check against the real dev DB (`alembic stamp` dry-run / schema diff, not applied
  destructively).
- `backend/` is only replaced once FastAPI reaches verified parity for everything that currently
  exists (see the parity matrix). Nothing is removed from Django prematurely.

## Status by stage

| Stage | Status |
|---|---|
| Audit (`docs/fastapi-migration-audit.md`) | DONE |
| ADR: database migration strategy | DONE |
| ADR: authentication strategy | DONE |
| `backend_fastapi/` scaffold (config, db, error envelope, health/ready) | IN PROGRESS |
| Auth domain (register/login/refresh/logout/me/profile/delete + CSRF) | NOT STARTED |
| Decisions domain (models/repositories/services/routes) | NOT STARTED |
| Scoring engine port | NOT STARTED |
| Alembic baseline against existing schema | NOT STARTED |
| Docker Compose wiring (`web_fastapi` alongside `web`) | NOT STARTED |
| Backend test suite (unit/integration/api) ported | NOT STARTED |
| Frontend compatibility verification | NOT STARTED |
| Swap `backend/` → FastAPI, archive Django | NOT STARTED |
| Makefile / CI / docs updates | NOT STARTED |
| Final verification report | NOT STARTED |

## Key decisions

- **CSRF**: reproduced as a hand-rolled double-submit-cookie check (no Django CSRF middleware
  exists in FastAPI) — same cookie/header names the frontend already uses
  (`df_csrftoken` / `X-CSRFToken`), so **zero frontend changes** are needed for this. See
  `docs/adr/ADR-fastapi-authentication.md`.
- **Refresh-token blacklist**: Django's `token_blacklist` app is replaced with an explicit
  `refresh_tokens` table (jti, user_id, expires_at, revoked_at) under SQLAlchemy.
- **Database adoption**: Alembic's initial revision is written to match the *current* Postgres
  schema exactly (verified via `psql \dt` + column inspection, not guessed from Django source),
  then `alembic stamp head` is used to adopt an existing dev database without re-running DDL.
  Full detail in `docs/adr/ADR-fastapi-database-migration.md`.
- **`Decision.status` / `Criterion.direction`**: Django never added Postgres `CHECK` constraints
  for these (enum-like fields validated only at the serializer layer). FastAPI adds them as an
  additive migration (safe: existing data already only contains valid values, since Django's own
  choices validation has been enforcing this at the application layer).
- **Django Admin**: not carried forward as a standing FastAPI admin UI — it had no real usage yet
  (no documented admin workflow, no seed command exists). Revisit if/when a real need appears.
  Documented in the audit §12.

## Verification log

(Filled in as each stage completes — command run, exact result, not assumed.)

## Next session should resume at

Implementing `backend_fastapi/app/core/config.py` and `app/core/database.py`, per the plan in
this file's "Status by stage" table above.
