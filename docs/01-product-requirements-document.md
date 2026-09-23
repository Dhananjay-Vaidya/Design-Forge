# 01 — Product Requirements Document (PRD)

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23 · **Status:** Ready for implementation
**Source of truth:** BRD v1.0 (scope) · DPR v1.0 (architecture/context). Additions here are tagged **[REC]**.

---

## 1. Executive Summary

DecisionForge AI is a decision-intelligence platform that helps an authenticated user structure an important decision, compare alternatives with transparent weighted scoring, obtain **deterministic** rankings, and optionally enrich the process with bounded Google Gemini analysis (clarifying questions, assumptions, risks, scenarios, devil's-advocate critique, executive summary). The user commits a final choice with rationale and confidence, then reviews the real outcome later, building a personal decision journal and calibration profile.

The defining principle is a hard separation between **numeric scoring (authoritative, always available)** and **AI advice (optional, advisory, validated)**. The product remains fully usable when Gemini is unavailable, which protects it from free-tier quota changes and model deprecation.

## 2. Problem Statement

Important decisions are scattered across notes, chats, and spreadsheets with no repeatable method (DPR §Problem). Conversational AI answers sound confident but are hard to audit, compare, or revisit. Most decision tools stop at a one-time weighted matrix and never measure whether the decision was actually good. There is no lightweight tool that combines **structured scoring + auditable AI critique + outcome tracking** in one workflow.

## 3. Product Vision

> Turn any hard decision into a transparent, repeatable, and reviewable process — where the math is deterministic and trustworthy, AI sharpens the thinking without hijacking it, and every decision can be revisited to learn whether the reasoning held.

## 4. Target Users

Individuals making consequential personal or professional decisions who value structure and hindsight over a black-box recommendation. Single-user, private decisions only in MVP (no collaboration — see §11).

## 5. User Personas

| Persona | Context | Typical decision | Primary value |
|---------|---------|------------------|---------------|
| **Student (Aditi)** | Comparing higher-education options under cost pressure | Country / university / course selection | Compare cost, fit, career prospects, and risk side by side |
| **Professional (Rahul)** | Career move with trade-offs | Job offer, role change, certification | Make trade-offs explicit and document assumptions for later |
| **Founder (Meera)** | Limited runway, many bets | Which idea/experiment to pursue | Challenge assumptions, prioritize evidence, surface risks |
| **Consumer (Sam)** | Infrequent high-value purchase | Large purchase or subscription | Compare options without losing personal priorities |
| **Operator (Dhananjay)** [REC] | Runs the deployment | Keep the platform healthy | Detect slow APIs, failed AI calls, delayed jobs |

## 6. Jobs To Be Done (JTBD)

- **JTBD-1** When I face a hard choice, help me **capture it** so I can work on it over time. (US-001)
- **JTBD-2** Help me **express what matters and how much**, so ranking reflects my priorities. (US-002)
- **JTBD-3** Help me **see what I've missed** before I trust a result. (US-003)
- **JTBD-4** Show me **why an option ranks first**, so the result is transparent. (US-004)
- **JTBD-5** Let me **compare best/likely/worst** so uncertainty is visible. (US-005)
- **JTBD-6** Let me **record my final reasoning** to revisit honestly later. (US-006)
- **JTBD-7** **Follow up** with me so I learn whether my assumptions were accurate. (US-007)
- **JTBD-8** As an operator, give me **health dashboards** to detect problems. (US-008)

## 7. User Journeys

### 7.1 Primary journey — structure → score → advise → commit → review (DPR §User journey)

1. Create a decision (title, category, deadline, context).
2. Add two or more alternatives.
3. Define criteria, assign weights, and score every alternative.
4. Review deterministic ranking and basic sensitivity.
5. Request AI review (questions, assumptions, risks, scenarios) — asynchronous.
6. Revise inputs; compare updated ranking with the previous snapshot.
7. Commit the final choice with confidence and rationale.
8. Receive a scheduled outcome review and rate the result.
9. Consult the calibration summary to learn recurring strengths/biases.

### 7.2 Degraded journey — Gemini unavailable (BR-011, NFR-003)

Steps 1–4, 7–9 function unchanged. At step 5 the user receives an actionable message (quota/unavailable) and continues; scoring, ranking, commitment, and review remain fully usable.

## 8. MVP Scope (BRD §Scope — In scope)

- Email + password authentication (register, sign in, sign out, refresh).
- Decision, alternative, and criterion management (CRUD).
- Weighted scoring matrix and deterministic ranking.
- Basic sensitivity indication when weights/scores change.
- Gemini clarification, assumptions, risks, scenarios, devil's-advocate.
- Decision snapshots and final-choice commitment.
- Scheduled outcome review.
- Personal dashboard and basic calibration summary.
- Docker-based local environment.
- Prometheus metrics and Grafana dashboards **after** functional MVP completion.

## 9. Post-MVP Scope (DPR §Differentiating features — "Later")

Advanced weighting methods; adaptive AI interview; multi-agent debate; probability/Monte-Carlo simulation; interactive sensitivity; decision version comparison UI; automated calibration coaching; collaborative decisions; anonymous community benchmarks; decision export enhancements.

## 10. Success Metrics (BRD §Success measures)

| Metric | MVP target | Traces to |
|--------|-----------|-----------|
| Decision setup completion | ≥ 70% of started test decisions reach a complete score matrix | Product |
| Core workflow reliability | All deterministic operations available when Gemini is down | BR-011, NFR-003 |
| AI response validity | ≥ 95% of accepted responses pass JSON schema without manual repair | BR-012, AC-006/007 |
| Performance | Non-AI API **P95 < 500 ms** in local reference env (excl. cold start) | NFR-004, AC-012 |
| Privacy | No Gemini key / private backend config in the frontend bundle | NFR-001, AC-012 |
| Observability | All critical API/AI/job flows expose documented metrics | FR-018, NFR-009 |

## 11. Explicitly Excluded Scope (BRD §Out of scope)

Payments/subscriptions; native mobile apps; public social feed or anonymous community benchmarks; real-time multi-user collaboration; automatic real-world actions from AI output; medical/legal/investment recommendations; voice/video analysis; a custom ML model.

## 12. Functional Requirements (verbatim IDs from BRD)

| ID | Capability | Requirement | Priority |
|----|-----------|-------------|----------|
| FR-001 | Account registration | Create an account with validated email and password | Must |
| FR-002 | Authentication | Sign in, sign out, refresh authentication securely | Must |
| FR-003 | Decision CRUD | Create, view, edit, archive, delete owned decisions | Must |
| FR-004 | Alternatives | Add, edit, reorder, remove two or more alternatives | Must |
| FR-005 | Criteria | Add criteria with name, description, weight, benefit/cost direction | Must |
| FR-006 | Score matrix | Score every alternative against every criterion with rationale | Must |
| FR-007 | Ranking | Calculate total normalized score; display ranked alternatives | Must |
| FR-008 | Sensitivity | Indicate whether small input changes may alter the leader | Should |
| FR-009 | AI analysis | Request structured clarification, assumptions, risks, scenarios | Must |
| FR-010 | Async status | Show queued/processing/completed/failed for AI jobs | Must |
| FR-011 | Quota response | Actionable feedback for exhausted/unavailable AI quota | Must |
| FR-012 | Snapshots | Store a snapshot for each AI run and final commitment | Must |
| FR-013 | Commit decision | Select final alternative; record confidence and rationale | Must |
| FR-014 | Outcome review | Schedule and submit outcome satisfaction and notes | Must |
| FR-015 | Dashboard | See active, completed, and pending-review decisions | Must |
| FR-016 | Calibration | Summarize predicted confidence vs recorded satisfaction | Should |
| FR-017 | Export | Export one decision as JSON or printable report | Could |
| FR-018 | Metrics | Expose Prometheus-compatible metrics | Must |

## 13. Non-Functional Requirements (verbatim IDs from BRD)

| ID | Area | Requirement |
|----|------|-------------|
| NFR-001 | Security | Gemini keys/backend secrets never shipped to the browser |
| NFR-002 | Authorization | Every object-level API action verifies ownership |
| NFR-003 | Availability | Core non-AI workflow operates during Gemini failure |
| NFR-004 | Performance | Non-AI API P95 < 500 ms in reference local environment |
| NFR-005 | Accessibility | Primary flows keyboard-operable, labelled controls, sufficient contrast |
| NFR-006 | Responsiveness | Desktop, tablet, mobile widths |
| NFR-007 | Maintainability | AI provider logic isolated behind an interface |
| NFR-008 | Testability | Business rules and AI schema validation have automated tests |
| NFR-009 | Observability | Requests, AI ops, jobs, DB dependencies measurable |
| NFR-010 | Privacy | Send only minimum required decision content to Gemini |
| NFR-011 | Resilience | Retries bounded, idempotent, limited to transient failures |
| NFR-012 | Portability | Full local stack starts via documented Docker Compose commands |

## 14. Business Rules (verbatim IDs from BRD)

| ID | Rule |
|----|------|
| BR-001 | A decision must have one owner. |
| BR-002 | A decision requires at least two alternatives before scoring. |
| BR-003 | A decision requires at least one active criterion. |
| BR-004 | Criterion weights must be positive and normalized to 100% for calculation. |
| BR-005 | Every alternative must have a score for every active criterion before final ranking. |
| BR-006 | The deterministic score is authoritative; AI cannot alter stored scores or weights. |
| BR-007 | An AI analysis belongs to an immutable decision snapshot. |
| BR-008 | Only the decision owner may read or change private decision data. |
| BR-009 | A user may commit only one active final choice per decision; prior commitments remain auditable. |
| BR-010 | A committed decision may schedule one or more outcome reviews. |
| BR-011 | Gemini failure must not prevent decision creation, scoring, ranking, or commitment. |
| BR-012 | All Gemini responses must pass backend schema validation before storage or display. |
| BR-013 | The system must enforce configurable per-user AI usage limits. |
| BR-014 | Deleting a decision must remove or anonymize dependent private data per the deletion policy. |
| BR-015 | Metric labels must not contain user IDs, decision IDs, prompts, or other high-cardinality private values. |

## 15. Dependencies

- **Google Gemini API** via a configurable backend adapter (Flash-class primary, Flash-Lite-class fallback). External, rate-limited, free-tier.
- **PostgreSQL, Redis** (broker/result + cache), **Celery** (async jobs), **Prometheus/Grafana + exporters**, **Docker Compose** runtime.
- Frontend depends on the backend REST API only; it never depends on Gemini directly (BR/constraint).

## 16. Assumptions (see 14 for the full register)

- Single-tenant, single-user-owned private decisions (no sharing in MVP).
- Score scale is a fixed integer range (default **1–10**) [REC — not fixed by BRD; see 14/OQ].
- Weights entered as positive numbers, normalized to 100% at calculation time (BR-004).
- Local reference environment is the performance baseline (NFR-004).

## 17. Constraints (BRD §Implementation constraints for Claude)

Read BRD + DPR completely before scaffolding; never substitute AI scores for the deterministic engine; never call Gemini from React; centralize model configuration; never silently swallow invalid model output or quota errors; do not add unapproved features before Must requirements pass; create migrations/tests/API docs alongside each feature; keep metric cardinality bounded and private data out of metrics.

## 18. Risks (DPR §Risks and mitigations)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Free-tier quota changes | AI temporarily unavailable | Configurable models, cache, quotas, non-AI fallback |
| Unreliable AI output | Broken UI / misleading insight | JSON Schema validation, bounded retries, advisory disclaimer |
| Scope expansion | MVP never completes | Lock MVP; defer collaboration/community |
| Sensitive user context | Privacy/trust risk | Data minimization, deletion controls, protected secrets |
| High-cardinality metrics | Prometheus storage growth | Normalize routes; prohibit entity IDs in labels |

## 19. Acceptance Criteria (verbatim IDs from BRD)

| ID | Acceptance criterion |
|----|---------------------|
| AC-001 | Authenticated user submits a valid decision → saved and returned only to its owner. |
| AC-002 | Fewer than two alternatives → ranking request rejected with field-level guidance. |
| AC-003 | Complete scores → ranking returns normalized totals in descending order, deterministically. |
| AC-004 | Incomplete scores → ranking identifies missing alternative-criterion cells. |
| AC-005 | AI analysis request accepted → returns a job id and does not block until Gemini completes. |
| AC-006 | Valid Gemini output → worker validates it; insights stored against the exact snapshot. |
| AC-007 | Invalid Gemini output → no invalid insight displayed; job records controlled failure or bounded retry. |
| AC-008 | Quota exhaustion → actionable message; scoring workflow remains usable. |
| AC-009 | User B requests user A data → 404/403 without leaking content. |
| AC-010 | Committed decision review date arrives → exactly one idempotent reminder job created. |
| AC-011 | Repeated identical AI input with a valid cache record → cached result returned, no provider call. |
| AC-012 | Prometheus scrape → request/latency/AI/job metrics available without private identifiers. |

## 20. Traceability (PRD → BRD)

Every functional and non-functional requirement, rule, story, and acceptance criterion in this PRD carries its **original BRD identifier** (sections 12–14, 19; §6 for US-*). Downstream documents trace to these IDs:

- SRS (02) — Requirement Traceability Matrix maps FR/BR/AC → use cases, validation, state, tests.
- Roadmap (12) — every story lists the FR/BR/AC it satisfies.
- Testing (10) — every acceptance criterion maps to at least one automated or documented test.

No BRD requirement is dropped; `14-assumptions-open-questions.md` lists the only interpretation gaps (score scale, snapshot granularity, calibration formula, entity naming).

---

## Appendix A — Glossary (domain terms, used package-wide)

| Term | Definition |
|------|-----------|
| **Decision** | The aggregate the user is analysing (title, context, category, deadline, status, owner). Root entity. |
| **Alternative** | A candidate choice being compared. **Synonym: "Option"** in BRD/DPR; "Alternative" is canonical in this package. |
| **Criterion** | An evaluation dimension with a name, weight, and direction (benefit or cost). |
| **Direction (benefit/cost)** | Benefit = higher score is better; cost = lower raw value is better (normalized accordingly). |
| **Weight** | Positive number expressing a criterion's importance; normalized to 100% at calculation (BR-004). |
| **AlternativeScore** | A user-entered score for one alternative on one criterion, with optional rationale. Synonym: "OptionScore". |
| **Deterministic ranking** | The authoritative, reproducible ordering computed purely from scores and weights (no AI). |
| **Sensitivity** | An indication of whether small changes to weights/scores could change the leader. |
| **Snapshot** | An immutable, versioned copy of the decision's inputs captured at an AI run or commitment (BR-007). |
| **AIAnalysisJob** | An async request to Gemini for one analysis type. Synonym: "AnalysisRun". |
| **AIAnalysisResult** | The validated, structured Gemini output stored against a snapshot. Synonym: "AIInsight". |
| **Scenario** | A best/likely/worst narrative for an alternative; may be persisted as a first-class record [REC]. |
| **Commitment** | The user's recorded final choice, confidence, and rationale (FR-013, BR-009). |
| **Outcome review** | A later evaluation of the real result (satisfaction + notes) used for calibration (FR-014). |
| **Calibration** | Summary comparing predicted confidence against recorded satisfaction (FR-016). |
| **AIUsageRecord** | Ledger row used to enforce per-user quotas without storing prompt text. Synonym: "UsageLedger". |
| **Circuit breaker** | A global switch that stops Gemini calls after sustained failures, returning fallback responses. |
| **Fallback response** | A safe, user-readable, non-AI result returned when Gemini is unavailable or invalid. |
| **Advisory disclaimer** | Standard notice that AI content is advisory and may be incomplete/inaccurate. |
| **Prompt version** | A stable identifier for the prompt template used, stored with each AI result for auditing. |
