# 05 — API Specification

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
**Base path:** `/api/v1` · Traces to DPR §API surface, BRD FR/AC/BR. Additions tagged **[REC]**.

---

## 1. REST Conventions

- JSON only (`Content-Type: application/json`); UTF-8; snake_case fields.
- Resource-oriented, plural nouns: `/decisions`, `/decisions/{id}/alternatives`.
- Standard verbs: `GET` (read), `POST` (create/action), `PATCH` (partial update), `PUT` (full upsert of a set, used for the score matrix), `DELETE`.
- Timestamps are ISO-8601 UTC (`2026-09-23T10:15:00Z`). IDs are UUID strings.
- All list responses are paginated (see §4). All errors use the envelope in §7.

## 2. Versioning Strategy

- **URI versioning:** `/api/v1/...`. Breaking changes → `/api/v2`; v1 remains until deprecation.
- Response header `X-API-Version: 1`. Deprecations announced via `Deprecation` + `Sunset` headers [REC].

## 3. Authentication Requirements

- JWT Bearer on all endpoints except `POST /auth/register`, `POST /auth/login`, `GET /healthz`, `GET /readyz`, `GET /metrics`.
- Header: `Authorization: Bearer <access>`. Access token short-lived; refresh rotates (see 03 §6, 09 SEC-04). Token storage decision in 14/OQ-3.
- Every object endpoint additionally enforces **ownership** (NFR-002, BR-008): non-owned resources return **404** (not 403) to avoid existence leakage (AC-009). 403 is reserved for authenticated-but-forbidden actions.

## 4. Pagination, Filtering, Sorting

- **Pagination:** page-number style. Query: `?page=1&page_size=20` (`page_size` max 100). Response wraps results:
```json
{ "count": 42, "page": 1, "page_size": 20, "results": [ ] }
```
- **Filtering (list endpoints):** documented per endpoint, e.g. `GET /decisions?status=DRAFT&category=career`.
- **Sorting:** `?ordering=-updated_at` (prefix `-` = descending). Allowed fields documented per endpoint; unknown fields → 400 ERR-VALIDATION.

## 5. Validation-Error Format

Field-level errors are returned inside the standard envelope's `error.fields` so the SPA (React Hook Form + Zod) can map them to inputs (AC-002, AC-004):
```json
{
  "error": {
    "code": "validation_error",
    "message": "One or more fields are invalid.",
    "fields": {
      "alternatives": ["A decision requires at least two alternatives before ranking."],
      "scores": ["Missing score for alternative 'Job A' on criterion 'Salary'."]
    },
    "request_id": "req_01J..."
  }
}
```

## 6. Standard API Error Envelope

All non-2xx responses:
```json
{
  "error": {
    "code": "string",          // machine code (see mapping)
    "message": "string",       // human-readable, safe (no secrets)
    "fields": { },              // optional, validation only
    "retry_after_seconds": 0,   // optional, quota/rate
    "request_id": "string"      // correlation id (also in logs)
  }
}
```

| `error.code` | HTTP | Meaning (SRS ERR-*) |
|--------------|------|---------------------|
| `validation_error` | 400 | ERR-VALIDATION |
| `authentication_required` | 401 | ERR-AUTH |
| `permission_denied` | 403 | ERR-FORBIDDEN |
| `not_found` | 404 | ERR-NOTFOUND |
| `conflict` | 409 | ERR-CONFLICT |
| `quota_exhausted` | 429 | ERR-QUOTA (AC-008) |
| `rate_limited` | 429 | ERR-RATE |
| `server_error` | 500 | ERR-SERVER |

## 7. Idempotency Requirements

- `GET`, `PUT`, `DELETE` are idempotent by definition.
- `PUT /decisions/{id}/scores` upserts the whole provided cell set — repeatable safely.
- `POST /decisions/{id}/analysis` accepts an optional `Idempotency-Key` header [REC]; combined with the AI cache (hash of input+prompt_version+model, AC-011), repeated identical requests return the same job/result without a new provider call.
- Reminder creation is idempotent server-side (AC-010).

## 8. Endpoint Catalogue

Legend: 🔒 = auth required + ownership enforced.

### Authentication
| ID | Method & Path | Purpose | Traces |
|----|---------------|---------|--------|
| API-01 | `POST /auth/register` | Create account | FR-001 |
| API-02 | `POST /auth/login` | Authenticate, return tokens | FR-002 |
| API-03 | `POST /auth/refresh` | Rotate access token | FR-002 |
| API-04 | `POST /auth/logout` 🔒 | Revoke refresh token | FR-002 |

### User Profile
| API-05 | `GET /me` 🔒 | Current user + profile | FR-002 |
| API-06 | `PATCH /me/profile` 🔒 | Update display name, timezone, prefs | [REC] |
| API-07 | `POST /me/delete` 🔒 | Delete account + data | SEC-07, BR-014 |

### Decisions
| API-08 | `GET /decisions` 🔒 | List owned (filter status/category; ordering) | FR-015, BR-008 |
| API-09 | `POST /decisions` 🔒 | Create decision | FR-003, AC-001 |
| API-10 | `GET /decisions/{id}` 🔒 | Retrieve one | FR-003, AC-009 |
| API-11 | `PATCH /decisions/{id}` 🔒 | Edit / archive (status) | FR-003 |
| API-12 | `DELETE /decisions/{id}` 🔒 | Delete (deletion policy) | FR-003, BR-014 |
| API-13 | `POST /decisions/{id}/duplicate` 🔒 | Duplicate a decision | [REC], supports iteration |

### Alternatives
| API-14 | `GET /decisions/{id}/alternatives` 🔒 | List | FR-004 |
| API-15 | `POST /decisions/{id}/alternatives` 🔒 | Add | FR-004 |
| API-16 | `PATCH /alternatives/{aid}` 🔒 | Edit / reorder (`position`) | FR-004 |
| API-17 | `DELETE /alternatives/{aid}` 🔒 | Remove | FR-004 |

### Criteria
| API-18 | `GET /decisions/{id}/criteria` 🔒 | List | FR-005 |
| API-19 | `POST /decisions/{id}/criteria` 🔒 | Add (weight>0, direction) | FR-005, BR-004 |
| API-20 | `PATCH /criteria/{cid}` 🔒 | Edit / activate-deactivate | FR-005, BR-003 |
| API-21 | `DELETE /criteria/{cid}` 🔒 | Remove | FR-005 |

### Scores
| API-22 | `GET /decisions/{id}/scores` 🔒 | Full matrix | FR-006 |
| API-23 | `PUT /decisions/{id}/scores` 🔒 | Upsert matrix cells (idempotent) | FR-006, BR-005 |

### Ranking
| API-24 | `GET /decisions/{id}/ranking` 🔒 | Deterministic ranking + sensitivity | FR-007, FR-008, AC-002/003/004 |

### Snapshots
| API-25 | `GET /decisions/{id}/snapshots` 🔒 | List versions | FR-012, BR-007 |
| API-26 | `GET /snapshots/{sid}` 🔒 | Retrieve one snapshot | FR-012 |

### Gemini Analysis Jobs & Results
| API-27 | `POST /decisions/{id}/analysis` 🔒 | Queue analysis; returns job_id (202) | FR-009/010/011, AC-005/008 |
| API-28 | `GET /analysis/{job_id}` 🔒 | Job status + result when done | FR-010, AC-006/007 |
| API-29 | `GET /decisions/{id}/analyses` 🔒 | List analyses for a decision | FR-009 |

### Scenarios
| API-30 | `GET /decisions/{id}/scenarios` 🔒 | List persisted scenarios | [REC] (from scenarios analysis) |

### Commitment
| API-31 | `POST /decisions/{id}/commit` 🔒 | Record final choice (one active) | FR-013, BR-009 |
| API-32 | `GET /decisions/{id}/commitments` 🔒 | Commitment history | BR-009 |

### Outcome Reviews
| API-33 | `POST /decisions/{id}/outcomes` 🔒 | Schedule and/or submit outcome | FR-014, BR-010 |
| API-34 | `GET /decisions/{id}/outcomes` 🔒 | List outcome reviews | FR-014 |

### Dashboard & Calibration
| API-35 | `GET /dashboard` 🔒 | Active/completed/pending-review counts+lists | FR-015 |
| API-36 | `GET /dashboard/calibration` 🔒 | Confidence-vs-satisfaction summary | FR-016 |

### Export
| API-37 | `GET /decisions/{id}/export?format=json\|pdf` 🔒 | Export one decision | FR-017 |

### Ops
| API-38 | `GET /healthz` | Liveness | OBS-06 |
| API-39 | `GET /readyz` | Readiness (DB/Redis) | OBS-06 |
| API-40 | `GET /metrics` | Prometheus metrics (no auth; network-restricted) | FR-018, AC-012 |

## 9. Request / Response Examples

### API-09 Create decision
Request:
```json
POST /api/v1/decisions
{ "title": "Job offer decision", "context": "Choosing between three offers", "category": "career", "deadline": "2026-10-15" }
```
Response `201`:
```json
{ "id": "d1a2...", "owner_id": "u9...", "title": "Job offer decision", "context": "Choosing between three offers",
  "category": "career", "status": "DRAFT", "deadline": "2026-10-15",
  "created_at": "2026-09-23T10:00:00Z", "updated_at": "2026-09-23T10:00:00Z" }
```

### API-23 Upsert score matrix (idempotent)
Request:
```json
PUT /api/v1/decisions/d1a2.../scores
{ "scores": [
  { "alternative_id": "a1", "criterion_id": "c1", "score": 8, "rationale": "High base salary" },
  { "alternative_id": "a1", "criterion_id": "c2", "score": 6 },
  { "alternative_id": "a2", "criterion_id": "c1", "score": 7 }
] }
```
Response `200`:
```json
{ "updated": 3, "missing_cells": [ { "alternative_id": "a2", "criterion_id": "c2" } ] }
```

### API-24 Ranking — success (AC-003)
Response `200`:
```json
{ "decision_id": "d1a2...", "deterministic": true, "computed_at": "2026-09-23T10:20:00Z",
  "weights_normalized": { "c1": 0.6, "c2": 0.4 },
  "ranking": [
    { "rank": 1, "alternative_id": "a1", "name": "Offer A", "total": 0.78 },
    { "rank": 2, "alternative_id": "a2", "name": "Offer B", "total": 0.71 }
  ],
  "sensitivity": { "leader_stable": false, "note": "Leader may change with small weight shifts on c1." } }
```

### API-24 Ranking — validation failure (AC-002 / AC-004)
Response `400`:
```json
{ "error": { "code": "validation_error", "message": "Cannot rank.",
  "fields": { "alternatives": ["At least two alternatives are required."],
              "scores": ["Missing: (Offer B, Growth)."] },
  "request_id": "req_01J..." } }
```

### API-27 Queue analysis (AC-005)
Request:
```json
POST /api/v1/decisions/d1a2.../analysis
{ "analysis_type": "risks" }
```
Response `202`:
```json
{ "job_id": "job_77...", "status": "QUEUED", "analysis_type": "risks", "snapshot_version": 3 }
```
Quota exhausted → `429`:
```json
{ "error": { "code": "quota_exhausted",
  "message": "You've reached today's AI analysis limit. Scoring and ranking still work.",
  "retry_after_seconds": 43200, "request_id": "req_01J..." } }
```

### API-28 Job status → completed (AC-006)
Response `200`:
```json
{ "job_id": "job_77...", "status": "COMPLETED", "analysis_type": "risks",
  "model": "gemini-flash", "prompt_version": "risks.v1", "cache_status": "miss", "latency_ms": 2140,
  "snapshot_version": 3,
  "result": { "risks": [ { "alternative_id": "a1", "risk": "Role scope may expand beyond title",
      "likelihood": 3, "impact": 4, "mitigation": "Clarify scope in writing before signing" } ],
    "disclaimer": "Advisory analysis only; the user remains responsible for the decision." } }
```
Invalid output (AC-007) → `200` with:
```json
{ "job_id": "job_77...", "status": "FAILED", "failure_code": "schema_invalid",
  "message": "The AI response could not be validated and was discarded. No insight is shown." }
```

### API-31 Commit (BR-009)
Request:
```json
POST /api/v1/decisions/d1a2.../commit
{ "alternative_id": "a1", "confidence": 72, "rationale": "Best salary/growth balance; risks acceptable." }
```
Response `201`:
```json
{ "id": "cm_01...", "decision_id": "d1a2...", "alternative_id": "a1", "confidence": 72,
  "is_active": true, "snapshot_version": 4, "created_at": "2026-09-23T10:40:00Z" }
```

### API-36 Calibration (FR-016)
Response `200`:
```json
{ "reviews_count": 5, "avg_confidence": 68.2, "avg_satisfaction": 3.8,
  "buckets": [ { "confidence_range": "60-79", "count": 3, "avg_satisfaction": 4.0 } ],
  "note": "Higher-confidence decisions have trended toward higher satisfaction." }
```

## 10. HTTP Status Codes (usage)

| Code | Used for |
|------|----------|
| 200 | Successful GET/PATCH/PUT/action returning a body |
| 201 | Resource created (decision, alternative, criterion, commitment) |
| 202 | Async accepted (analysis queued, AC-005) |
| 204 | Successful action with no body (logout) |
| 400/401/403/404/409/429/500 | Per error envelope mapping (§6) |

## 11. Permissions (per endpoint class)

- **Public:** register, login, refresh, healthz, readyz, metrics (network-restricted).
- **Authenticated + owner:** everything else; ownership verified before any read/write; violations → 404 (AC-009).
- **Operator/Prometheus:** `/metrics` restricted by network policy, not user auth (03/09).

## 12. Rate Limits

- **Global per-user** app rate limit on write endpoints (e.g., token-bucket) → `429 rate_limited` with `retry_after_seconds` [REC threshold; see 14/OQ-6].
- **AI analysis** additionally governed by per-user daily quota (BR-013) → `429 quota_exhausted` (distinct code so the SPA shows the AI-specific, scoring-still-works message, AC-008).
- Rate-limit counters/labels never include IDs (BR-015).

## 13. OpenAPI / Swagger Strategy

- Generate OpenAPI 3.1 from DRF using **drf-spectacular**; serve interactive docs at `/api/schema/swagger-ui` and raw schema at `/api/schema` [REC].
- Schemas mirror the Zod types on the frontend (single source per contract; keep in sync via generated TS types [REC]).
- The generated spec is part of the DoD for each API story (BRD constraint: API docs alongside features).
