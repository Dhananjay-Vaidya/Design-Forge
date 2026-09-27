# 06 — Gemini Integration Design

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
**Principle:** Gemini is an **optional, bounded, advisory** service. It never computes the ranking (BR-006, BR-011). Traces to BRD §AI requirements + DPR §Gemini usage strategy / Free tier safeguards. Additions tagged **[REC]**.

---

## 0. Implementation status (2026-09-27)

**Built: the "Ask AI" decision assistant** (a conversational use case added alongside §1). The six
structured analyses in §1 are still to do.

| Concern | Implementation |
|---------|----------------|
| Endpoints | `GET /api/v1/ai/status` (enabled, model, daily limit, remaining). `POST /api/v1/decisions/{id}/chat`: body `{messages:[{role:"user"\|"assistant", content≤2000}]}` (≤20, last must be `user`); response is Server-Sent Events `delta*` then `done` (`model`, `remaining_today`, `disclaimer`), or `error` if the provider fails after text started. |
| Adapter (§2) | `backend/app/ai/provider.py`: `GeminiChatProvider` (only importer of `google-genai`) and `FakeChatProvider` for tests, injected via the `get_chat_provider` dependency. |
| Models (§3) | `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite`. `gemini-2.5-flash` returns 404 "no longer available to new users" for new keys. Gemini 3 models run with `thinking_level=low` and a 4096-token output budget (a 1024 budget let reasoning consume it and produced empty answers). |
| Minimisation (§5) | `backend/app/ai/context.py`: decision title/context/category/deadline, option names and notes, active criteria (share %, direction), scores by name, deterministic ranking summary. No user id, email or database ids (tested). |
| Prompt injection (§10) | Decision data sits in a delimited `<decision_data>` block that the system instruction declares to be data, not instructions. The UI renders AI text as plain text (no HTML/markdown renderer). |
| Retries/fallback (§12, §17) | Transient failures (5xx, network, retired model 404) before the first token get one attempt on the fallback model. 429 is not retried and maps to `429 rate_limited`. A stream that ends with no text is a failure, never an empty "success". |
| Quota (§13) | Redis counter per user per UTC day (`GEMINI_DAILY_USER_QUOTA`), counts only, no prompt text. Failed requests are refunded. Over limit → `429 quota_exhausted` with `retry_after_seconds` to midnight UTC. |
| Circuit breaker (§14) | Redis: `GEMINI_BREAKER_FAILURE_THRESHOLD` failures within `GEMINI_BREAKER_WINDOW_SECONDS` open it for `GEMINI_BREAKER_COOLDOWN_SECONDS`; while open, requests get `503` without calling the provider. |
| Caching (§15) | Not applied to chat: answers depend on the whole conversation. |
| Metrics (§18) | `decisionforge_ai_requests_total{provider,analysis_type="chat",status}`, request duration, rate-limit, quota-rejection, fallback, token-usage and circuit-breaker series. |
| Storage | Conversations are not stored server-side; the browser keeps them per decision until reload. |
| Tests (§19) | `backend/tests/api/test_ai_chat.py`, `backend/tests/unit/test_ai_provider.py`, `frontend/tests/components/AssistantText.test.tsx`; all use the fake provider, so no quota is consumed. |

## 1. AI Use Cases (DPR §Gemini usage strategy)

| Analysis type | Output | Control |
|---------------|--------|---------|
| `clarify` | 5–8 targeted questions | One generation per decision version |
| `assumptions` | Structured assumption list with confidence | Cache by content hash |
| `risks` | Risk, likelihood, impact, mitigation | Strict JSON schema |
| `scenarios` | Best / likely / worst per alternative | Short output limits |
| `devils_advocate` | Challenges to the leading option | User-triggered only |
| `summary` | Concise final narrative | Generated after commit |

All six are advisory; the deterministic ranking is computed independently and is authoritative.

## 2. Gemini Adapter Interface (NFR-007, AIR-01)

A single backend service isolates all provider concerns. Conceptual interface (language-agnostic; no code emitted here per task rules):

- `analyze(analysis_type, decision_input, *, options) -> AIResult`
  - Builds the minimized input (NFR-010), selects prompt template + version, calls the provider with a JSON-schema-constrained request, validates, and returns a typed result **or** raises a typed error (`QuotaError`, `TransientError`, `InvalidOutputError`, `UnavailableError`).
- `AIResult`: `{ analysis_type, payload (validated), model, prompt_version, cache_status, latency_ms, input_tokens?, output_tokens?, disclaimer }`.
- The interface is provider-agnostic so Gemini can be swapped/mocked (testing, NFR-007/008). Only this module imports the Google Gen AI SDK.

## 3. Model Configuration (AIR-01)

- `GEMINI_API_KEY` — secret, backend-only, never in the browser (NFR-001).
- `GEMINI_MODEL` — primary Flash-class model (configurable; not hardcoded across the codebase).
- `GEMINI_FALLBACK_MODEL` [REC] — Flash-Lite-class for extraction/low-cost tasks (DPR).
- `GEMINI_TIMEOUT_SECONDS`, `GEMINI_MAX_RETRIES`, `GEMINI_DAILY_USER_QUOTA`, `GEMINI_CACHE_TTL_SECONDS`, `GEMINI_BREAKER_*` — all env-driven.
- Rationale: free-tier models/limits change (DPR), so model choice must be a config value, resolved once in the adapter.

## 4. Prompt-Template Structure (AIR-02)

Each analysis type has a stable, versioned template with three parts:

1. **System instruction** — role, that output must be JSON matching the provided schema, and that it is advisory.
2. **Task instruction** — analysis-type-specific ask (e.g., "identify 5–8 clarifying questions").
3. **Structured context** — the **minimized** decision input (see §5), with alternative IDs so outputs can reference them.

Templates carry a `prompt_version` (e.g., `risks.v1`) stored with every job/result for auditability and cache keying. Changing a template bumps the version (and therefore invalidates its cache entries).

## 5. Input Minimization (NFR-010, AIR-04)

The adapter builds a whitelist-only payload. **Included:** decision title, context, category; alternatives (id, name, description); active criteria (name, weight, direction); scores (alternative_id, criterion_id, score); optional deterministic ranking summary. **Excluded (never sent):** user email, user id, auth tokens, unrelated profile data, internal secrets. A dedicated input builder is unit-tested (VLD-14) to assert forbidden fields are absent.

## 6. Privacy Controls

- Data minimization (§5); no identifiers/email (SEC-06).
- No prompt text stored in the usage ledger (BR-013 data reqs); only counts/tokens.
- Results store the validated payload + provider metadata only, never secrets (BRD data reqs).
- Advisory disclaimer stored and displayed with every result (§ end).

## 7. JSON Schema Outputs (BR-012, AIR-03)

The provider is asked for structured JSON; the backend **re-validates** (never trusts the model) against explicit schemas: types, enums, max list sizes, and that any `alternative_id` references an alternative in the snapshot. Below are the six response schemas (JSON Schema draft-2020-12, abbreviated).

### 7.1 Clarifying questions
```json
{
  "type": "object",
  "required": ["questions", "disclaimer"],
  "additionalProperties": false,
  "properties": {
    "questions": {
      "type": "array", "minItems": 5, "maxItems": 8,
      "items": { "type": "object", "required": ["question", "reason"], "additionalProperties": false,
        "properties": { "question": {"type": "string", "maxLength": 300},
                        "reason": {"type": "string", "maxLength": 300} } }
    },
    "disclaimer": { "type": "string" }
  }
}
```

### 7.2 Assumption analysis
```json
{
  "type": "object", "required": ["assumptions", "disclaimer"], "additionalProperties": false,
  "properties": {
    "assumptions": { "type": "array", "maxItems": 12,
      "items": { "type": "object", "required": ["text", "confidence"], "additionalProperties": false,
        "properties": { "text": {"type": "string", "maxLength": 300},
                        "confidence": {"enum": ["low", "medium", "high"]} } } },
    "disclaimer": {"type": "string"}
  }
}
```

### 7.3 Risk analysis
```json
{
  "type": "object", "required": ["risks", "disclaimer"], "additionalProperties": false,
  "properties": {
    "risks": { "type": "array", "maxItems": 20,
      "items": { "type": "object",
        "required": ["option_id", "risk", "likelihood", "impact", "mitigation"], "additionalProperties": false,
        "properties": {
          "option_id": {"type": "string", "format": "uuid"},
          "risk": {"type": "string", "maxLength": 300},
          "likelihood": {"type": "integer", "minimum": 1, "maximum": 5},
          "impact": {"type": "integer", "minimum": 1, "maximum": 5},
          "mitigation": {"type": "string", "maxLength": 300} } } },
    "disclaimer": {"type": "string"}
  }
}
```
`option_id` = `alternative_id` (naming synonym); the validator confirms each references a snapshot alternative.

### 7.4 Scenario analysis
```json
{
  "type": "object", "required": ["scenarios", "disclaimer"], "additionalProperties": false,
  "properties": {
    "scenarios": { "type": "array", "maxItems": 30,
      "items": { "type": "object", "required": ["option_id", "type", "narrative"], "additionalProperties": false,
        "properties": {
          "option_id": {"type": "string", "format": "uuid"},
          "type": {"enum": ["best", "likely", "worst"]},
          "narrative": {"type": "string", "maxLength": 600} } } },
    "disclaimer": {"type": "string"}
  }
}
```

### 7.5 Devil's-advocate analysis
```json
{
  "type": "object", "required": ["leading_option_id", "challenges", "disclaimer"], "additionalProperties": false,
  "properties": {
    "leading_option_id": {"type": "string", "format": "uuid"},
    "challenges": { "type": "array", "minItems": 1, "maxItems": 10,
      "items": { "type": "object", "required": ["challenge", "why_it_matters"], "additionalProperties": false,
        "properties": { "challenge": {"type": "string", "maxLength": 300},
                        "why_it_matters": {"type": "string", "maxLength": 300} } } },
    "disclaimer": {"type": "string"}
  }
}
```

### 7.6 Decision executive summary
```json
{
  "type": "object", "required": ["summary", "key_tradeoffs", "disclaimer"], "additionalProperties": false,
  "properties": {
    "summary": {"type": "string", "maxLength": 1200},
    "key_tradeoffs": { "type": "array", "maxItems": 8, "items": {"type": "string", "maxLength": 240} },
    "disclaimer": {"type": "string"}
  }
}
```

## 8. Example Request & Response Contracts

**Backend → Gemini (conceptual request):** system+task instruction, minimized context (§5), and a `response_schema` (the matching schema above) requesting JSON output.

**Gemini → Backend (raw, then validated):** the model returns JSON; the adapter parses, validates against the schema, checks `option_id` references, then wraps as `AIResult`. Example validated `risks` payload is shown in `05-api-specification.md` API-28.

**Combined provider contract (all-in-one reference from DPR):**
```json
{
  "summary": "string",
  "questions": [{"question": "string", "reason": "string"}],
  "assumptions": [{"text": "string", "confidence": "low|medium|high"}],
  "risks": [{"option_id": "uuid", "risk": "string", "likelihood": 1, "impact": 1, "mitigation": "string"}],
  "scenarios": [{"option_id": "uuid", "type": "best|likely|worst", "narrative": "string"}],
  "disclaimer": "Advisory analysis only; the user remains responsible for the decision."
}
```
Per analysis type we request only the relevant sub-schema (§7) rather than the whole object, to keep outputs small (DPR "short output limits").

## 9. Server-Side Validation (BR-012, AC-007)

1. Parse JSON (reject non-JSON → invalid).
2. Validate against the type's JSON Schema (types, enums, min/max list sizes, string lengths).
3. Referential check: every `option_id` exists among the snapshot's alternatives.
4. On any failure → `InvalidOutputError`; the job records `failure_code=schema_invalid`; nothing is displayed (AC-007). On success → persist `AIAnalysisResult` against the snapshot (AC-006).

## 10. Prompt-Injection Considerations (SEC-09)

- Decision text is **user-authored data**, not instructions; it is placed in a clearly delimited context block, and the system instruction states that context is data to analyze, not commands.
- Output is never executed or used to mutate state; it is validated and stored as advisory content only (BR-006).
- The referential + schema validation prevents injected content from introducing unexpected fields or fake alternative references.
- Rendered AI text is treated as untrusted in the UI (escaped; no HTML injection) — see `09-security-and-privacy.md`.

## 11. Timeout Strategy

- Per-call timeout `GEMINI_TIMEOUT_SECONDS` (e.g., 20s). A timeout is a **transient** error → eligible for bounded retry (§12). The request path never waits (calls run in Celery, AC-005).

## 12. Retry Strategy, Backoff, 429 Handling (NFR-011, AIR-10)

- Retry **only transient** failures: timeouts, 5xx, and 429.
- Bounded by `GEMINI_MAX_RETRIES` (e.g., 3).
- **Exponential backoff + jitter** between attempts.
- **HTTP 429:** honor provider `Retry-After` if present; surface a friendly retry time to the user; **never loop continuously** (DPR safeguard). If retries exhaust on 429 → treat as quota/unavailable, return fallback, trip breaker on sustained failure.
- Non-transient errors (schema invalid, 4xx other than 429) are **not** retried.

## 13. Quota Tracking & Per-User Daily Limits (BR-013, AIR-08)

- Each accepted analysis increments `AIUsageRecord (user, date, operation)`.
- Before enqueue, the API checks the user's daily count against `GEMINI_DAILY_USER_QUOTA`; over limit → `429 quota_exhausted` with actionable message; scoring remains usable (AC-008).
- Ledger stores counts/tokens only — **no prompt text** (privacy).

## 14. Global Circuit Breaker (AIR-08)

- State (closed/open/half-open) stored in Redis, keyed globally.
- Opens after a configured count/rate of sustained provider failures within a window; while open, new AI requests short-circuit to a fallback response (no provider call) and emit a metric.
- Half-open after a cooldown: a limited trial call determines whether to close or re-open.
- Protects free-tier budget and prevents cascading failures (DPR safeguard).

## 15. Caching (AC-011, AIR-09)

- **Key:** `hash(normalized_input + prompt_version + model)`.
- **Store:** Redis with TTL `GEMINI_CACHE_TTL_SECONDS`.
- On request, the worker checks the cache first; a hit returns the stored validated result with `cache_status=hit` and **no provider call** (AC-011). Misses populate the cache after successful validation.
- Prompt-version/model are part of the key, so template or model changes naturally miss stale entries.

## 16. Result Deduplication

- Identical input + prompt_version + model within TTL → served from cache (§15).
- Optional `Idempotency-Key` (API-27) collapses duplicate submissions to one job [REC].

## 17. Fallback Behavior (BR-011, NFR-003, AIR-07)

When quota is exhausted, the breaker is open, retries are exhausted, or output is invalid, the system returns a **safe fallback**: a user-readable message that AI insight is unavailable right now, the deterministic results remain valid, and (where useful) generic non-AI guidance. A metric is recorded. The deterministic workflow is never blocked.

## 18. Logging & Metrics (AIR-05, OBS)

Adapter records per call: status, latency, model, prompt_version, cache_status, token usage (when available). Emits metrics: `decisionforge_ai_requests_total{operation,model,result}`, `..._ai_request_duration_seconds`, `..._ai_quota_rejections_total`, `..._ai_cache_hits_total`, plus error-by-category (see `08-prometheus-grafana-observability.md`). Logs exclude prompts, keys, and personal content (SEC-08).

## 19. Testing Gemini Without Consuming Quota (NFR-008, links to 10)

- **Adapter fake/mock:** a `FakeGeminiClient` returns canned valid/invalid payloads per type; the real SDK client is only wired in when `GEMINI_API_KEY` is set and tests aren't running.
- **Schema fixtures:** golden valid and deliberately invalid JSON per analysis type to test validation and AC-007 recovery.
- **No network in tests:** provider calls are patched; contract tests assert the request builder (minimization, schema, model selection) without hitting Google.
- **Cache/quota/breaker** tested with the fake by simulating hits, 429s, and sustained failures.
- Load tests exercise the adapter with the fake so no paid/free quota is consumed (DPR testing strategy).

## 20. Example Advisory Disclaimer

> "Advisory analysis only; the user remains responsible for the decision. AI insights may be incomplete or inaccurate and do not change your calculated scores."

Stored on every `AIAnalysisResult` and shown wherever AI content appears, visually distinct from deterministic results (AIR-06).
