# 12 — Implementation Roadmap

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
Phases mirror DPR §Delivery roadmap. Every story lists Story ID, user story, business value, acceptance criteria, dependencies, and complexity (S/M/L/XL). Traces to BRD FR/BR/AC. Additions tagged **[REC]**.

---

## 1. Definition of Ready (DoR)

A story is *ready* when: it has a clear user story and value; acceptance criteria are testable and reference BRD IDs; dependencies are identified; data/API/UX contracts it touches exist in docs 04/05/07; and it is estimated. No story enters a phase without meeting DoR.

## 2. Definition of Done (DoD) — per story (aligns with BRD §DoD)

Code + tests written together; all listed acceptance criteria pass (automated or documented); migrations/API docs updated alongside; no secrets in repo/logs/bundle; lint/format/type-check green; relevant metrics emitted where applicable; PR reviewed; feature works with Gemini disabled where it must (BR-011).

## 3. Epics

| Epic | Title | Phase | Covers |
|------|-------|-------|--------|
| EP-01 | Foundation & Auth | 1 | FR-001/002, NFR-012, SEC |
| EP-02 | Decision Core (CRUD + engine) | 2 | FR-003..008, BR-001..006 |
| EP-03 | Gemini Advisory Layer | 3 | FR-009..012, BR-007/011..013, AIR-* |
| EP-04 | Outcomes & Calibration | 4 | FR-013..016, BR-009/010 |
| EP-05 | Observability | 5 | FR-018, NFR-009, OBS-* |
| EP-06 | Hardening & Portfolio | 6 | NFR-004/005/006, DoD, export FR-017 |

## 4. Phases, Exit Conditions, Milestones

| Phase | Scope | Exit condition (DPR) | Milestone |
|-------|-------|----------------------|-----------|
| 1 Foundation | Repo, Docker, Django, React, Postgres, auth | Register, log in, reach protected UI | **M1 Walking skeleton** |
| 2 Decision core | CRUD, alternatives, criteria, scoring, ranking | Complete a decision matrix without AI | **M2 MVP core** |
| 3 Gemini | Adapter, schemas, cache, jobs, quota | Validated AI stored & displayed | **M3 AI milestone** |
| 4 Outcomes | Commit, reminders, calibration | Close & later review a decision | **M4 Full workflow** |
| 5 Observability | Prometheus, Grafana, alerts | Dashboards show app/AI/job/DB health | **M5 Observability milestone** |
| 6 Hardening | Tests, security, responsive, deploy docs, export | MVP passes acceptance tests | **M6 Portfolio release** |

Ordering rule (BRD/DPR): **do not add Prometheus/Grafana until the core decision workflow and Gemini integration pass tests** — hence observability is Phase 5.

---

## 5. Stories

### EP-01 Foundation & Auth (Phase 1)

**DF-S-001 — Project scaffolding & Docker Compose**
- *User story:* As a developer, I want a one-command local stack so I can run the whole app reproducibly.
- *Business value:* Enables all later work; satisfies NFR-012.
- *Acceptance criteria:* `docker compose up` starts web/db/redis/frontend; `.env.example` present with names only; `/healthz` returns 200.
- *Dependencies:* none. *Complexity:* **M**.

**DF-S-002 — Custom User model & migrations baseline**
- *User story:* As the system, I need an email-based user model before any data model is created.
- *Value:* Avoids costly `AUTH_USER_MODEL` change later.
- *Acceptance criteria:* custom user with unique email; initial migration applies; `makemigrations --check` clean.
- *Dependencies:* DF-S-001. *Complexity:* **S**.

**DF-S-003 — Registration**
- *User story:* As a visitor, I can create an account with a validated email and password. (US, FR-001)
- *Value:* Entry point to the product.
- *Acceptance criteria:* valid input creates account; duplicate email → 409; weak password → 400 with field guidance (VLD-01/02).
- *Dependencies:* DF-S-002. *Complexity:* **S**.

**DF-S-004 — Login / logout / refresh**
- *User story:* As a user, I can sign in, out, and refresh securely. (FR-002)
- *Value:* Session security.
- *Acceptance criteria:* valid creds → tokens; refresh rotates; logout revokes; invalid → 401 (ERR-AUTH).
- *Dependencies:* DF-S-003. *Complexity:* **M**.

**DF-S-005 — Frontend shell, routing, auth guard**
- *User story:* As a user, I can reach a protected app area after logging in. (Phase-1 exit)
- *Value:* M1 skeleton.
- *Acceptance criteria:* protected routes redirect when unauthenticated; token attached to API calls; dark-mode toggle present.
- *Dependencies:* DF-S-004. *Complexity:* **M**.

### EP-02 Decision Core (Phase 2)

**DF-S-006 — Decision CRUD + ownership**
- *User story:* As a user, I can create/view/edit/archive/delete my decisions. (FR-003, BR-001/008)
- *Value:* Core object.
- *Acceptance criteria:* AC-001 (owner-only); cross-user → 404 (AC-009); archive via status.
- *Dependencies:* DF-S-005. *Complexity:* **M**.

**DF-S-007 — Alternatives management**
- *User story:* As a user, I can add/edit/reorder/remove ≥ 2 alternatives. (FR-004, BR-002)
- *Value:* Inputs for scoring.
- *Acceptance criteria:* reorder persists; ranking blocked below 2 with field guidance (AC-002).
- *Dependencies:* DF-S-006. *Complexity:* **M**.

**DF-S-008 — Criteria & weights management**
- *User story:* As a user, I can add criteria with weight and benefit/cost direction. (FR-005, BR-003/004)
- *Value:* Priorities.
- *Acceptance criteria:* weight > 0 enforced; direction enum; ≥ 1 active required; weights normalize to 100% at calc.
- *Dependencies:* DF-S-006. *Complexity:* **M**.

**DF-S-009 — Scoring matrix**
- *User story:* As a user, I can score every alternative on every criterion with rationale. (FR-006, BR-005)
- *Value:* Complete inputs.
- *Acceptance criteria:* upsert via `PUT /scores`; score range enforced; missing cells reported (AC-004).
- *Dependencies:* DF-S-007, DF-S-008. *Complexity:* **L**.

**DF-S-010 — Deterministic ranking engine**
- *User story:* As a user, I can see a transparent, calculated ranking. (FR-007, BR-004/005/006, US-004)
- *Value:* The heart of the product; must work without AI.
- *Acceptance criteria:* AC-003 (deterministic descending totals); AC-002/AC-004 guards; pure-function unit tests ~100%.
- *Dependencies:* DF-S-009. *Complexity:* **L**.

**DF-S-011 — Basic sensitivity indicator**
- *User story:* As a user, I want to know if small changes could flip the leader. (FR-008, US-005 partial)
- *Value:* Communicates uncertainty.
- *Acceptance criteria:* stable/unstable flag with explanation; unit-tested on crafted inputs.
- *Dependencies:* DF-S-010. *Complexity:* **M**.

### EP-03 Gemini Advisory Layer (Phase 3)

**DF-S-012 — Snapshot service**
- *User story:* As the system, I create an immutable snapshot for each AI run/commit. (FR-012, BR-007)
- *Value:* Auditability; ties AI to exact inputs.
- *Acceptance criteria:* versioned, immutable; retrievable via API-25/26.
- *Dependencies:* DF-S-010. *Complexity:* **M**.

**DF-S-013 — Gemini adapter + model config + input minimization**
- *User story:* As the system, I call Gemini behind an interface with a configurable model and minimized input. (NFR-007/010, AIR-01/04)
- *Value:* Isolation, privacy, model resilience.
- *Acceptance criteria:* model from env; input builder excludes email/id (VLD-14 test); provider swappable/fakeable.
- *Dependencies:* DF-S-012. *Complexity:* **L**.

**DF-S-014 — Response schemas + server-side validation**
- *User story:* As the system, I validate every Gemini response before storing/displaying. (BR-012, AIR-03)
- *Value:* Trustworthy AI content.
- *Acceptance criteria:* six schemas (06 §7); invalid output rejected (AC-007); valid stored vs snapshot (AC-006).
- *Dependencies:* DF-S-013. *Complexity:* **L**.

**DF-S-015 — Async analysis jobs (Celery) + status API**
- *User story:* As a user, I request AI without blocking and watch its status. (FR-009/010, AC-005)
- *Value:* Responsive UX under slow/failing AI.
- *Acceptance criteria:* 202 job_id; states queued/processing/completed/failed; bounded retry on transient (NFR-011).
- *Dependencies:* DF-S-014. *Complexity:* **L**.

**DF-S-016 — Cache + per-user quota + circuit breaker + fallback**
- *User story:* As the operator, AI usage is bounded and resilient. (BR-011/013, AIR-08/09/10, AC-008/011)
- *Value:* Free-tier safety; reliability.
- *Acceptance criteria:* cache hit skips provider (AC-011); over-quota → 429, scoring works (AC-008); breaker opens on sustained failure → fallback.
- *Dependencies:* DF-S-015. *Complexity:* **L**.

**DF-S-017 — Insights & scenarios UI**
- *User story:* As a user, I see AI questions/assumptions/risks/scenarios/devil's-advocate, clearly marked advisory. (FR-009, AIR-06/11, US-003)
- *Value:* The AI value, safely presented.
- *Acceptance criteria:* disclaimer always shown; failed/invalid never rendered (AC-007); quota message (AC-008); deterministic vs AI visually distinct.
- *Dependencies:* DF-S-016. *Complexity:* **M**.

### EP-04 Outcomes & Calibration (Phase 4)

**DF-S-018 — Commit decision (one active, history kept)**
- *User story:* As a user, I record my final choice, confidence, rationale. (FR-013, BR-009, US-006)
- *Value:* Closure + honest record.
- *Acceptance criteria:* one active commitment; prior commitments auditable; commitment snapshot created.
- *Dependencies:* DF-S-012. *Complexity:* **M**.

**DF-S-019 — Outcome review scheduling + reminders**
- *User story:* As a user, I get a follow-up to rate the result. (FR-014, BR-010, US-007)
- *Value:* Learning loop.
- *Acceptance criteria:* schedule ≥ 1 review; exactly one idempotent reminder when due (AC-010); submit satisfaction+notes.
- *Dependencies:* DF-S-018. *Complexity:* **M**.

**DF-S-020 — Dashboard + calibration summary**
- *User story:* As a user, I see active/completed/pending decisions and confidence-vs-satisfaction. (FR-015/016)
- *Value:* Overview + self-insight.
- *Acceptance criteria:* three lists correct; calibration summary matches recorded data (formula per 14/OQ).
- *Dependencies:* DF-S-019. *Complexity:* **M**.

### EP-05 Observability (Phase 5)

**DF-S-021 — Backend metrics + health/readiness**
- *User story:* As the operator, I can scrape app metrics. (FR-018, OBS-01/06, AC-012)
- *Value:* Visibility.
- *Acceptance criteria:* `/metrics` exposes documented metrics; no private labels (BR-015); `/healthz`,`/readyz` behave.
- *Dependencies:* Phase 3–4 complete. *Complexity:* **M**.

**DF-S-022 — Exporters + Prometheus + rules**
- *User story:* As the operator, DB/Redis/worker metrics and alerts exist. (OBS-02/05)
- *Value:* Full-stack signals.
- *Acceptance criteria:* targets UP; recording+alert rules load; reminder-stale/latency/error alerts testable.
- *Dependencies:* DF-S-021. *Complexity:* **M**.

**DF-S-023 — Grafana provisioned dashboards**
- *User story:* As the operator, dashboards show real data on first start. (OBS-04)
- *Value:* Demo-ready observability.
- *Acceptance criteria:* five dashboards provisioned (08 §16) render live data.
- *Dependencies:* DF-S-022. *Complexity:* **M**.

### EP-06 Hardening & Portfolio (Phase 6)

**DF-S-024 — Security pass**
- *User story:* As the owner, the app resists common attacks and leaks no secrets. (SEC-*, AC-009/012)
- *Value:* Trust; interview-grade.
- *Acceptance criteria:* security checklist (09 §17) automated in CI and passing.
- *Dependencies:* Phases 1–5. *Complexity:* **M**.

**DF-S-025 — Accessibility & responsive polish**
- *User story:* As any user, primary flows are keyboard-operable and work on mobile/tablet/desktop. (NFR-005/006)
- *Value:* Inclusive, professional.
- *Acceptance criteria:* axe checks pass on key pages; keyboard traversal; responsive matrix behavior.
- *Dependencies:* Phases 2–4 UI. *Complexity:* **M**.

**DF-S-026 — Performance verification**
- *User story:* As the owner, non-AI P95 < 500 ms in the reference env. (NFR-004)
- *Value:* Meets performance target.
- *Acceptance criteria:* load test report shows P95 < 500 ms (excl. cold start); AI load uses fake client.
- *Dependencies:* Phases 2–3. *Complexity:* **S**.

**DF-S-027 — Export decision (JSON / printable)**
- *User story:* As a user, I can export one decision. (FR-017, Could)
- *Value:* Portability; nice-to-have.
- *Acceptance criteria:* export contains owner data only, no secrets.
- *Dependencies:* DF-S-010, DF-S-018. *Complexity:* **S**.

**DF-S-028 — README & docs finalization**
- *User story:* As a reviewer, I can set up, run, test, and troubleshoot from the README. (DoD)
- *Value:* Portfolio completeness.
- *Acceptance criteria:* README covers setup, env, migrations, seed, tests, troubleshooting; links this docs set.
- *Dependencies:* all. *Complexity:* **S**.

## 6. Dependency Overview (critical path)

DF-S-001 → 002 → 003 → 004 → 005 → 006 → {007, 008} → 009 → 010 → 011
010 → 012 → 013 → 014 → 015 → 016 → 017
012 → 018 → 019 → 020
(Phases 1–4 done) → 021 → 022 → 023
(All) → 024, 025, 026, 027, 028

## 7. Priority Summary

- **Must-have (MVP acceptance):** DF-S-001..010, 012..021, 024, 026, 028 (covers all Must FRs + BR-011 degraded mode + observability core).
- **Should:** DF-S-011 (FR-008), DF-S-020 calibration (FR-016), DF-S-022/023 full dashboards, DF-S-025.
- **Could:** DF-S-027 (FR-017 export).
