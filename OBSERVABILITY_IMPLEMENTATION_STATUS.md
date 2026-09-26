# Observability Implementation Status

Last updated: 2026-09-27. Backend: FastAPI (`backend/`). The Django-era log of this file is in git
history. Full operator documentation: [`docs/observability-setup.md`](docs/observability-setup.md).

"Verified" below means the listed command was actually run in this pass and succeeded.

## Phase table

| Phase | Description | Status | Files changed (this pass) | Verification performed | Result | Remaining issue |
|-------|-------------|--------|---------------------------|------------------------|--------|-----------------|
| 1 | Audit and plan | Verified | this file | Re-read every Phase 1 file against the code | Audit was accurate except that gaps 1–5 and 9 had since been closed; corrected below | — |
| 2 | FastAPI `/metrics` | Verified | — (already correct) | pytest (content type, not in OpenAPI, no self-measurement, route templates, no query strings); live `curl /metrics` on the Compose stack | 200, `text/plain; version=1.0.0`; route labels are templates only | Custom ASGI middleware kept instead of `prometheus-fastapi-instrumentator` (would duplicate series; documented) |
| 3 | Business metrics | Implemented (live for existing features) | `app/observability/instrumentation.py` (typing fix) | pytest; live demo: decision created, unrankable ranking, real ranking, Celery success + failure tasks | `decisions_created_total 1`, `ranking{rejected}=1`, `ranking{success}=1`, `sensitivity{success}=1`, Celery success/failure/duration/`error_category` recorded on the real worker | **Blocked for AI/cache/scenario/outcome:** no Gemini provider, AI jobs, cache, scenario or outcome code exists (product Phases 3–4). Helpers are wired and unit-tested with a stub provider but cannot be exercised end to end |
| 4 | Health and readiness | Verified | `tests/api/test_observability_more.py` (hanging-dependency test added) | pytest (healthy, PG down, Redis down, PG *hanging* past the bound, Gemini states, health during outage, no secrets); live `/health`, `/ready` | 200 / 200 with `optional.gemini`; 503 with a dependency down or hanging | — |
| 5 | PostgreSQL exporter | Verified | `docker-compose.yml` | Live: target up, `pg_up=1`, container healthy | Credentials now via `DATA_SOURCE_USER/PASS/URI` (no URL-encoding issues); internal only | — |
| 6 | Redis exporter | Verified | `docker-compose.yml` | Live: target up, `redis_up=1`, `redis_key_size{key="celery"}` present, container healthy | Switched to pinned `-alpine` variant to gain a health check; `REDIS_PASSWORD` supported | — |
| 7 | Prometheus service | Verified | `Makefile` | `promtool check config` (SUCCESS); live `/-/ready` 200; 5/5 targets up; restart keeps data (31 samples before/after) | OK | `--web.enable-lifecycle` must stay private (documented) |
| 8 | Recording rules | Verified | `infrastructure/prometheus/recording-rules.yml` | `promtool check rules` (20 rules); live: all rules `health=ok`, API rate/4xx/p50/p95/p99 non-zero after traffic, 5xx ratio `0` | API rules scoped to `/api/v1/*`; added `api_4xx_rate5m`; availability = `pg_up`/`redis_up`; ratios never NaN/empty | — |
| 9 | Alert rules | Verified | `infrastructure/prometheus/alerts.yml` | `promtool check rules` (16 alerts); live: loaded, healthy, none firing on a healthy stack | Added PostgreSQL/Redis down, config-reload-failed; 5xx alert needs minimum traffic | Alertmanager not deployed (no real receivers); documented as next step |
| 10 | Grafana service and provisioning | Verified | — | Live: `/api/health` 200, datasource health "Successfully queried the Prometheus API" | uid `decisionforge-prometheus`, `http://prometheus:9090`, sign-up disabled | — |
| 11 | Dashboards | Verified | the 4 dashboard JSON files | pytest guards; live Grafana search lists all 4 in folder DecisionForge; `check_dashboards` against live Prometheus | 59 queries: 49 with data, 10 valid-but-empty (9 AI panels, 5xx rate), **0 invalid** | AI panels show "No data" until the AI feature exists |
| 12 | Docker Compose completion | Verified | `docker-compose.yml`, `.gitattributes`, `backend/entrypoint.sh` | `docker compose config -q` (base + dev override); isolated live stack `dfobs`: build, `up --wait`, all 8 services healthy | Found and fixed a real Windows bug: CRLF `entrypoint.sh` made `web` exit (`set: Illegal option -`) | — |
| 13 | Automated tests | Verified | `tests/api/test_observability_config.py` (new), `test_observability_more.py`, `tests/unit/test_instrumentation.py` | Local (Py 3.13, isolated test DB): 197 passed. Container (Py 3.12, before the timeout test was added): 195 passed, 1 skipped (Compose file not mounted) | Fixed 2 over-strict tests and a Py 3.13 logging clash in the Celery test | — |
| 14 | Documentation | Implemented | `docs/observability-setup.md` (rewritten), `README.md`, `docs/03`, `docs/10`, `docs/11`, `IMPLEMENTATION_STATUS.md`, `.env.example` | Read-through against the verified results | — | — |
| 15 | Developer commands | Implemented | `Makefile` | promtool invocation verified by hand with the same `MSYS_NO_PATHCONV=1` form | `verify-observability` added; `test-observability` covers all 4 files | `make` is not installed on this Windows host, so the targets themselves were not executed |
| 16 | CI | Implemented | `.github/workflows/ci.yml`, `frontend/.npmrc` | Workflow YAML parses | New `observability` job (promtool config + rules, Grafana YAML/JSON parse); explicit observability pytest step | Not run on GitHub from here. `frontend/.npmrc` (`legacy-peer-deps`) fixes the pre-existing vite 8 / plugin-react 4 `npm ci` ERESOLVE |
| 17 | Runtime verification | Verified (except AI) | — | See checklist | See checklist | Fake Gemini analysis: **Blocked**, no AI analysis feature exists |

## Runtime checklist (isolated Compose project `dfobs`, torn down afterwards with its own volumes)

| # | Check | Result |
|---|-------|--------|
| 1 | Backend dependency install | Pass (image build) |
| 2–3 | Ruff format / lint | Pass (container: 79 files formatted, all checks passed) |
| 4–6 | Unit, integration, observability tests | Pass (195 passed, 1 skipped in container; 197 passed locally after adding the timeout test) |
| — | mypy | Pass (56 source files) |
| 7–8 | Frontend tests/build | Not needed: no frontend source changed in this pass |
| 9 | `docker compose config` | Pass (base and dev override) |
| 10 | Docker image build | Pass |
| 11–13 | promtool config / recording / alert rules | Pass (config valid; 20 + 16 rules) |
| 14–15 | Grafana YAML / dashboard JSON | Pass (pytest guards + live provisioning) |
| 16 | Compose startup | Pass (8 services healthy; frontend not started) |
| 17–19 | `/health`, `/ready`, `/metrics` | Pass (200, 200, 200 with Prometheus content type) |
| 20–21 | Prometheus ready, targets API | Pass (5/5 up) |
| 22 | Grafana health | Pass |
| 23–24 | PostgreSQL / Redis exporter scrape | Pass (`pg_up=1`, `redis_up=1`) |
| 25–26 | Demo decision, deterministic ranking | Pass (ranking A 0.778 > B 0.222, leader stable) |
| 27 | Fake Gemini analysis | **Blocked**: no AI analysis code exists |
| 28 | Metric values increased | Pass (decision, ranking success/rejected, sensitivity, Celery success/failure) |
| 29 | Dashboards provisioned | Pass (4 dashboards, folder DecisionForge) |
| 30 | Application still works | Pass (full API test suite green; register → decision → ranking flow works) |
| — | No PII in metrics | Pass (decision/alternative IDs, email, JWT, query value, title all absent from live scrape) |

Isolation details: the stack ran as Compose project `dfobs` with host ports 18000/19090/13001, no
published Postgres port, and its own `dfobs_*` volumes, so the developer's local PostgreSQL,
backend and dev server were untouched. `docker compose -p dfobs down -v` removed only those volumes.
Local tests used a separate `decisionforge_test` database and Redis db 15, never `decisionforge`.

## Known limitations

- AI, cache, scenario and outcome metrics cannot produce data until those features are built.
  Their instrumentation points are documented in `docs/observability-setup.md` §7.
- No Alertmanager: alerts are visible in Prometheus but not delivered anywhere.
- Makefile targets and the GitHub Actions workflow were not executed in this environment.

## Resume From Here

Nothing is in progress. The next observability work starts when product Phase 3 (Gemini) lands:
wrap provider calls with `observe_ai_call`/`observe_ai_job`, call `record_quota_rejection` and
`set_circuit_breaker_open` from the quota and breaker code, wrap the AI cache with
`observe_cache("ai")`, then re-run `make verify-observability` and expect the 9 AI dashboard
queries to return data.
