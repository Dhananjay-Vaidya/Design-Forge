# 03 — System Architecture

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
**Traces to:** DPR v1.0 (architecture authority), BRD v1.0 (constraints). Additions tagged **[REC]**.

---

## 1. Architecture Overview

DecisionForge AI is a containerized web application with a clear separation of concerns (DPR §Recommended technical architecture):

- **Frontend** — React + TypeScript + Vite SPA; decision workspace, charts, forms, responsive UI. Talks only to the backend REST API.
- **Backend** — FastAPI (async SQLAlchemy 2, Pydantic v2); business rules, validation, auth, deterministic scoring engine, REST API, `/metrics`. The **only** component that calls Gemini.
- **Database** — PostgreSQL; users, decisions, alternatives, criteria, scores, snapshots, AI results, outcomes, usage ledger, audit.
- **Async** — Celery workers + Redis (broker/result backend + response cache); AI jobs, reminders, summaries.
- **AI adapter** — Google Gen AI SDK behind a service interface; schemas, retries, cache, model selection, circuit breaker.
- **Observability** — Prometheus scrapes the FastAPI `/metrics`, the Celery worker (`:9808`), and the PostgreSQL/Redis exporters; Grafana dashboards are provisioned from files. See `observability-setup.md`.
- **Runtime** — Docker Compose for consistent local dev (and reference deployment).

**Load-bearing decisions:** deterministic engine is independent of AI (BR-006/011); Gemini is backend-only and env-configured (NFR-001, AIR-01); AI calls are async and non-blocking (AC-005); metrics are low-cardinality (BR-015).

## 2. Container-Level Architecture

```mermaid
flowchart TB
    subgraph Client
        B["Browser — React SPA (Vite build)"]
    end
    subgraph Edge
        NX["Nginx [REC]<br/>static assets + reverse proxy"]
    end
    subgraph App
        API["FastAPI<br/>(gunicorn + uvicorn workers)<br/>/api/v1, /metrics, /healthz"]
        WK["Celery Worker(s)"]
        BEAT["Celery Beat<br/>(scheduler)"]
    end
    subgraph Data
        PG[("PostgreSQL")]
        RD[("Redis<br/>broker + cache")]
    end
    subgraph Observability
        PR["Prometheus"]
        GF["Grafana"]
        PGX["postgres-exporter"]
        RDX["redis-exporter"]
    end
    EXT["Google Gemini API<br/>(external)"]

    B -->|HTTPS JSON| NX --> API
    API -->|SQL| PG
    API -->|enqueue jobs / cache| RD
    WK -->|consume jobs| RD
    BEAT -->|schedule| RD
    WK -->|SQL| PG
    WK -->|HTTPS, backend-only| EXT
    PR -->|scrape /metrics| API
    PR -->|scrape| PGX --> PG
    PR -->|scrape| RDX --> RD
    PR -->|scrape task metrics| WK
    GF -->|query| PR
```

Only the **worker and API** reach Gemini; the browser never does (NFR-001). Nginx is [REC] for local single-origin serving and TLS termination; Compose may serve the SPA via Vite preview in pure-dev mode.

## 3. Frontend Architecture

- **Stack:** React, TypeScript, Vite, React Router, TanStack Query (server state/caching), Zustand or Context (local UI state), React Hook Form + Zod (forms/validation), Tailwind (styling), Recharts (charts), Vitest + RTL (tests).
- **Layering:**
  - `routes/` — route components (see `07-frontend-ux-specification.md` route map).
  - `features/` — decision, alternatives, criteria, scoring, ranking, ai, outcomes, dashboard — each with components, hooks, API clients, Zod schemas.
  - `api/` — typed client; single axios/fetch wrapper; injects auth; maps the standard error envelope.
  - `lib/` — formatting, chart helpers, a11y utilities.
  - `store/` — Zustand slices for ephemeral UI (wizard step, modals).
- **Server state via TanStack Query:** queries keyed by resource; mutations invalidate keys; AI job status via polling (interval backs off) or SSE [REC].
- **Type safety:** Zod schemas mirror API contracts (05); the same schemas validate forms and parse responses.

## 4. Backend Module Architecture

Backend modules (bounded contexts: api / schemas / services / repositories / models / domain), all under a versioned API:

| App/module | Responsibility | Key SRS refs |
|------------|----------------|--------------|
| `accounts` | Auth, users, profiles, token lifecycle | FR-001/002, SEC |
| `decisions` | Decision, Alternative, Criterion, AlternativeScore CRUD; ownership | FR-003/004/005/006, BR-001/008 |
| `scoring` | Deterministic normalization, ranking, sensitivity (pure functions, no AI) | FR-007/008, BR-004/005/006 |
| `snapshots` | Immutable snapshot creation + versioning | FR-012, BR-007 |
| `ai` | Adapter interface, prompt templates, schemas, cache, quota, circuit breaker; Celery tasks | FR-009/010/011, BR-012/013, AIR-* |
| `outcomes` | Commitment, outcome reviews, calibration, reminders | FR-013/014/016, BR-009/010 |
| `activity` [REC] | Append-only ActivityEvent audit log | Audit reqs |
| `observability` | Metrics instrumentation, health/readiness | FR-018, OBS-* |
| `common` | Error envelope, pagination, permissions (ownership), base models | NFR-002 |

The **scoring engine is a pure library** with no I/O, so it is trivially unit-tested and can never be affected by AI (BR-006, NFR-008).

## 5. Data Flow

```mermaid
flowchart LR
    U["User"] --> FE["React SPA"]
    FE -->|"REST /api/v1"| API["FastAPI"]
    API -->|read/write| PG[("PostgreSQL")]
    API -->|"ranking = pure fn"| ENG["Scoring engine<br/>(in-process)"]
    ENG --> API
    API -->|"AI request -> snapshot + enqueue"| RD[("Redis")]
    RD --> WK["Celery worker"]
    WK -->|"cache check (hash)"| RD
    WK -->|"call if miss"| G["Gemini adapter -> Gemini API"]
    G -->|"validated JSON"| WK
    WK -->|"store result vs snapshot"| PG
    FE -->|"poll job status"| API
```

## 6. Authentication Flow

```mermaid
sequenceDiagram
    participant FE as React SPA
    participant API as FastAPI
    participant DB as PostgreSQL
    FE->>API: POST /auth/login {email, password}
    API->>DB: verify credentials (hashed)
    DB-->>API: user ok
    API-->>FE: 200 {access, refresh} (refresh httpOnly [REC])
    FE->>API: GET /decisions (Authorization: Bearer access)
    API->>API: authN + ownership filter (BR-008)
    API-->>FE: 200 owner-scoped data
    FE->>API: POST /auth/refresh (rotate)
    API-->>FE: 200 {access}
    FE->>API: POST /auth/logout
    API-->>FE: 204 (refresh revoked)
```

Token storage strategy and CSRF/CORS posture are specified in `09-security-and-privacy.md` (SEC-04; token-storage decision in 14/OQ-3).

## 7. Decision Analysis Flow (deterministic — no AI)

```mermaid
sequenceDiagram
    participant FE
    participant API
    participant ENG as Scoring engine
    FE->>API: GET /decisions/{id}/ranking
    API->>API: load alternatives, active criteria, scores
    API->>API: guard: >=2 alts (BR-002), >=1 crit (BR-003), all cells (BR-005)
    alt preconditions fail
        API-->>FE: 400 ERR-VALIDATION (missing cells / <2 alts) [AC-002, AC-004]
    else ok
        API->>ENG: normalize weights (BR-004) + scores by direction
        ENG->>ENG: weighted totals; stable sort desc (AC-003)
        ENG-->>API: ranked list + basic sensitivity (FR-008)
        API-->>FE: 200 deterministic ranking
    end
```

## 8. Gemini Request Flow (advisory — async, validated)

```mermaid
sequenceDiagram
    participant FE
    participant API
    participant SNAP as Snapshot
    participant RD as Redis
    participant WK as Worker
    participant AD as Gemini adapter
    participant G as Gemini API
    participant DB as PostgreSQL
    FE->>API: POST /decisions/{id}/analysis {type}
    API->>API: check quota (BR-013)
    alt over quota
        API-->>FE: 429 ERR-QUOTA (actionable) [AC-008]
    else within quota
        API->>SNAP: create immutable snapshot (BR-007)
        API->>RD: enqueue AIAnalysisJob
        API-->>FE: 202 {job_id, status: QUEUED} [AC-005]
        WK->>RD: cache lookup by hash(input+prompt_ver+model)
        alt cache hit
            RD-->>WK: cached result [AC-011]
        else miss
            WK->>AD: build minimized input (NFR-010)
            AD->>G: request JSON (schema-constrained)
            G-->>AD: response
            AD->>AD: validate schema (BR-012)
            alt invalid
                AD-->>WK: invalid -> controlled fail/retry [AC-007]
            else valid
                AD-->>WK: validated result
                WK->>RD: store in cache
            end
        end
        WK->>DB: persist AIAnalysisResult vs snapshot [AC-006]
        FE->>API: GET /analysis/{job_id}
        API-->>FE: status + validated result (or safe failure)
    end
```

## 9. Celery Task Flow

```mermaid
flowchart LR
    subgraph Producers
        API["API: enqueue run_ai_analysis"]
        BEAT["Beat: scan_due_reviews (cron)"]
    end
    RD[("Redis broker")]
    subgraph Worker
        T1["run_ai_analysis<br/>(bounded retry, backoff+jitter)"]
        T2["scan_due_reviews<br/>(idempotent)"]
        T3["send_reminder"]
        T4["generate_summary [opt]"]
        T5["purge_or_anonymize"]
    end
    API --> RD --> T1
    BEAT --> RD --> T2 --> T3
    T1 --> PG[("PostgreSQL")]
    T3 --> PG
    T4 --> PG
    T5 --> PG
```

Idempotency and retry policy per SRS §9 and NFR-011.

## 10. Metrics Flow

```mermaid
flowchart LR
    API["FastAPI /metrics"] -->|scrape| PR["Prometheus"]
    WK["Celery task metrics"] -->|scrape/pushgateway [REC]| PR
    PGX["postgres-exporter"] --> PR
    RDX["redis-exporter"] --> PR
    PR -->|recording + alert rules| PR
    PR --> GF["Grafana dashboards"]
    PR --> AM["Alertmanager [REC]"]
```

Worker metrics: prefer a worker-embedded HTTP metrics endpoint scraped directly; Pushgateway is [REC] only if workers are not directly scrapeable. Cardinality rules per BR-015 / OBS-03.

## 11. Failure and Fallback Flow

```mermaid
flowchart TD
    R["AI request"] --> Q{"Within quota?"}
    Q -- No --> FQ["429 ERR-QUOTA, actionable msg<br/>scoring still usable (AC-008)"]
    Q -- Yes --> CB{"Circuit open?"}
    CB -- Yes --> FB["Return fallback response<br/>+ metric (AIR-07)"]
    CB -- No --> CALL["Call Gemini (async)"]
    CALL --> T{"Transient error?<br/>(timeout/5xx/429)"}
    T -- Yes --> RT{"Retries left?"}
    RT -- Yes --> BK["Backoff+jitter, retry (NFR-011)"] --> CALL
    RT -- No --> FAIL["Job FAILED + fallback + metric<br/>(trip breaker on sustained failure)"]
    T -- No --> V{"Schema valid?"}
    V -- No --> INV["Job FAILED, nothing invalid shown (AC-007)"]
    V -- Yes --> OK["Store result vs snapshot (AC-006)"]
```

Deterministic workflow is unaffected by any branch above (BR-011, NFR-003).

## 12. Architectural Decisions and Trade-offs (ADRs — condensed)

| ADR | Decision | Rationale | Trade-off / alternative |
|-----|----------|-----------|-------------------------|
| ADR-01 | Deterministic engine as a pure, in-process library separate from AI | Guarantees BR-006/011, easy to test (NFR-008) | None material |
| ADR-02 | Gemini calls only in Celery workers, never in request path | Non-blocking (AC-005), resilient (NFR-003) | Adds async complexity; needs job status UI |
| ADR-03 | Backend-only adapter behind an interface; model via `GEMINI_MODEL` | NFR-001/007, AIR-01; survive model changes | Slight indirection |
| ADR-04 | Cache AI results by `hash(input+prompt_version+model)` in Redis | AC-011, cost control | Cache invalidation on prompt/model change (handled by keying) |
| ADR-05 | Snapshots immutable + versioned | BR-007 auditability, comparison | Extra storage (JSONB) |
| ADR-06 | JWT access + rotating refresh | Stateless API, SPA-friendly | Token storage risk → see SEC/OQ-3 |
| ADR-07 | Prometheus pull + exporters | BRD mandate, standard | Worker scrape setup |
| ADR-08 | Normalized relational core + JSONB for snapshot/AI payloads | Integrity for core, flexibility for evolving AI schemas | JSONB less queryable (acceptable; payloads are read-whole) |
| ADR-09 | Global circuit breaker + per-user quota | DPR safeguards, BR-013 | Breaker state store (Redis) |

## 13. Scaling Approach

- **Stateless API** → scale horizontally behind Nginx; sessions carried by JWT.
- **Workers** → scale by queue depth (OBS metric); separate queues for AI vs reminders [REC] to isolate latency.
- **PostgreSQL** → vertical first; add read replica later for dashboard/calibration reads [REC, post-MVP].
- **Redis** → single instance for MVP; cache eviction policy sized to AI cache TTL.
- **Gemini** → capacity governed by per-user quota + global breaker, not by scaling infra.
- MVP target is the local reference environment (NFR-004); the above is the growth path, not MVP work.

## 14. Deployment Topology

- **MVP / portfolio:** single-host Docker Compose with services: `web` (API), `worker`, `db`, `redis`, `prometheus`, `grafana`, `postgres-exporter`, `redis-exporter`, and `frontend` (dev). A `beat` scheduler and `nginx` are not deployed yet: no periodic tasks exist. See `11-devops-deployment-runbook.md`.
- **Production hardening path [REC]:** managed Postgres, TLS at the edge, secrets manager, separate worker autoscaling, Alertmanager. Detailed in the runbook's production-hardening checklist. Not required for MVP acceptance.
