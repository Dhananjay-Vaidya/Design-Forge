# DecisionForge AI — Implementation Status

Last updated: 2026-09-23

## How to read this file

Phases follow `docs/12-implementation-roadmap.md` and `docs/13-claude-code-execution-plan.md`.
Each phase lists: stories covered, files, verification commands run, test results, and open risks.
Source-of-truth hierarchy: BRD > DPR > this docs package > code. Conflicts/defaults are recorded in
`docs/14-assumptions-open-questions.md`; this file does not repeat them unless a new decision is made.

## Phase status

| Phase | Name | Status |
|-------|------|--------|
| 1 | Foundation & Auth | DONE (M1 walking skeleton) |
| 2 | Decision Core (CRUD + deterministic engine) | NOT STARTED |
| 3 | Gemini Advisory Layer | NOT STARTED |
| 4 | Outcomes & Calibration | NOT STARTED |
| 5 | Observability (Prometheus/Grafana) | NOT STARTED |
| 6 | Hardening & Portfolio | NOT STARTED |

## Key decisions taken while implementing (beyond doc defaults)

- Token storage (OQ-3): JWT access token in memory on the frontend, rotating refresh token in an
  httpOnly/Secure/SameSite=Lax cookie, per D-7 recommendation. CSRF double-submit header required on
  cookie-based refresh/logout. Recorded as ADR-0001.
- Deletion policy (OQ-4): hard delete with cascade, per D-8. Recorded as ADR-0002.
- Score scale 1-10 (D-1), confidence 0-100 (D-2), satisfaction 1-5 (D-3), likelihood/impact 1-5 (D-4) — used as-is.
- Backend app breakdown follows `docs/03-system-architecture.md` §4 (accounts, decisions, scoring,
  snapshots, ai, outcomes, activity, observability, common) rather than the shorter app list in the
  original task brief (accounts/decisions/analysis/outcomes/audit/observability). Reason: BR-006
  requires the deterministic scoring engine to have zero dependency on the AI layer, which the docs'
  finer-grained split (`scoring` pure-library app separate from `ai`) enforces structurally; the task
  brief itself permits deviating from its suggested structure "only when there is a documented
  technical reason," and this is one (ADR-01 in `docs/03-system-architecture.md` §12).
- Django's CIText* fields are removed as of Django 5 (base image pins Django 5.0.9), so
  case-insensitive email uniqueness is implemented as `UniqueConstraint(Lower("email"))` plus a
  standard `unique=True` on the field (required for Django's `auth.E003` system check), rather than
  the `citext` column type shown in `docs/04-database-design.md` §4.1. Functionally equivalent.

## Phase 1 — Foundation & Auth — DONE

Stories: DF-S-001..005 (FR-001, FR-002, NFR-012, SEC-01/02/04)

**Files created (highlights):** root `.gitignore`/`.editorconfig`/`.env.example`/`Makefile`/
`docker-compose.yml`/`docker-compose.dev.yml`/`README.md`/`LICENSE`; ADRs 0001 (auth token storage)
and 0002 (deletion policy); `backend/` — `Dockerfile`, `requirements/{base,dev,test}.txt`,
`pyproject.toml`, `manage.py`, `config/` (settings base/dev/test/prod, celery, wsgi, asgi, urls),
`apps/common/` (models, middleware, logging redaction, exceptions/error-envelope, pagination,
permissions, throttling), `apps/accounts/` (User + UserProfile models, managers, signals,
serializers, views — register/login/refresh/logout/me/profile/delete, admin, urls),
`apps/observability/` (healthz/readyz), empty-placeholder apps `decisions/scoring/snapshots/ai/
outcomes/activity` (populated from Phase 2 onward), `tests/` (conftest, factories,
`accounts/test_auth.py` — 13 tests); `frontend/` — full Vite+TS+Tailwind scaffold, `Dockerfile`
(dev/build/production stages), `src/api/client.ts` (axios + CSRF + silent-refresh-on-401),
`src/stores/{authStore,themeStore}.ts`, `src/features/auth/*` (api, bootstrap hook, Register/Login
forms), `src/app/{App,AuthGuard,AppShell}.tsx`, pages (Landing/Register/Login/Dashboard/NotFound),
`src/schemas/auth.ts` (Zod), `tests/` (9 Vitest tests).

**Commands run / results:**
- `docker compose build web` → success (Django 5.0.9, DRF, simplejwt, celery, drf-spectacular, etc.)
- `docker compose run web python manage.py check` → "System check identified no issues"
- `docker compose run web python manage.py makemigrations` → generated `apps/accounts/migrations/0001_initial.py`
- `docker compose run web python manage.py makemigrations --check --dry-run` → "No changes detected" (clean)
- `docker compose run web python manage.py migrate` → all migrations applied OK (accounts, admin, auth,
  contenttypes, django_celery_beat, sessions, token_blacklist)
- `docker compose run web pytest -q` → **13 passed**
- `docker compose run web ruff check .` → "All checks passed!"
- `docker compose run web black .` / `--check .` → clean
- `npm install`, `npx tsc -b --noEmit` → clean
- `npx eslint . --max-warnings=0` → clean
- `npx vitest run` → **9 passed**
- `npx vite build` → succeeds; `grep` of `dist/` for `GEMINI_API_KEY`/`DJANGO_SECRET_KEY`/
  `POSTGRES_PASSWORD` → no matches (AC-012 bundle-secret check, done manually here; automated in CI
  during Phase 6/DF-S-024)
- `docker compose up -d --build` (all services: db, redis, web, worker, beat, frontend) → all
  containers `Up`/`healthy`
- `curl http://localhost:8000/healthz` → `{"status":"ok"}`
- `curl http://localhost:8000/readyz` → `{"status":"ok","checks":{"database":true,"redis":true}}`
- `curl http://localhost:5173/` → `200` (Vite dev server serving the SPA)
- `curl -X POST http://localhost:8000/api/v1/auth/register ...` → `201` with user + access token,
  refresh cookie set (live end-to-end smoke test against the running stack, not just pytest)
- `curl http://localhost:8000/api/schema/swagger-ui/` → `200`; `curl http://localhost:8000/admin/login/` → `200`

**Acceptance criteria verified:** DF-S-001 (compose up, `.env.example` names-only, `/healthz` 200),
DF-S-002 (custom user + clean `makemigrations --check`), DF-S-003 (register: 201 success, 409 on
duplicate email, 400 with field errors on weak password), DF-S-004 (login 200/401, refresh rotates
+ requires CSRF, logout requires CSRF + blacklists), DF-S-005 (AuthGuard redirects unauthenticated
to `/login?next=`, dark-mode toggle present, protected `/app` reachable after login).

**Degraded-mode check (Gemini off):** N/A — no AI code exists yet in Phase 1; `GEMINI_ENABLED=0` is
already the `.env.example` default and nothing in Phase 1 depends on Gemini.

**Unresolved risks / open questions:** none new. Standing ones from `docs/14-assumptions-open-questions.md`
(OQ-1/2/4/6/7/8) remain on their interim defaults and don't block Phase 2.

**Exact next phase:** Phase 2 — Decision Core, starting DF-S-006 (Decision CRUD + ownership).

## Notes

- This was a from-scratch build (repo previously contained only `docs/`). No existing app code to reuse.
- Git repository initialized; per-story work is being committed with phase-tag commits at each
  phase exit, per `docs/13-claude-code-execution-plan.md` §6.
- Docker (29.6.1) and Docker Compose (v5.3.0) are available in this environment, so verification
  commands are run for real against the actual built stack, not just written and assumed to pass.
