# FastAPI Migration Audit

**Date:** 2026-09-23 (updated same day — see §16)
**Scope of this audit:** the actual current state of `backend/` (Django) and `frontend/`, as
inspected directly (migrations read, running Postgres schema queried with `\dt`, frontend source
grepped for API calls) — not assumed from documentation.

**Update note:** after this audit was first written, `git pull` merged in a complete Phase 5
(Prometheus/Grafana observability) implementation for the Django backend, done in a separate
concurrent session (see `OBSERVABILITY_IMPLEMENTATION_STATUS.md`, `FASTAPI_MIGRATION_STATUS.md`
"Key decisions"). §15 below documents that addition and supersedes the "not implemented" notes
about `/metrics` and Celery elsewhere in this file. Everything else in §1-§15 was re-verified
after the merge (migrations still clean, 56/56 tests pass, full stack healthy) and remains
accurate.

## 0. Discrepancy vs. the migration brief's assumptions

The migration instructions describe a backend that already has Gemini integration, Celery
analysis tasks, Prometheus metrics, Grafana dashboards, CI, and outcomes/snapshots/scenarios
functionality. **That is not the current state of this repository.** Per `IMPLEMENTATION_STATUS.md`,
only two of six roadmap phases are built:

- **Phase 1 (Foundation & Auth)** — done.
- **Phase 2 (Decision Core)** — done.
- **Phase 3 (Gemini) through Phase 6 (Hardening)** — not started. `apps/snapshots`, `apps/ai`,
  `apps/outcomes`, `apps/activity` are empty Python packages with no models, no views, no tasks.
  There are no Celery tasks anywhere in the codebase (`grep -rl "shared_task\|@app.task"` → no
  matches). `django-prometheus` is an installed-but-unwired dependency (not in `INSTALLED_APPS`
  or `MIDDLEWARE`) — there is no `/metrics` endpoint. `.github/workflows/` is empty — no CI exists.

This changes the migration's actual scope substantially: there is no Gemini/Celery/Prometheus/CI
*behavior* to preserve, because none exists yet. This audit and the resulting migration therefore
cover exactly what's real: **auth + decision CRUD + the deterministic scoring engine**, plus the
infrastructure (health checks, error envelope, Docker Compose, Makefile) around them. Sections of
the original migration brief that describe not-yet-built features (Steps 11/12/15 Gemini/Celery/
Prometheus specifics, Step 21 "remove Django admin dependencies" beyond the plain model admin,
etc.) are addressed as "N/A — nothing to migrate yet" rather than invented.

## 1. Existing backend directory structure

```
backend/
├── manage.py, pyproject.toml, Dockerfile, requirements/{base,dev,test}.txt
├── config/
│   ├── settings/{base,dev,test,prod}.py
│   ├── urls.py, celery.py, wsgi.py, asgi.py
├── apps/
│   ├── common/        # error envelope, pagination, ownership permission, base models,
│   │                   # request-ID middleware, log redaction, throttling
│   ├── accounts/       # custom User + UserProfile, JWT auth views
│   ├── decisions/      # Decision/Alternative/Criterion/AlternativeScore CRUD + ranking
│   ├── scoring/        # pure deterministic engine (engine.py) — no Django imports
│   ├── observability/  # healthz/readyz only
│   ├── snapshots/      # empty (Phase 3, not started)
│   ├── ai/             # empty (Phase 3, not started)
│   ├── outcomes/       # empty (Phase 4, not started)
│   └── activity/       # empty (Phase 4/audit, not started)
└── tests/
    ├── conftest.py, factories.py
    ├── accounts/test_auth.py           (13 tests)
    ├── scoring/test_engine.py, test_purity.py  (17 tests)
    └── decisions/test_decisions_api.py (19 tests)
```

49 backend tests total, all passing as of the last verified run (`docker compose run web pytest -q`).

## 2. Django apps and their responsibility

| App | Models | Purpose |
|-----|--------|---------|
| `accounts` | `User`, `UserProfile` | Custom email-based user, JWT auth, profile |
| `decisions` | `Decision`, `Alternative`, `Criterion`, `AlternativeScore` | Core CRUD + score matrix |
| `scoring` | none (pure functions/dataclasses) | Deterministic ranking engine |
| `common` | none | Cross-cutting: error envelope, pagination, permissions, middleware |
| `observability` | none | `/healthz`, `/readyz` |
| `snapshots`, `ai`, `outcomes`, `activity` | none | Empty — placeholders for Phases 3/4 |

## 3. Database — actual Postgres schema (verified via `psql \dt` against the running dev DB)

Product tables (everything else below the line is Django/Celery-beat/simplejwt framework
plumbing, not product data):

| Table | Django model | Notes |
|-------|-------------|-------|
| `accounts_user` | `accounts.User` | PK `id` uuid; `email` varchar(254) UNIQUE + functional `UNIQUE(lower(email))` constraint `unique_lower_email`; `password` varchar(128); `is_active`, `is_staff`, `is_superuser` bool; `last_login`, `created_at`, `updated_at` timestamptz |
| `accounts_userprofile` | `accounts.UserProfile` | PK `id` uuid; `user_id` uuid FK UNIQUE (OneToOne) → `accounts_user.id` CASCADE; `display_name` varchar(120); `timezone` varchar(64) default `'UTC'`; `quota_tier` varchar(32) default `'free'`; `preferences` jsonb default `{}`; `created_at`/`updated_at` |
| `decisions_decision` | `decisions.Decision` | PK `id` uuid; `owner_id` uuid FK → `accounts_user.id` CASCADE; `title` varchar(200); `context` text; `category` varchar(64); `status` varchar(16) (DRAFT/SCORED/COMMITTED/UNDER_REVIEW/REVIEWED/ARCHIVED — **no DB CHECK constraint**, enforced only in the Django/Pydantic layer); `deadline` date nullable; `archived_at` timestamptz nullable; `created_at`/`updated_at`; indexes `(owner_id, status)`, `(owner_id, -updated_at)` |
| `decisions_alternative` | `decisions.Alternative` | PK `id` uuid; `decision_id` uuid FK CASCADE; `name` varchar(200); `description` text; `position` int; `created_at`/`updated_at`; `UNIQUE(decision_id, name)` = `unique_alternative_name`; index `(decision_id, position)` |
| `decisions_criterion` | `decisions.Criterion` | PK `id` uuid; `decision_id` uuid FK CASCADE; `name` varchar(200); `description` text; `weight` numeric(6,3) CHECK `weight > 0` = `criterion_weight_positive`; `direction` varchar(8) (benefit/cost — no DB CHECK, Django/app-level enum only); `is_active` bool; `position` int; `UNIQUE(decision_id, name)` = `unique_criterion_name`; index `(decision_id, is_active)` |
| `decisions_alternativescore` | `decisions.AlternativeScore` | PK `id` uuid; `alternative_id`/`criterion_id` uuid FK CASCADE; `score` numeric(6,3) CHECK `1 <= score <= 10` = `score_within_configured_range`; `rationale` text; `UNIQUE(alternative_id, criterion_id)` = `unique_score_cell`; `created_at`/`updated_at` |

Framework tables **not** carrying product data (safe to drop once Django is fully removed, but
left alone during the migration): `accounts_user_groups`, `accounts_user_user_permissions`,
`auth_group`, `auth_group_permissions`, `auth_permission`, `django_admin_log`,
`django_content_type`, `django_session`, `django_migrations`,
`django_celery_beat_*` (six tables — installed but unused, no periodic tasks defined),
`token_blacklist_blacklistedtoken`, `token_blacklist_outstandingtoken`.

**Important gap vs. Django's `Decision.status`/`Criterion.direction`:** Django enforces these as
choices only at the serializer/form layer, not as a Postgres `CHECK` constraint. The FastAPI
migration will add proper DB-level `CHECK` constraints for these two columns as a (backward
compatible, additive) improvement — see the database ADR.

## 4. Django migration history

Two initial migrations only: `accounts/migrations/0001_initial.py`,
`decisions/migrations/0001_initial.py` (plus the standard `auth`/`admin`/`sessions`/
`django_celery_beat`/`token_blacklist` third-party migrations). No migration squashing, no
data migrations, no schema evolution to reconcile — this is the simplest possible case for an
Alembic baseline.

## 5. API endpoints (existing, all under `/api/v1` unless noted)

| Method | Path | Auth | View | Notes |
|--------|------|------|------|-------|
| GET | `/healthz` | none | `observability.views.healthz` | liveness |
| GET | `/readyz` | none | `observability.views.readyz` | DB + Redis check, 503 if down |
| GET | `/api/schema/` | none | drf-spectacular | OpenAPI JSON |
| GET | `/api/schema/swagger-ui/` | none | drf-spectacular | Swagger UI |
| GET | `/auth/csrf` | none | `accounts.CsrfCookieView` | seeds CSRF cookie (Django-CSRF-specific; see ADR) |
| POST | `/auth/register` | none | `accounts.RegisterView` | 201, sets refresh cookie |
| POST | `/auth/login` | none | `accounts.LoginView` | 200, sets refresh cookie |
| POST | `/auth/refresh` | cookie + CSRF header | `accounts.RefreshView` | rotates refresh cookie |
| POST | `/auth/logout` | bearer + CSRF header | `accounts.LogoutView` | blacklists refresh, clears cookie |
| GET | `/me` | bearer | `accounts.MeView` | current user + profile |
| PATCH | `/me/profile` | bearer | `accounts.MeView` | update display_name/timezone/preferences |
| POST | `/me/delete` | bearer | `accounts.DeleteAccountView` | hard delete (ADR-0002) |
| GET/POST | `/decisions` | bearer | `decisions.DecisionListCreateView` | paginated list + create |
| GET/PATCH/DELETE | `/decisions/{id}` | bearer | `decisions.DecisionDetailView` | |
| GET/POST | `/decisions/{id}/alternatives` | bearer | `decisions.AlternativeListCreateView` | |
| PATCH/DELETE | `/alternatives/{id}` | bearer | `decisions.AlternativeDetailView` | |
| GET/POST | `/decisions/{id}/criteria` | bearer | `decisions.CriterionListCreateView` | |
| PATCH/DELETE | `/criteria/{id}` | bearer | `decisions.CriterionDetailView` | |
| GET/PUT | `/decisions/{id}/scores` | bearer | `decisions.ScoresView` | PUT upserts the matrix |
| GET | `/decisions/{id}/ranking` | bearer | `decisions.RankingView` | deterministic ranking + sensitivity |
| * | `/admin/` | Django session | Django admin | model CRUD for `User`, `UserProfile`, `Decision`, `Alternative`, `Criterion`, `AlternativeScore` |

**Not implemented (so nothing to migrate for these):** duplicate decision, scenarios, snapshots,
AI analysis request/status/result, commit, outcome reviews, dashboard/calibration, export,
`/metrics`. These remain future work regardless of backend framework.

## 6. Authentication mechanism (ADR-0001, already committed)

JWT access token (15 min default) returned in the response body only, kept in frontend memory
(Zustand store) — never in `localStorage`. Rotating refresh token (7 days default) in an
httpOnly, `SameSite=Lax` cookie named `df_refresh`, scoped to path `/api/v1/auth/`. `/auth/refresh`
and `/auth/logout` are the only two cookie-authenticated, state-changing endpoints and are
protected by Django's real CSRF middleware (double-submit: cookie `df_csrftoken` +
`X-CSRFToken` header), seeded via `GET /auth/csrf` (`ensure_csrf_cookie`). Refresh rotation
blacklists the previous token via `rest_framework_simplejwt.token_blacklist`.

**Frontend dependency (verified by grep of `frontend/src`):** the frontend calls exactly these
six things — `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /me`,
`GET /auth/csrf`, `POST /auth/refresh` — via `frontend/src/features/auth/api.ts`, using
`frontend/src/api/client.ts` (axios, `withCredentials: true`, `xsrfCookieName: "df_csrftoken"`,
`xsrfHeaderName: "X-CSRFToken"`). **No frontend code calls any `/decisions*` endpoint yet** — the
dashboard is a placeholder (`DashboardPage.tsx`). This means the FastAPI migration's frontend
compatibility risk is almost entirely concentrated in the auth flow and the cookie/CSRF contract,
not in decision data shapes (those can be preserved carefully anyway, since the wizard/workspace
UI is coming in a later phase and should not have to change field names later).

## 7. Authorization / ownership rules

Every nested decisions resource is resolved through `apps.decisions.selectors` functions that
filter by `owner=request.user` (or `decision__owner=request.user`) and raise Django's `Http404`
on a miss — DRF's default exception handler converts `Http404` → `NotFound` → HTTP 404. This is
how AC-009 (cross-user access → 404, not 403, no content leak) is satisfied; it's tested directly
in `tests/decisions/test_decisions_api.py::test_cross_user_access_returns_404_not_403` and
`test_add_alternative_to_other_users_decision_is_404`.

## 8. Error envelope (`apps/common/exceptions.py`)

```json
{"error": {"code": "...", "message": "...", "fields": {...}?, "retry_after_seconds": 0?, "request_id": "..."}}
```
Codes: `validation_error` (400), `authentication_required` (401), `permission_denied` (403),
`not_found` (404), `conflict` (409), `quota_exhausted`/`rate_limited` (429), `server_error` (500).
`request_id` comes from `apps/common/middleware.py::RequestIDMiddleware` (reads/generates
`X-Request-ID`, also set on the response header). This envelope shape is a hard product
requirement (`docs/05-api-specification.md` §6) and will be reproduced exactly in FastAPI.

## 9. Scoring engine (`apps/scoring/engine.py`)

Confirmed framework-free: `tests/scoring/test_purity.py` asserts (via AST inspection) it imports
nothing from `django`, `apps.ai`, `apps.decisions`, or `rest_framework`. It operates purely on
frozen dataclasses (`AlternativeInput`, `CriterionInput`, `ScoreCellInput`, `RankedAlternative`,
`SensitivityResult`, `RankingResult`) and `decimal.Decimal`. **This module can be copied into
FastAPI's domain layer verbatim, file-for-file, with zero changes** — that's exactly what the
"pure engine" architecture (ADR-01 in `docs/03-system-architecture.md`) was for.

## 10. Celery / Redis / Gemini / Prometheus / CI

None of these have any implementation yet (confirmed by grep/inspection above). `worker` and
`beat` containers run in Docker Compose but execute zero registered tasks. `redis` is only used
today as the Celery broker/backend (unused) — no caching, no rate-limit counters stored there yet
(DRF throttling classes exist in `apps/common/throttling.py` but use Django's default cache
backend, which is the process-local `LocMemCache` since no `CACHES` setting was configured —
**this is itself a latent bug**: per-user write throttling won't work correctly across multiple
`web` processes/replicas since it's not backed by Redis. Noted for the FastAPI rebuild to fix
properly, not carried forward as-is.)

## 11. Docker services (current `docker-compose.yml`)

`db` (postgres:16-alpine), `redis` (redis:7-alpine), `web` (Django, gunicorn in the base file /
runserver via `docker-compose.dev.yml`), `worker` (celery worker, idle), `beat` (celery beat,
idle), `frontend` (Vite dev server). No `nginx`, `prometheus`, `grafana`, or exporter services yet
(those are Phase 5 work per `IMPLEMENTATION_STATUS.md`, not yet built for either backend).

## 12. Features with no direct FastAPI/SQLAlchemy equivalent

- **Django Admin.** Used today only informally (no documented admin workflow exists yet — no
  seed data, no demo user creation via admin). Decision per Step 21: **not required for product
  function**; will be replaced with documented `psql`/CLI procedures rather than standing up
  SQLAdmin, since there is no current usage to preserve. Revisit if/when an actual admin workflow
  is adopted.
- **`rest_framework_simplejwt.token_blacklist`.** Will be reimplemented with an explicit
  `refresh_tokens` table (jti, user_id, expires_at, revoked_at) under SQLAlchemy — functionally
  equivalent, framework-agnostic.
- **Django's automatic model-level `UniqueConstraint(Lower("email"))` and check constraints** map
  directly to SQLAlchemy `CheckConstraint`/`Index(..., postgresql_using=...)` — no gap.

## 13. Migration risks

1. **CSRF-cookie auth flow is Django-idiomatic** (`django.middleware.csrf`, `ensure_csrf_cookie`,
   `csrf_protect`). FastAPI has no built-in equivalent — this needs a hand-rolled double-submit
   implementation that produces cookies/headers under the *same names* the frontend already
   expects (`df_csrftoken` / `X-CSRFToken` / `df_refresh`). This is the single highest-risk piece
   of parity work. Decision recorded in `docs/adr/ADR-fastapi-authentication.md`.
2. **DRF's automatic 400/401/403/404/409/429 → error-envelope mapping** must be reproduced by hand
   via FastAPI exception handlers; there's no framework doing it implicitly.
3. **`unique_lower_email` functional index** needs a raw SQL / `Index(..., postgresql_ops=...)`
   equivalent in SQLAlchemy/Alembic, not just a plain `unique=True` column.
4. **Decimal serialization**: DRF's `DecimalField` renders as JSON strings (e.g. `"0.6000"`);
   Pydantic v2's `Decimal` also serializes to string by default via `json.dumps`—needs an explicit
   check to avoid silently switching to float.
5. **Low risk overall** given the actual scope: no Gemini/Celery/Prometheus behavior to preserve,
   and the frontend only depends on the auth contract.

## 14. Recommended migration order

1. Scaffold `backend_fastapi/` (config, database, core error envelope, health/ready).
2. Auth (register/login/refresh/logout/me/profile/delete + CSRF) — highest-risk, do first, verify
   against the real frontend before moving on.
3. Decisions domain (models, scoring engine port, repositories, services, routes) — mirror the
   Django test suite 1:1 for confidence.
4. Docker Compose wiring (`web_fastapi` service alongside `web` during verification).
5. Full parity verification (run both backends' test suites, diff behavior).
6. Swap `backend/` → FastAPI, archive Django as `backend_django_legacy/`.
7. Update docs, Makefile, and this audit's parity matrix to final state.

## 15. Phase 5 observability (merged in from a concurrent session, post-audit)

Verified directly (containers brought up, endpoints curled, Prometheus targets queried) after
fixing an unrelated `.env` Postgres-credential drift that was blocking the other session's own
runtime verification (see `FASTAPI_MIGRATION_STATUS.md`).

- **`GET /metrics`** — wired via `django_prometheus.urls`, included at the URL root in
  `config/urls.py`. Confirmed live: exposes both `django_http_*` (django-prometheus's own request
  metrics) and `decisionforge_*` custom series.
- **`GET /health`, `GET /ready`** — new aliases for the existing `/healthz`, `/readyz` (same view
  functions, `apps/observability/urls.py`), added so the route names match Step 14 of the FastAPI
  migration brief without breaking the original names anything else might already depend on.
- **`apps/observability/metrics.py`** — hand-defined `prometheus_client` Counters/Histograms/Gauges
  (not `django-prometheus`'s auto HTTP metrics, which come separately): `decisionforge_decisions_created_total`,
  `decisionforge_ranking_calculations_total{status}` + `..._duration_seconds`,
  `decisionforge_sensitivity_analyses_total{status}`, `decisionforge_scenario_comparisons_total{status}`,
  `decisionforge_outcome_reviews_total`, and a full set of **AI metrics already defined ahead of
  the AI feature existing** (`decisionforge_ai_requests_total{provider,analysis_type,status}`,
  `..._request_duration_seconds`, `..._rate_limit_total`, `..._quota_rejections_total`,
  `..._cache_operations_total{result}`, `..._circuit_breaker_open{provider}` gauge,
  `..._token_usage_total{provider,token_type}`, `..._jobs_total{status}`, `..._job_duration_seconds`,
  `..._fallback_total{reason}`), plus Celery task metrics
  (`decisionforge_celery_tasks_total{task_name,status}`, `..._task_duration_seconds`,
  `..._task_retries_total`, `..._task_failures_total{task_name,error_category}`) and generic cache
  metrics. All label values are passed through a `bounded()` helper against small fixed allow-sets
  (`ALLOWED_STATUS`, `ALLOWED_PROVIDER`, `ALLOWED_ANALYSIS_TYPE`, `ALLOWED_ERROR_CATEGORY`, etc.),
  which is exactly the cardinality discipline `docs/08-prometheus-grafana-observability.md` §5/§20
  requires — no user/decision IDs, no raw exception text, no prompts.
- **`apps/observability/celery.py`** — Celery signal handlers (`task_prerun`/`task_success`/
  `task_failure`/`task_retry`/`task_postrun`) feeding the Celery metrics above. Registered via an
  import at the bottom of `config/celery.py`. No actual tasks exist yet to exercise this (Phase 3
  AI jobs will be the first), but the instrumentation itself is live and harmless.
- **`decisions/services.py` and `decisions/views.py`** — small targeted diffs (20 lines total)
  wiring `record_decision_created()` and the `ranking_timer()` context manager into the existing
  create-decision and ranking flows.
- **Compose services added:** `postgres-exporter` (quay.io/prometheuscommunity/postgres-exporter),
  `redis-exporter` (oliver006/redis_exporter), `prometheus` (prom/prometheus:v2.54.1),
  `grafana` (grafana/grafana:11.2.0) — all confirmed `Up`/`healthy` after `docker compose up -d --build`.
  Gunicorn's worker count was reduced from 3 to 1 in the `web` service's command specifically so
  the plain (non-multiprocess) `prometheus_client` registry stays accurate — documented in
  `OBSERVABILITY_IMPLEMENTATION_STATUS.md` and confirmed still the case in the current
  `docker-compose.yml`.
- **`infrastructure/prometheus/{prometheus.yml,recording-rules.yml,alerts.yml}`** and
  **`infrastructure/grafana/provisioning/**`, `infrastructure/grafana/dashboards/*.json`** — real
  config, not placeholders (the original audit's §11 note that these directories "did not contain
  usable config files" is now stale). Prometheus confirmed actively scraping `decisionforge-web`
  and `postgres-exporter` (`/api/v1/targets` → both `"health":"up"`).
- **Tests:** `backend/tests/observability/test_metrics.py` (part of the 56 total backend tests now
  passing).

**FastAPI implication:** Step 15 of the migration brief (Prometheus metrics) now has real,
verified Django behavior to preserve — not the "N/A, nothing built yet" status this audit
originally recorded. The FastAPI implementation should reproduce the same metric names and label
sets (via `prometheus-fastapi-instrumentator` for the generic HTTP layer, matching
`django_http_*`-equivalent coverage, plus a straight port of `apps/observability/metrics.py`'s
custom Counters/Histograms/Gauges — that module has zero Django-specific code itself, it's already
framework-agnostic `prometheus_client` usage callable from anywhere). Grafana dashboards query by
metric name, not by backend framework, so **no dashboard changes are needed** as long as the
FastAPI port keeps the exact same metric names and label sets — which is the plan.

## 16. API Parity Matrix

| Feature | Existing endpoint | Method | Auth | Request contract | Response contract | FastAPI target | Status | Tests | Notes |
|---|---|---|---|---|---|---|---|---|---|
| Liveness | `/healthz`, `/health` | GET | none | — | `{"status":"ok"}` | `/healthz` + `/health` alias | **Done** | test_observability::test_health_ok | Django now serves both names (§15) |
| Readiness | `/readyz`, `/ready` | GET | none | — | `{"status","checks":{db,redis}}` (200/503) | `/readyz` + `/ready` alias | **Done** | test_observability::test_ready_reports_checks_without_secrets | Django now serves both names (§15) |
| CSRF seed | `/api/v1/auth/csrf` | GET | none | — | 204 + Set-Cookie `df_csrftoken` | same | **Done** | test_auth (csrf via register flow), verify_e2e | Django-specific mechanism; FastAPI hand-rolled equivalent, see ADR |
| Register | `/api/v1/auth/register` | POST | none | `{email,password}` | 201 `{user,access}` + Set-Cookie `df_refresh` | same | **Done** | test_auth::test_register_*, test_frontend_contract, verify_e2e | 409 on duplicate email |
| Login | `/api/v1/auth/login` | POST | none | `{email,password}` | 200 `{user,access}` + Set-Cookie `df_refresh` | same | **Done** | test_auth::test_login_*, verify_e2e | 401 on bad creds |
| Refresh | `/api/v1/auth/refresh` | POST | cookie+CSRF | — | 200 `{access}` + rotated Set-Cookie | same | **Done** | test_auth::test_refresh_*, verify_e2e | 403 if CSRF header missing/invalid |
| Logout | `/api/v1/auth/logout` | POST | bearer+CSRF | — | 204 + clears cookie | same | **Done** | test_auth::test_logout_*, verify_e2e | |
| Current user | `/api/v1/me` | GET | bearer | — | `User` (id,email,created_at,profile) | same | **Done** | test_auth::test_me_*, test_security | |
| Update profile | `/api/v1/me/profile` | PATCH | bearer | `{display_name?,timezone?,preferences?}` | `User` | same | **Done** | test_auth::test_me_profile_patch_updates_display_name | |
| Delete account | `/api/v1/me/delete` | POST | bearer | — | 204 | same | **Done** | test_auth::test_delete_account_removes_user | hard delete, ADR-0002 |
| List decisions | `/api/v1/decisions` | GET | bearer | `?status=&category=&ordering=` | `{count,page,page_size,results}` | same | **Done** | test_decisions, test_security (pagination) | |
| Create decision | `/api/v1/decisions` | POST | bearer | `{title,context?,category?,deadline?}` | 201 `Decision` | same | **Done** | test_decisions::test_create_decision_* | |
| Get decision | `/api/v1/decisions/{id}` | GET | bearer | — | `Decision` | same | **Done** | test_decisions::test_cross_user_access_returns_404_not_403 | 404 if not owner |
| Patch decision | `/api/v1/decisions/{id}` | PATCH | bearer | `{title?,context?,category?,deadline?,status?}` | `Decision` | same | **Done** | test_decisions::test_patch_decision_* | `status` only settable to ARCHIVED |
| Delete decision | `/api/v1/decisions/{id}` | DELETE | bearer | — | 204 | same | **Done** | test_decisions::test_delete_decision_cascades | cascades |
| List alternatives | `/api/v1/decisions/{id}/alternatives` | GET | bearer | `?page=&page_size=` | `{count,page,page_size,results:[Alternative]}` | same | **Done** | test_security (cross-user) | |
| Create alternative | `/api/v1/decisions/{id}/alternatives` | POST | bearer | `{name,description?,position?}` | 201 `Alternative` | same | **Done** | test_decisions::test_add_alternative_* | 400 on dup name |
| Update alternative | `/api/v1/alternatives/{id}` | PATCH | bearer | partial `Alternative` | `Alternative` | same | **Done** | test_security (cross-user) | |
| Delete alternative | `/api/v1/alternatives/{id}` | DELETE | bearer | — | 204 | same | **Done** | test_decisions::test_delete_alternative_scoped_to_owner | |
| List criteria | `/api/v1/decisions/{id}/criteria` | GET | bearer | `?page=&page_size=` | `{count,page,page_size,results:[Criterion]}` | same | **Done** | test_security (cross-user) | |
| Create criterion | `/api/v1/decisions/{id}/criteria` | POST | bearer | `{name,weight,direction,description?,is_active?}` | 201 `Criterion` | same | **Done** | test_decisions::test_add_criterion_* | weight>0, direction enum |
| Update criterion | `/api/v1/criteria/{id}` | PATCH | bearer | partial `Criterion` | `Criterion` | same | **Done** | test_security (cross-user) | |
| Delete criterion | `/api/v1/criteria/{id}` | DELETE | bearer | — | 204 | same | **Done** | test_security (cross-user) | |
| Get score matrix | `/api/v1/decisions/{id}/scores` | GET | bearer | — | `[AlternativeScore]` | same | **Done** | test_decisions::test_scores_upsert_and_missing_cells | |
| Upsert scores | `/api/v1/decisions/{id}/scores` | PUT | bearer | `{scores:[{alternative_id,criterion_id,score,rationale?}]}` | `{updated,missing_cells}` | same | **Done** | test_decisions::test_scores_upsert_*, test_security | |
| Ranking | `/api/v1/decisions/{id}/ranking` | GET | bearer | — | `{decision_id,deterministic,weights_normalized,ranking,sensitivity}` or 400 | same | **Done** | test_decisions::test_ranking_*, verify_e2e (hand-calculated totals) | AC-002/003/004 |
| OpenAPI schema | `/api/schema/` | GET | none | — | OpenAPI 3.1 JSON | `/api/openapi.json` (path changed; frontend does not use it) | **Done** | test_openapi_snapshot, verify_e2e | |
| Swagger UI | `/api/schema/swagger-ui/` | GET | none | — | HTML | `/docs` (FastAPI default) | **Done** | verify_e2e | |
| Metrics | `/metrics` (`decisionforge_http_*` + custom `decisionforge_*`) | GET | none | — | Prometheus text exposition | `/metrics` (ASGI middleware + ported `metrics.py`, multiprocess mode) | **Done** | test_observability | Metric names changed: see docs/observability-setup.md mapping |
| AI analysis | — (not implemented) | — | — | — | — | Phase 3 work | N/A | — | Not yet built in Django either; metric definitions exist ahead of the feature (§15) |
| Outcomes/commit | — (not implemented) | — | — | — | — | Phase 4 work | N/A | — | Not yet built in Django either |
