# 13 — Claude Code Execution Plan

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
Audience: the coding agent (Claude Code) that will implement the system **after** this documentation. This plan sequences the build so each phase is verifiable. It restates the BRD implementation constraints as hard rules. Traces to DPR §Claude implementation handoff.

---

## 1. Read-First (mandatory before any code)

Read, in order: `14-assumptions-open-questions.md` (resolve/accept defaults), `03-system-architecture.md`, `04-database-design.md`, `05-api-specification.md`, `06-gemini-integration-design.md`, `09-security-and-privacy.md`, then `12-implementation-roadmap.md`. Do not scaffold before reading the BRD and DPR completely (BRD constraint).

## 2. Recommended Repository Creation Order

1. Repo + `README.md` skeleton + `.gitignore` + `.env.example` (names only).
2. `docker-compose.yml` + service Dockerfiles (web, worker, frontend) + `infra/` (prometheus, grafana) placeholders.
3. Backend project (`backend/`) with the **custom User model committed before the first `makemigrations`**.
4. Frontend project (`frontend/`) scaffold (Vite + TS + Tailwind + router + query).
5. Then implement per phase (§4), backend contract first, frontend against it.

## 3. File & Directory Plan (target layout)

```
decisionforge/
├─ README.md
├─ .env.example                 # names only, no secrets
├─ docker-compose.yml
├─ infra/
│  ├─ prometheus/prometheus.yml
│  ├─ prometheus/rules/*.yml
│  └─ grafana/provisioning/{datasources,dashboards}/*
├─ backend/
│  ├─ manage.py
│  ├─ decisionforge/            # settings, urls, celery app
│  ├─ accounts/                 # user, profile, auth
│  ├─ decisions/                # decision, alternative, criterion, score
│  ├─ scoring/                  # PURE engine: normalize, rank, sensitivity (no I/O)
│  ├─ snapshots/                # immutable snapshots
│  ├─ ai/                       # adapter, schemas, prompts, cache, quota, breaker, tasks
│  ├─ outcomes/                 # commitment, outcome review, calibration, reminders
│  ├─ activity/                 # ActivityEvent audit
│  ├─ observability/            # metrics, health/readiness
│  ├─ common/                   # error envelope, pagination, ownership permission, base models
│  └─ tests/                    # mirrors apps; fixtures, fakes (FakeGeminiClient)
└─ frontend/
   ├─ index.html
   └─ src/
      ├─ app/ (routing, AuthGuard, AppShell)
      ├─ features/{auth,decisions,alternatives,criteria,scoring,ranking,ai,outcomes,dashboard}
      ├─ api/ (client, error mapping)
      ├─ lib/ (formatting, a11y, charts)
      ├─ store/ (zustand slices)
      └─ test/ (setup, msw handlers)
```

## 4. Phase-by-Phase Implementation Instructions

Follow the roadmap phases (12). For each phase: implement stories → write tests alongside → run the phase verification (§5) → commit at the checkpoint (§6) → report files changed, commands run, test results, unresolved risks, and the exact next phase (DPR handoff format).

**Phase 1 — Foundation & Auth (DF-S-001..005)**
- Compose stack boots; custom User; register/login/logout/refresh; frontend shell + AuthGuard.
- Do **not** implement decisions yet.

**Phase 2 — Decision Core (DF-S-006..011)**
- Decision/Alternative/Criterion/Score CRUD with ownership; the **pure scoring engine** in `scoring/` with exhaustive unit tests; ranking + basic sensitivity.
- The engine must have **no** dependency on `ai/` (enforces BR-006).

**Phase 3 — Gemini (DF-S-012..017)**
- Snapshots; adapter behind interface with env model; six JSON schemas + validation; Celery jobs + status API; cache + quota + breaker + fallback; insights UI.
- Ship the `FakeGeminiClient`; all AI tests use it (no live calls).

**Phase 4 — Outcomes (DF-S-018..020)**
- Commit (one active + history); outcome reviews + idempotent reminders; dashboard + calibration.

**Phase 5 — Observability (DF-S-021..023)** — only now.
- Backend `/metrics`, health/readiness; exporters + Prometheus rules; provisioned Grafana dashboards.

**Phase 6 — Hardening (DF-S-024..028)**
- Security checklist automation; a11y + responsive; performance verification; export; README/docs finalization.

## 5. Verification Command After Every Phase

Run and require green before committing the phase:

```bash
# Backend
docker compose exec web python manage.py makemigrations --check --dry-run
docker compose exec web python manage.py migrate
docker compose exec web pytest -q
# Frontend
docker compose exec frontend npm run test -- --run
docker compose exec frontend npm run build     # must succeed; no secrets in bundle
# Stack health (phase 1+)
curl -fsS localhost:8000/healthz
# Observability (phase 5+)
curl -fsS localhost:8000/metrics | grep decisionforge_
```
Phase-specific extra checks:
- Phase 2: run the scoring engine unit suite; confirm AC-002/003/004.
- Phase 3: run AI contract tests with `FakeGeminiClient`; confirm AC-005/006/007/008/011 and that deterministic endpoints pass with AI disabled (BR-011).
- Phase 5: `promtool check rules infra/prometheus/rules/*.yml`; Prometheus `/targets` all UP; Grafana dashboards render.
- Phase 6: security checklist suite (09 §17) green; bundle-secret scan passes (AC-012); load test P95 < 500 ms (NFR-004).

## 6. Commit Checkpoints

- One commit per story (or tight group); message references the story ID and BRD IDs, e.g. `feat(scoring): deterministic ranking engine (DF-S-010, FR-007, AC-003)`.
- A **phase-tag** commit at each phase exit (`m1-foundation`, `m2-core`, `m3-ai`, `m4-outcomes`, `m5-observability`, `m6-release`).
- Never commit `.env` or secrets; never commit failing tests.

## 7. Known Risks (carry forward; mitigations already designed)

- **Free-tier quota/model changes** → env-configurable model, cache, quota, fallback (06). Verify degraded mode each phase.
- **Invalid AI output** → strict schema validation; nothing invalid shown (AC-007).
- **Scope creep** → build only roadmap stories; defer "Later" features (DPR).
- **Cardinality creep in metrics** → route normalization + label lint (08 §20, BR-015).
- **AUTH_USER_MODEL late change** → custom user in the first migration (Phase 1) — do not defer.
- **Snapshot mutation** → snapshots/results are insert-only; add tests asserting no update path (BR-007).

## 8. Rules Claude Code Must Not Violate (BRD §Implementation constraints)

1. **Never** substitute AI-generated numeric scores for the deterministic engine (BR-006).
2. **Never** call Gemini directly from React — backend adapter only (NFR-001).
3. **Never** hardcode a model name throughout the codebase — centralize via `GEMINI_MODEL` (AIR-01).
4. **Never** silently swallow invalid model output or quota errors — record controlled failure/metric; show safe message (AC-007/008).
5. **Never** add unapproved MVP features before all Must requirements pass.
6. **Never** ship secrets to the repo, logs, or frontend bundle (NFR-001, AC-012).
7. **Never** put user/decision IDs, prompts, or raw URLs in metric labels (BR-015).
8. **Always** create migrations, tests, and API docs alongside each feature (DoD).
9. **Always** keep the deterministic workflow operational with Gemini disabled and verify it every phase (BR-011).
10. **Always** enforce object-level ownership on every nested resource (NFR-002, AC-009).
11. **Do not** add Prometheus/Grafana until core workflow + Gemini pass tests (phase ordering).
12. **After each phase**, report files changed, commands run, test results, unresolved risks, and the exact next phase (DPR handoff).

## 9. Handoff Reporting Template (use after every phase)

```
Phase: <n - name>
Files changed: <list>
Commands run: <list + results>
Tests: <passed/failed, coverage on critical modules>
Acceptance criteria verified: <AC ids>
Degraded-mode check (Gemini off): <pass/fail>
Unresolved risks / open questions: <list, ref 14/OQ-*>
Exact next phase: <n+1 - name, first story id>
```
