# 14 — Assumptions & Open Questions

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
This register captures every interpretation gap, recommended default, source-document conflict, and decision needing product-owner sign-off. It is the companion to the source-of-truth hierarchy in `00-document-index.md`. Items tagged **[REC]** are recommendations, not approved scope.

---

## 1. Confirmed Assumptions (low risk; taken as true unless the owner objects)

| ID | Assumption | Basis |
|----|-----------|-------|
| A-1 | Single-user, private decisions; no sharing/collaboration in MVP. | BRD out-of-scope |
| A-2 | The deterministic engine is fully independent of Gemini and always available. | BR-006, BR-011, NFR-003 |
| A-3 | Gemini is backend-only; the key never reaches the browser. | NFR-001 |
| A-4 | The Gemini model is chosen via `GEMINI_MODEL`; not hardcoded. | AI requirements |
| A-5 | The full local stack runs via Docker Compose. | NFR-012 |
| A-6 | Metric labels are low-cardinality and free of private identifiers. | BR-015 |
| A-7 | AI responses are validated against explicit JSON Schemas before storage/display. | BR-012 |
| A-8 | Per-user AI quotas + a global circuit breaker bound AI usage. | BR-013, DPR safeguards |
| A-9 | AI results attach to immutable, versioned snapshots. | BR-007, FR-012 |
| A-10 | Ownership is enforced on every nested resource; cross-user → 404. | NFR-002, BR-008, AC-009 |
| A-11 | Prometheus + Grafana are added **after** core workflow + Gemini pass tests. | DPR handoff, BRD constraint |
| A-12 | Weights are entered positive and normalized to 100% at calculation time. | BR-004 |
| A-13 | Reference performance target (P95 < 500 ms) is measured in the local reference environment, excluding cold start. | NFR-004 |

## 2. Recommended Default Choices (used in this package; confirm or override)

| ID | Decision point | Recommended default [REC] | Rationale | Where used |
|----|----------------|---------------------------|-----------|------------|
| D-1 | Score scale | Integer **1–10** | Common, intuitive; supports normalization | 04, 05, 07, SRS VLD-06 |
| D-2 | Confidence scale (commit) | Integer **0–100** | Fine-grained calibration | 04, 05, SRS VLD-09 |
| D-3 | Satisfaction scale (outcome) | Integer **1–5** | Simple Likert; easy calibration buckets | 04, SRS VLD-10 |
| D-4 | Likelihood/impact (AI risks) | Integer **1–5** each | Matches DPR example (`likelihood:1`, `impact:1`) | 06 §7.3 |
| D-5 | Calibration formula | Bucket confidence, compare mean satisfaction per bucket | Transparent, no ML (out of scope) | 05 API-36, FR-016 |
| D-6 | Snapshot granularity | One snapshot per AI run and per commitment | Satisfies BR-007 without over-snapshotting | 04, 06, SRS B-3 |
| D-7 | Token storage | Refresh in httpOnly cookie, access in memory | Reduces XSS token theft | 09 §5 (see OQ-3) |
| D-8 | Deletion policy | Hard-delete with cascade; anonymize as an option | Simple, meets BR-014 | 04 §6 (see OQ-4) |
| D-9 | Notification channel | In-app only for MVP | Avoids email infra scope | SRS §10 (see OQ-8) |
| D-10 | Clarifying-questions count | 5–8 (min 5, max 8) | DPR "five to eight" | 06 §7.1 |
| D-11 | AI cache TTL | Configurable via env; sensible default (e.g., 24h) | Balance freshness vs cost | 06 §15 (see OQ-9) |
| D-12 | Worker metrics transport | Scrape a worker metrics endpoint; Pushgateway only if not scrapeable | Avoids Pushgateway pitfalls | 08 §2/§10 |

## 3. Unresolved Questions (need product-owner input)

| OQ | Question | Options | Interim default | Impact |
|----|----------|---------|-----------------|--------|
| OQ-1 | Exact score scale & whether it's user-configurable per decision | Fixed 1–10 / 1–5 / configurable | D-1 (1–10 fixed) | DB check constraint, UI, engine |
| OQ-2 | Calibration methodology detail | Simple buckets / Brier score / reliability curve | D-5 (buckets) | FR-016 depth, dashboard |
| OQ-3 | Token storage & session model | httpOnly cookie+CSRF / in-memory bearer | D-7 | Security posture, CORS/CSRF config |
| OQ-4 | Delete vs anonymize on decision/account deletion | Hard-delete / anonymize / user choice | D-8 (hard-delete) | BR-014 implementation, retention |
| OQ-5 | Sensitivity method depth for MVP | Threshold flag only / one-at-a-time weight sweep | Threshold flag + short note | FR-008 scope |
| OQ-6 | Rate-limit & quota thresholds | Specific numbers per endpoint/day | Env-configured; conservative defaults | BR-013, throttling, alerts |
| OQ-7 | Admin/operator access to private decision content | None / read-only support access / full | None (ops only) | Security, privacy, audit |
| OQ-8 | Email notifications for reminders | In-app only / add email | In-app (D-9) | Scope, infra, secrets |
| OQ-9 | Retention windows for usage ledger, activity log, operational logs | Indefinite / N days rolling | Env-configured; document default | Storage, privacy, 04 §12 |
| OQ-10 | Decision duplication semantics (API-13) | Deep copy incl. scores / structure only | Deep copy without commitments/outcomes | 05 API-13 |
| OQ-11 | Export formats & PDF rendering approach | JSON only / JSON + server-rendered PDF | JSON first; printable HTML→PDF [REC] | FR-017 |
| OQ-12 | Whether `Scenario` is persisted as a first-class entity or read from AI results only | Persist / derive | Persist [REC] (enables comparison view) | 04, 05 API-30 |

Each OQ has an interim default so implementation is never blocked; changing an answer later is a scoped change, tracked via the versioning policy (00 §5).

## 4. Conflicts Found in the Source Documents

| C | Conflict | BRD says | DPR / Task says | Resolution in this package |
|---|----------|----------|-----------------|---------------------------|
| C-1 | **Entity naming** | "Option", "OptionScore" (FRs) | Task list: "Alternative", "AlternativeScore"; DPR domain: "Option/OptionScore", "AnalysisRun", "AIInsight", "UsageLedger" | Canonical = task names (**Alternative, AlternativeScore, AIAnalysisJob, AIAnalysisResult, AIUsageRecord**); source names kept as documented synonyms (04 §1, glossary). No requirement dropped. |
| C-2 | **Entities beyond the domain model** | Domain model lists 10 entities | Task requires evaluating **UserProfile, Scenario, ActivityEvent** additionally | Added and tagged **[REC]**; each justified against BRD audit/data/profile needs (04 §2). |
| C-3 | **AI "scenarios" as data vs output** | Data requirements store validated AI payloads | Task lists `Scenario` as an entity | Persist scenarios as first-class rows derived from validated results (OQ-12); does not change the deterministic model. |
| C-4 | **Score/confidence/satisfaction scales** | Not specified numerically | DPR risk example uses 1..5 for likelihood/impact only | Defaults D-1..D-4 chosen and flagged (OQ-1). |
| C-5 | **Calibration definition** | FR-016 "summarizes predicted confidence against recorded satisfaction" | DPR "calibration profile/dashboard" (no formula) | Default bucket method D-5 (OQ-2); kept simple (no ML — out of scope). |
| C-6 | **Reminder channel** | "Scheduled outcome review" / "reminder job" | DPR "reminders and outcome-review notifications" | In-app default (D-9), email deferred (OQ-8). |
| C-7 | **Deletion vs anonymization** | BR-014 "remove **or** anonymize … per the deletion policy" (policy not fixed) | DPR "allow users to delete" | Policy defaulted to hard-delete + optional anonymize (OQ-4); constraint on committed alternatives noted (04 §6). |
| C-8 | **`option_id` in AI schema vs `Alternative` entity** | — | DPR contract uses `option_id` | Kept `option_id` in the AI JSON contract (matches DPR) while the entity is `Alternative`; validator maps and checks references (06 §7). |

No conflict was resolved by discarding a requirement; each is reconciled and traceable.

## 5. Decisions Requiring Product-Owner Approval (sign-off list)

Before or during implementation, confirm: **OQ-1** (score scale), **OQ-3** (token storage/session), **OQ-4** (delete vs anonymize), **OQ-6** (quota/rate thresholds), **OQ-7** (admin data access), and **OQ-8** (email notifications). These have security, privacy, or scope implications. The remaining OQs can proceed on their interim defaults and be revisited without architectural change.

## 6. Explicitly Out-of-Scope Confirmations (to prevent scope drift)

Restating BRD out-of-scope so they are not accidentally added: payments/subscriptions; native mobile apps; public feed/community benchmarks; real-time collaboration; automatic real-world actions from AI; medical/legal/investment recommendations; voice/video analysis; custom ML models. Any request to add these is a post-MVP scope change requiring a new version entry (00 §5).
