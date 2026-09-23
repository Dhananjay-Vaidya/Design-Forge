# FastAPI Migration Status

Last updated: 2026-09-23

This file tracks the Django → FastAPI backend migration so another session can resume from the
exact verified state. Companion documents: `docs/fastapi-migration-audit.md` (inventory + parity
matrix), `docs/adr/ADR-fastapi-database-migration.md`, `docs/adr/ADR-fastapi-authentication.md`.

**Read `docs/fastapi-migration-audit.md` §0 and §15 first.** The Django backend originally covered
only Phases 1-2 (auth + decision CRUD/scoring) when this audit was first written. Partway through
this migration, `git pull` merged in a **complete Phase 5 observability implementation**
(Prometheus/Grafana/exporters/custom metrics/Celery-task metrics) built in a separate concurrent
session — see `OBSERVABILITY_IMPLEMENTATION_STATUS.md`. That merge also surfaced a real, now-fixed
blocker: `.env`'s Postgres credentials had drifted from what the already-initialized dev DB volume
actually has. **Migration scope is now: auth + decisions/scoring + observability.** There is still
no Gemini/Celery-*task* behavior to migrate (Celery task *metrics instrumentation* exists, but
zero actual tasks are registered anywhere) and no CI.

## Strategy (Migration Safety Rules)

- FastAPI is being built in `backend_fastapi/`, alongside the untouched `backend/` (Django).
- `backend/` is not modified or deleted during this work (the Phase 5 observability merge and the
  `.env` credential fix are the only changes to `backend/`/root config, and both were verified
  live before committing — see "Incident: concurrent-session merge" below).
- No destructive database operations. The dev Postgres volume/data is left alone; verification
  uses a throwaway `alembic upgrade head` against a fresh test database plus a *read-only*
  baseline check against the real dev DB (`alembic stamp` dry-run / schema diff, not applied
  destructively).
- `backend/` is only replaced once FastAPI reaches verified parity for everything that currently
  exists (see the parity matrix). Nothing is removed from Django prematurely.

## Incident: concurrent-session merge (2026-09-23)

While `backend_fastapi/app/models/user.py` was being written, `git pull` (run by the repo owner)
merged in `origin/main`, which contained a full Phase 5 observability implementation for Django
built in a separate session. Detected via file-changed-on-disk notices mid-turn. Investigated
before continuing:

- `git log` showed a merge commit (`247042b`) reconciling a README conflict; `grep` for leftover
  `<<<<<<<`/`=======`/`>>>>>>>` markers across the repo found none — clean merge.
- Found a real blocker: `.env` POSTGRES_USER/PASSWORD had been changed to `postgres`/`root`,
  inconsistent with the already-initialized `decisionforge_postgres_data` Docker volume (created
  under `decisionforge`/`decisionforge_dev_pw` during Phase 1). The other session's own
  `OBSERVABILITY_IMPLEMENTATION_STATUS.md` flagged this exact mismatch as blocking its runtime
  verification.
- **Asked the user** (AskUserQuestion) how to resolve it and how to scope the migration given the
  new observability code. Answers: fix `.env` to match the existing volume (not reset it), and
  expand the FastAPI migration's scope to cover observability too.
- Fixed `.env` (restored `decisionforge`/`decisionforge_dev_pw` everywhere it appears, including
  the new `DATABASE_URL_ASYNC`/`DATABASE_URL_SYNC` vars this migration had already added).
  Verified with `psql \dt` against the *existing* volume — all 23 original tables present, no data
  loss, no volume reset performed.
- Rebuilt (`docker compose build web worker beat`), ran `migrate` (0 new operations — schema
  already current) and `makemigrations --check --dry-run` (clean), ran `pytest -q` → **56/56
  passed** (49 from Phases 1-2 + 7 new observability tests).
- Brought up the **full** stack (`docker compose up -d --build`) including the new
  `postgres-exporter`, `redis-exporter`, `prometheus`, `grafana` services — all `Up`/`healthy`.
  Verified live: `/healthz`+`/readyz` green, `curl /metrics` shows `decisionforge_*` series,
  Prometheus `/api/v1/targets` shows `decisionforge-web` and `postgres-exporter` both `"up"`.
- Committed the reconciled state (`39aa7c5`) together with the FastAPI scaffold work done so far,
  so this checkpoint is durable regardless of what happens in any other concurrent session.

**Takeaway for future sessions on this repo:** more than one agent/session may be working on this
GitHub repo concurrently. Before trusting in-context memory of file contents, check `git log`,
`git status`, and re-read files that matter — especially `.env`-adjacent state, since `.env` itself
is gitignored and won't show up in `git diff` even when it's the actual source of a runtime
failure.

## Status by stage

| Stage | Status |
|---|---|
| Audit (`docs/fastapi-migration-audit.md`, incl. §15 observability update) | DONE |
| ADR: database migration strategy | DONE |
| ADR: authentication strategy | DONE |
| Concurrent-session merge reconciled (`.env` fix, verified live) | DONE |
| `backend_fastapi/` scaffold: config, async db engine/session, error envelope + exception hierarchy, request-ID/access-log middleware, security (JWT+password+CSRF), logging redaction | DONE |
| `backend_fastapi/` models: `User`, `UserProfile`, `RefreshToken` (mapped to existing tables) | DONE |
| `backend_fastapi/` models: `Decision`, `Alternative`, `Criterion`, `AlternativeScore` | NOT STARTED |
| Domain scoring engine port (`app/domain/scoring/`) | NOT STARTED |
| Pydantic schemas (auth + decisions) | NOT STARTED |
| Repositories + services (auth + decisions) | NOT STARTED |
| API routes + dependencies (auth + decisions) | NOT STARTED |
| Observability port (`app/observability/metrics.py`, `/metrics`, `/health`, `/ready`) | NOT STARTED |
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

- `docker compose build web worker beat` (post-merge) → success.
- `docker compose run web python manage.py migrate` (post-merge, post `.env` fix) → "No migrations
  to apply" (schema already current — confirms the merge added no new Django migrations, only
  instrumentation code).
- `docker compose run web python manage.py makemigrations --check --dry-run` → "No changes detected".
- `docker compose run web pytest -q` → **56 passed**.
- `docker compose up -d --build` (full stack incl. prometheus/grafana/exporters) → all 10 services
  `Up`/`healthy`.
- `curl localhost:8000/healthz`, `/readyz` → both green.
- `curl localhost:8000/metrics` → `decisionforge_*` series present.
- `curl localhost:9090/api/v1/targets` → `decisionforge-web` and `postgres-exporter` both `"up"`.
- `grep` for merge-conflict markers across the repo → none found.
- Committed as `39aa7c5`.

## Next session should resume at

`backend_fastapi/app/models/decision.py` (Decision/Alternative/Criterion/AlternativeScore, mapped
to the existing `decisions_*` tables per `docs/fastapi-migration-audit.md` §3), then
`app/domain/scoring/engine.py` (straight port of `backend/apps/scoring/engine.py` — verify with
`docs/fastapi-migration-audit.md` §9 that it's still framework-free before copying), then Pydantic
schemas, then the auth domain end-to-end (schemas → repository → service → routes → tests) before
moving to decisions, per the "Status by stage" table above. Before resuming, run `git log
--oneline -5` and `git status` first — do not assume the repo is in the state this file describes
without checking, given the concurrent-session incident logged above.
