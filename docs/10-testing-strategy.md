# 10 — Testing Strategy

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
Traces to BRD NFR-008, all AC-*, DPR §Testing strategy. Tools: pytest, pytest-django (backend); Vitest, React Testing Library (frontend); Playwright [REC] (E2E). Additions tagged **[REC]**.

---

## 1. Testing Pyramid

```
        /\        E2E (few) — critical journeys
       /  \       Integration/API/DB/Celery (some)
      /____\      Unit (many) — engine, validators, adapters, components
```

Emphasis: a large, fast unit base around the **deterministic engine** and **AI schema validation** (the two NFR-008 mandates), a solid API/integration layer proving ownership and async behavior, and a thin E2E layer for the main journey. No test may call the real Gemini API (§8).

## 2. Unit Tests

- **Scoring engine (highest priority):** weight normalization to 100% (BR-004); direction handling (benefit vs cost); complete-matrix requirement (BR-005); weighted totals; **stable, deterministic ordering** — identical inputs → identical order (AC-003); tie handling; missing-cell detection (AC-004); guard for < 2 alternatives (AC-002).
- **Sensitivity:** small perturbations correctly flag leader stability (FR-008).
- **AI input builder:** excludes email/id/unrelated profile fields (NFR-010, VLD-14).
- **Validators/serializers:** VLD-01..VLD-10 field rules.
- **Quota/breaker/cache logic:** counting, thresholds, key construction (BR-013, AC-011).

## 3. Integration Tests

- Snapshot creation is immutable and versioned on each AI run/commit (BR-007, FR-012).
- Commit enforces one active commitment while preserving history (BR-009).
- Deletion cascade/anonymization leaves no orphaned private data (BR-014).
- Degraded mode: with Gemini **disabled**, create → score → rank → commit → review all succeed (BR-011, NFR-003).

## 4. API Tests

- Every endpoint (05 catalogue): status codes, error envelope shape, validation-error field mapping (AC-002/004).
- **Ownership isolation:** user B requesting user A's resources → 404, no leak (AC-009) — parametrized across all nested endpoints.
- Pagination/filtering/sorting correctness and rejection of unknown fields.
- `POST /analysis` returns `202 {job_id}` and does not block (AC-005); over-quota → 429 quota_exhausted with scoring still usable (AC-008).
- `GET /analysis/{id}` reflects job state transitions (STT-AI).
- Idempotent `PUT /scores` and reminder creation (AC-010).

## 5. Database Tests

- Constraints enforced: `weight > 0`, score range, `direction` enum, status enum, unique (alternative,criterion), partial-unique active commitment.
- Migrations apply cleanly from empty; `makemigrations --check` is green (no drift).
- Indexes exist for dashboard/reminder/quota queries.

## 6. Celery Tests

- `run_ai_analysis`: success stores result vs snapshot (AC-006); invalid output → controlled failure, nothing invalid stored (AC-007); transient error → bounded retry with backoff; non-transient → no retry (NFR-011).
- `scan_due_reviews`/`send_reminder`: exactly one idempotent reminder per due review (AC-010); re-running the scan does not duplicate.
- Tasks run in eager/synchronous mode or with a test broker; no real Redis dependency required for logic tests.

## 7. Gemini Adapter Tests

- Request builder: correct prompt template + version + model selection; minimized input (NFR-010); schema attached.
- Response validation: golden **valid** payloads per type pass; golden **invalid** payloads (wrong type, extra field, bad enum, out-of-range likelihood, unknown `option_id`) are rejected (BR-012, AC-007).
- Cache: identical input+prompt_version+model returns cached result with `cache_status=hit`, no provider call (AC-011).
- Quota: over-limit rejects before provider call (BR-013).
- Circuit breaker: sustained failures open the breaker; open breaker returns fallback without calling the provider; half-open recovery.
- 429 handling honors retry hint and does not loop (AIR-10).

## 8. Contract Tests (no live quota) — the "test Gemini without spending" strategy

- A `FakeGeminiClient` implements the adapter's provider interface and returns configurable canned responses; the real Google SDK client is injected only outside tests.
- Contract tests assert the **shape** of the request the adapter would send (schema, minimized fields, model) and that every declared JSON Schema accepts its golden sample and rejects malformed samples.
- Frontend contract: Zod schemas parse the documented API examples (05) — keeps FE/BE contracts aligned.
- **Net effect:** full AI-path coverage with **zero** real Gemini calls (NFR-008, DPR).

## 9. Frontend Component Tests (Vitest + RTL)

- Scoring matrix: cell edit, missing-cell highlight, autosave/upsert call (FR-006, AC-004).
- Ranking view: renders ranked order + sensitivity badge; labels results as calculated, not AI.
- Insights panel: shows job states (queued/processing/completed/failed, FR-010); renders disclaimer; never renders invalid/failed content (AC-007); quota message when over limit (AC-008).
- Forms: RHF+Zod validation and server-error field mapping (AC-002/004).
- Accessibility unit checks: labels present, keyboard interaction on matrix/dialogs (NFR-005).

## 10. End-to-End Tests (Playwright [REC])

Critical journey: register → login → create decision → add 2 alternatives → add criteria → complete scores → view ranking → request AI (mock provider) → commit → schedule/submit outcome → see calibration. A second E2E runs the **same journey with AI disabled** to prove degraded-mode acceptance (BR-011).

## 11. Performance Tests

- Load test non-AI endpoints to verify **P95 < 500 ms** in the reference environment (NFR-004), excluding cold start.
- AI-adapter load uses the **fake** client so no paid/free services are invoked (DPR).
- Capture latency histograms; compare against alert thresholds (08).

## 12. Security Tests

Automate the checklist in `09-security-and-privacy.md` §17: ownership isolation (AC-009), bundle-secret scan (AC-012), log redaction, metric-cardinality lint, AI input minimization, escaped AI output, throttling. Run in CI.

## 13. Accessibility Tests

- Automated axe checks on key pages (landing, login, dashboard, workspace, matrix, insights).
- Keyboard-only traversal tests for primary flows (NFR-005).
- Contrast verified against design tokens (07 §10).

## 14. Observability Tests

Implemented in `backend/tests/api/test_observability.py`, `test_observability_more.py`,
`test_observability_config.py` and `backend/tests/unit/test_instrumentation.py`
(`make test-observability`):

- `/metrics` returns 200 with the Prometheus content type, is not in OpenAPI, and never measures itself.
- HTTP labels are route templates; raw paths, IDs and query strings never appear (BR-015). Real
  user/decision data is created and then searched for in the scrape output.
- Decision creation and ranking counters move; unrankable input is `rejected`, not `failure`.
- AI call/job, cache, circuit-breaker, quota, token and fallback helpers, driven by a stub provider
  (no Gemini SDK, no quota consumed); unknown label values collapse to bounded defaults.
- Celery success/failure/retry via real signals on an eager throwaway app.
- `/health` stays 200 when dependencies are down; `/ready` is 503 when PostgreSQL or Redis is
  down, 200 regardless of Gemini state, and never echoes hosts, URLs or keys.
- Static guards: rule and dashboard files reference only metrics the app registers; required rules
  and alerts exist; API rules exclude probe routes; every panel uses the provisioned datasource;
  Compose monitoring services are pinned, health-checked, internal, and have no hardcoded password.
- CI additionally runs `promtool check config` / `check rules` and parses all Grafana YAML/JSON.
- Live query validation: `python -m scripts.check_dashboards` executes every dashboard query
  against a running Prometheus (part of `make verify-observability`).

## 15. Test Fixtures

- Factories (factory_boy [REC]) for User, Decision, Alternative, Criterion, AlternativeScore, Snapshot, Job/Result.
- A "fully scored decision" fixture (2–3 alternatives, complete matrix) reused across ranking/AI/commit tests.
- Golden JSON fixtures: valid + invalid per analysis type (§7/§8).
- Frontend: MSW [REC] to mock the API from documented examples.

## 16. Mocking Strategy

- **External Gemini:** always mocked/faked in tests (§8) — never real calls.
- **Redis/Celery:** eager task mode or a test broker for logic; a lightweight Redis in integration only where needed.
- **Time:** freeze time for reminder/quota/date-based tests (AC-010, quotas).
- **Network:** disabled in the unit/contract layers.

## 17. Coverage Targets

| Area | Target |
|------|--------|
| Scoring engine + validators | ~100% lines/branches (business-critical) |
| AI adapter (build/validate/cache/quota/breaker) | ≥ 90% |
| API layer | ≥ 85% |
| Overall backend | ≥ 85% |
| Frontend critical components (matrix, ranking, insights, forms) | ≥ 80% |

Coverage is a guardrail, not a goal; every AC has an explicit test (below) regardless of line coverage.

## 18. Acceptance-Criteria → Test Map (BRD AC-001..AC-012)

| AC | Test(s) |
|----|---------|
| AC-001 | API: create decision returns to owner only |
| AC-002 | Engine + API: < 2 alternatives → 400 with field guidance |
| AC-003 | Engine: deterministic descending totals |
| AC-004 | Engine + API + FE: missing cells identified |
| AC-005 | API: analysis returns 202 job_id, non-blocking |
| AC-006 | Celery + adapter: valid output stored vs exact snapshot |
| AC-007 | Adapter + Celery + FE: invalid output discarded, nothing shown |
| AC-008 | API + FE: quota exhaustion message; scoring still usable |
| AC-009 | API (parametrized): cross-user → 404/403, no leak |
| AC-010 | Celery: exactly one idempotent reminder job |
| AC-011 | Adapter: cache hit returns without provider call |
| AC-012 | Observability + security: metrics present, no private labels; no secrets in bundle |

## 19. Release Test Checklist (BRD §Definition of done)

- [ ] All Must FRs implemented and tested.
- [ ] All AC-001..AC-012 pass (automated or documented).
- [ ] Core workflow verified with Gemini deliberately disabled (BR-011).
- [ ] Gemini validation, quota response, and cache behavior tested (BR-012/013, AC-011).
- [ ] No secrets in repo, logs, or frontend bundle (AC-012).
- [ ] `docker compose up` starts all services from the documented command (NFR-012).
- [ ] Prometheus scrapes backend + exporters; Grafana dashboards show real data; alerts testable.
- [ ] README covers setup, env vars, migrations, tests, troubleshooting.
- [ ] Coverage targets (§17) met; CI green.
