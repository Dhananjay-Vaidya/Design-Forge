# 00 — Document Index

**Project:** DecisionForge AI
**Package:** Technical Documentation (implementation-ready)
**Version:** 1.0
**Date:** 23 September 2026
**Owner:** Dhananjay Vaidya

---

## 1. Purpose

This directory is the complete technical documentation package for **DecisionForge AI**, a decision-intelligence platform that turns an uncertain decision into a structured, deterministic, reviewable process, with Google Gemini as an optional advisory layer. The package is written to be sufficient for implementation, demonstration, and technical interviews. No application code is produced in this package.

## 2. Document List and Purpose

| File | Title | Purpose |
|------|-------|---------|
| `00-document-index.md` | Document Index | This file. Navigation, reading order, source-of-truth hierarchy, versioning policy. |
| `01-product-requirements-document.md` | Product Requirements (PRD) | Why the product exists, who it serves, scope boundaries, functional/non-functional requirements, success metrics, traceability to BRD IDs. |
| `02-software-requirements-specification.md` | Software Requirements (SRS) | Precise, testable system behavior: actors, use cases, validation, state machines, errors, jobs, AI/monitoring/security requirements, RTM. |
| `03-system-architecture.md` | System Architecture | Container and module architecture, all major flows, Mermaid diagrams, architectural decisions and trade-offs, scaling and deployment topology. |
| `04-database-design.md` | Database Design | Entities, ERD, columns, types, keys, constraints, indexes, deletion behavior, JSONB justification, Django relationships, migration and seed strategy. |
| `05-api-specification.md` | API Specification | REST conventions, versioning, auth, pagination, error envelope, idempotency, full endpoint catalogue with request/response examples. |
| `06-gemini-integration-design.md` | Gemini Integration Design | Adapter interface, prompt templates, JSON Schemas, privacy, retry/backoff/circuit-breaker, quota, caching, fallback, testing without quota. |
| `07-frontend-ux-specification.md` | Frontend & UX Spec | Route map, component hierarchy, per-page requirements, states, accessibility, design tokens, dark mode, keyboard and mobile behavior. |
| `08-prometheus-grafana-observability.md` | Observability | Metric catalogue and naming, labels/cardinality rules, recording and alert rules, Grafana dashboards, PromQL, troubleshooting. |
| `09-security-and-privacy.md` | Security & Privacy | Threat model, authn/authz, secret and API-key protection, redaction, prompt-injection, container/DB security, data export/deletion, test checklist. |
| `10-testing-strategy.md` | Testing Strategy | Testing pyramid, per-layer test plans, Gemini-without-quota strategy, fixtures, mocking, coverage targets, release checklist. |
| `11-devops-deployment-runbook.md` | DevOps & Runbook | Prerequisites, env vars, Compose services, startup, migrations, seeding, admin creation, backups, troubleshooting, production hardening. |
| `12-implementation-roadmap.md` | Implementation Roadmap | Epics, stories (with IDs, value, acceptance criteria, complexity), dependencies, phases, milestones, DoR/DoD. |
| `13-claude-code-execution-plan.md` | Claude Code Execution Plan | Repo creation order, file plan, phase instructions, per-phase verification commands, commit checkpoints, hard rules. |
| `14-assumptions-open-questions.md` | Assumptions & Open Questions | Confirmed assumptions, unresolved questions, recommended defaults, source-document conflicts, product-owner decisions. |

## 3. Recommended Reading Order

**For a product/business reviewer:** 01 → 14 → 12.

**For an implementing engineer (or Claude Code):** 00 → 14 → 03 → 04 → 05 → 06 → 09 → 07 → 08 → 10 → 11 → 13 → 12.

**For an interviewer/demo audience:** 01 (vision + metrics) → 03 (architecture + diagrams) → 06 (AI design) → 08 (observability).

The SRS (02) is the reference spec cross-cut by all others; read it alongside whichever area you implement.

## 4. Source-of-Truth Hierarchy

When two artefacts disagree, the higher entry wins. Conflicts are never silently resolved; each is logged in `14-assumptions-open-questions.md`.

1. **Business Requirements Document (BRD) v1.0** — authoritative for **scope and business requirements** (BR-*, FR-*, NFR-*, AC-*, US-*).
2. **Detailed Project Report (DPR) v1.0** — authoritative for **architecture, implementation guidance, Gemini integration, monitoring, product context**.
3. **This documentation package** — elaborates 1 and 2 into implementation-ready detail. Any requirement introduced here that is not traceable to the BRD/DPR is explicitly tagged **[REC]** (recommendation) and must not be treated as approved scope until confirmed.
4. **Inline code comments / future ADRs** — lowest; must conform upward.

**Non-negotiable invariants inherited from the sources** (repeated in each relevant doc):

- The deterministic scoring engine must function fully without Gemini (BR-006, BR-011, NFR-003).
- Gemini is advisory; it never alters stored scores, weights, or the ranking (BR-006).
- The Gemini API key must never reach the browser (NFR-001).
- The Gemini model is environment-configurable (AI requirements).
- Prometheus + Grafana observability is mandatory (FR-018, NFR-009).
- The full stack must run locally via Docker Compose (NFR-012).
- Metric labels must exclude high-cardinality private values (BR-015, NFR-009).

## 5. Document Versioning Policy

- **Scheme:** Semantic-style `MAJOR.MINOR` per document, tracked in each file header and in the changelog table below.
  - **MAJOR** — a change that alters scope, a requirement's meaning, an interface contract, or a data model in a backward-incompatible way.
  - **MINOR** — clarifications, added examples, editorial fixes, new non-breaking detail.
- **Requirement IDs are immutable.** An ID (e.g., `FR-009`) is never reused or renumbered. A withdrawn requirement is marked `DEPRECATED` with the superseding ID, never deleted.
- **Change control:** every MAJOR change to any document must add a row to that document's changelog and, if it affects scope, a corresponding entry in `14-assumptions-open-questions.md`.
- **Traceability:** cross-document references use IDs, not page/line numbers, so documents can evolve independently.

### Package Changelog

| Version | Date | Author | Summary |
|---------|------|--------|---------|
| 1.0 | 2026-09-23 | Dhananjay Vaidya | Initial complete package derived from BRD v1.0 and DPR v1.0. |

## 6. Requirement ID Namespaces (used across the package)

| Prefix | Meaning | Defined in |
|--------|---------|------------|
| `BR-*` | Business rule | BRD (source) |
| `FR-*` | Functional requirement | BRD (source) |
| `NFR-*` | Non-functional requirement | BRD (source) |
| `AC-*` | Acceptance criterion | BRD (source) |
| `US-*` | User story | BRD (source) |
| `UC-*` | Use case | SRS (02) |
| `VLD-*` | Validation rule | SRS (02) |
| `STT-*` | State transition | SRS (02) |
| `ERR-*` | Error condition | SRS (02) |
| `AIR-*` | AI-specific requirement | SRS (02) / Gemini (06) |
| `OBS-*` | Observability requirement/metric | SRS (02) / Observability (08) |
| `SEC-*` | Security/privacy requirement | SRS (02) / Security (09) |
| `API-*` | API endpoint | API Spec (05) |
| `EP-*` / `DF-S-*` | Epic / story | Roadmap (12) |
| `REC-*` | Recommendation beyond BRD/DPR | Any doc; consolidated in 14 |

## 7. Glossary Pointer

Domain terms (Alternative, Criterion, Snapshot, Calibration, Sensitivity, Circuit breaker, etc.) are defined in the Glossary at the end of `01-product-requirements-document.md` and referenced throughout.
