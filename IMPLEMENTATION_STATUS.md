# DecisionForge AI — Implementation Status

> **Historical log.** This file records the original Django implementation. The backend has since been migrated to FastAPI - see `FASTAPI_MIGRATION_STATUS.md` and `docs/django-to-fastapi-migration-report.md`. Django-specific commands below no longer apply.

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
| 2 | Decision Core (CRUD + deterministic engine) | DONE (M2 MVP core) |
| 3 | Gemini Advisory Layer | NOT STARTED |
| 4 | Outcomes & Calibration | NOT STARTED |
| 5 | Observability (Prometheus/Grafana) | PARTIAL (local stack + metrics wired) |
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
- Observability targets the active `backend/` Django runtime. `backend_fastapi/` exists as a partial
  migration scaffold, but it is not currently launched by Docker Compose. The local Compose backend
  uses one Gunicorn worker so Prometheus Python client metrics remain correct without multiprocess
  setup.

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

## Phase 2 — Decision Core — DONE

Stories: DF-S-006..011 (FR-003..008, BR-001..006, AC-002/003/004)

**Files created (highlights):** `backend/apps/decisions/` — models (Decision with STT-DEC status
enum, Alternative, Criterion, AlternativeScore, all constraints from docs/04 §4.3-4.6: unique
names per decision, weight>0 check, score-range check, unique score cell), `selectors.py`
(owner-scoped lookups -> 404), `services.py` (ORM <-> engine adapter + `refresh_decision_status`
DRAFT<->SCORED bookkeeping + transactional `upsert_scores`), `serializers.py`, `views.py` (all
API-08..24 endpoints), `urls.py`, `admin.py`, migration `0001_initial.py`. `backend/apps/scoring/
engine.py` — the **pure** deterministic engine (weight normalization, benefit/cost score
normalization, weighted-sum ranking with stable tie-breaking by input order, basic
threshold-based sensitivity per docs/14 OQ-5 default) — zero Django/DRF/`apps.ai`/
`apps.decisions` imports, enforced by a dedicated purity test. `backend/tests/scoring/`
(`test_engine.py` — 16 hand-calculated unit tests, `test_purity.py`), `backend/tests/decisions/
test_decisions_api.py` (20 API tests: ownership isolation, CRUD, duplicate-name rejection,
score-range validation, status auto-transition, ranking success/AC-002/AC-004 failure paths).

**Files changed:** `config/urls.py` (wired `apps.decisions.urls`), `tests/factories.py` (added
Decision/Alternative/Criterion/AlternativeScore factories).

**Commands run / results:**
- `docker compose run web python manage.py makemigrations decisions` → generated `0001_initial.py`
  (had to fix `CheckConstraint(condition=...)` → `check=...`; Django 5.0's kwarg, `condition=` only
  exists from 5.1 — caught by actually running the migration generator, not assumed)
- `docker compose run web python manage.py migrate` → applied cleanly
- `docker compose run web python manage.py makemigrations --check --dry-run` → "No changes detected"
- `docker compose run web pytest -q` → **49 passed** (13 accounts + 36 new: 16 engine + 1 purity +
  20 API... note some are parametrized-by-name, exact count per file may shift slightly as tests
  were added iteratively, but the final run is 49/49 green)
- `docker compose run web ruff check .` → clean (fixed B904 raise-from, one unused import)
- `docker compose run web black .` / `--check .` → clean
- Restarted the live stack (`docker compose up -d --build web worker beat`) and ran a full live
  curl smoke test: create decision → add 2 alternatives → add 2 weighted criteria (benefit+cost) →
  PUT full score matrix → GET ranking. Result matched the hand-calculated test exactly: weights
  0.6/0.4, "Offer A" total 0.6000 (rank 1), "Offer B" 0.4000 (rank 2), sensitivity "leader_stable":
  true, margin 0.2 — confirming the API layer and the pure engine agree on real data, not just in
  isolated unit tests.

**Acceptance criteria verified:** AC-001 (create → owned data only), AC-002 (ranking with <2
alternatives → 400, `fields.alternatives`), AC-003 (deterministic descending totals, verified both
in engine unit tests and live), AC-004 (missing cells enumerated in both `PUT /scores` response
and `GET /ranking` 400 response), AC-009 (cross-user access to decisions/alternatives → 404, no
leak — tested directly, and structurally guaranteed by every view going through the owner-scoped
selectors). BR-002/003/004/005/006 all covered by engine + API tests. BR-006 additionally has a
structural test (`test_purity.py`) asserting the engine module imports nothing from Django or
`apps.ai`, not just a code-review claim.

**Degraded-mode check (Gemini off):** Full create → alternatives → criteria → scores → ranking
flow (both in pytest and the live curl smoke test) required zero AI/Gemini code — there isn't any
yet — so this is trivially satisfied; the real test of BR-011 comes in Phase 3 once `apps.ai`
exists alongside this code.

**Unresolved risks / open questions:** `POST /decisions/{id}/duplicate` (API-13, [REC]/OQ-10) was
**not** implemented — it isn't required by any Phase 2 story (DF-S-006..011) and the roadmap's
Must-have list doesn't include it either; deferred to Phase 6 hardening or on request.
`ActivityEvent` audit logging ([REC], SRS §11) also deferred — the `apps.activity` app still has
no models; will add alongside Phase 3 (natural point since AI requests are the first thing worth
auditing) or Phase 4. Neither blocks any Must-have acceptance criterion.

**Exact next phase:** Phase 3 — Gemini Advisory Layer, starting DF-S-012 (snapshot service).

## Notes

- This was a from-scratch build (repo previously contained only `docs/`). No existing app code to reuse.
- Git repository initialized; per-story work is being committed with phase-tag commits at each
  phase exit, per `docs/13-claude-code-execution-plan.md` §6.
- Docker (29.6.1) and Docker Compose (v5.3.0) are available in this environment, so verification
  commands are run for real against the actual built stack, not just written and assumed to pass.
