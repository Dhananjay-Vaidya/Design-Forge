# AI Capability Expansion Status (AX-*)

Tracks the build of the AI Capability Expansion plan ("doc 18", supplied by the product owner and not stored in
this repo): "AI proposes, the deterministic engine disposes". "Verified" means the
listed command or check was actually run and passed.

## Scope and approvals

| Item | Status |
|------|--------|
| Tier 1 (framework, guardrails, budget, AX-01, AX-07, AX-08, AX-09) | In scope. Built across phases 1 and 2 |
| Tier 2 (pgvector, embeddings, tool-use, RAG, AX-12/13/14) | **Not built: needs a recorded approval** for the `pgvector` extension, an embedding model and its cost |
| Tier 3 (AX-04 draft scores, AX-15 ingestion, AX-10 bias scan, AX-03, AX-16/17) | **Not built: needs approval and extra guardrails** |

## Dependencies on earlier work

AX-08 (brief after commit) and AX-09 (outcome coach) need commitments and outcome reviews, which did not exist; they
were built first as FX Phase C (`FEATURE_EXPANSION_STATUS.md`).

## Deviations from the plan (and why)

| Plan | Reality | Decision |
|------|---------|----------|
| `POST /decisions/{id}/ai/{action}` queues a job and returns `job_id` | Actions run inside the request and return the proposal | Simpler to test and reason about; the proposal id replaces `job_id`; `QUEUED` stays in the status set for a future async runner |
| Invalid output → `FAILED` job | `200 {status: "FAILED", failure_code}`, nothing stored, quota refunded | Matches doc 05 API-AI invalid-output behaviour (AC-007) |
| Per-action budgets | One shared daily counter (chat + actions), one unit per uncached model call, cache hits free | Reuses the existing, tested BR-013 mechanism; revisit if actions need different weights |
| Metric `ai_proposal_acceptance_total` | Per-item outcomes (accepted / rejected / failed) | Acceptance rate is only meaningful per item |

## Phases

| Phase | Scope | Status |
|-------|-------|--------|
| 1 | AX-INF-1 action framework, AX-INF-6 guardrails, AX-INF-8 budget (backend) | **Verified** (backend) |
| 2 | AX-01 conversational setup, AX-07 devil's advocate, AX-08 brief, AX-09 outcome coach, proposal-review UI, budget meter | Not started |
| 3 | Memory and RAG | **Blocked on approval** |
| 4 | AX-04, AX-15, AX-10 | **Blocked on approval** |

## Phase 1 — Framework

- **Backend:** migration `a6b7c8d9e0f1` (`ai_proposals`); `app/ai/actions.py` (registry, `AIAction`, standard payload
  shapes), `app/ai/runner.py` (the one pipeline), `app/ai/guardrails.py`, `ai_proposal_service`; API-55..60;
  provider `json_mode`; metrics `ai_proposals_total`, `ai_proposal_acceptance_total`, `ai_injection_flags_total`,
  `ai_schema_failures_total`. No capability is registered yet, so this phase adds no user-visible feature; the
  proposal-review UI and meter ship with the first capabilities in phase 2.
- **Verified:** backend 398 tests (56 new: 30 in `test_ai_actions.py`, 26 in `test_guardrails.py`), ruff, format,
  mypy, `alembic check` clean; OpenAPI snapshot regenerated.
- **Bugs found by that verification and fixed:** the markup stripper also deleted comparisons such as
  "salary < 50k and growth > 10%" (now strips tag-shaped text only); a failed item during accept left the session
  expired and crashed the next step (reload after rollback); the stored reason for a failed item was the generic
  "One or more fields are invalid" instead of the specific field message.
- **Gemini-OFF:** every action returns `503` with a plain explanation and costs nothing; the rest of the app is
  unaffected (tested).
