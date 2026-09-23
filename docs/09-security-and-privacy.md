# 09 — Security & Privacy

**Product:** DecisionForge AI · **Version:** 1.0 · **Date:** 2026-09-23
Traces to BRD NFR-001/002/010, BR-008/014/015, DPR §Security and privacy. Additions tagged **[REC]**.

---

## 1. Threat Model

**Assets:** user credentials & tokens; private decision content; the Gemini API key & backend secrets; audit/usage data; the deterministic result integrity.

**Trust boundaries:** browser ↔ API (untrusted client); API ↔ Gemini (external, backend-only); API/worker ↔ DB/Redis (internal); operator ↔ ops surfaces.

| # | Threat (STRIDE) | Vector | Mitigation | Traces |
|---|-----------------|--------|-----------|--------|
| T1 | Spoofing | Stolen/forged token | Short-lived JWT, rotating refresh, HTTPS, revoke on logout | SEC-04 |
| T2 | Tampering | Client alters scores/ranking | Server recomputes ranking deterministically; client values never trusted | BR-006 |
| T3 | Repudiation | User denies an action | ActivityEvent audit + immutable snapshots | Audit, BR-007/009 |
| T4 | Info disclosure | Cross-user data access | Object-level ownership; 404 on non-owned | NFR-002, BR-008, AC-009 |
| T5 | Info disclosure | Key leaks to browser | Backend-only Gemini; key never in bundle | NFR-001, AC-012 |
| T6 | Info disclosure | PII sent to Gemini | Data minimization (no email/id) | NFR-010 |
| T7 | DoS / cost | AI abuse, request floods | Per-user quota, global circuit breaker, rate limits | BR-013 |
| T8 | Elevation | Injection (SQL/prompt) | ORM/parameterized queries; prompt-injection controls | SEC-09 |
| T9 | Info disclosure | Secrets/PII in logs or metrics | Log redaction; low-cardinality labels | SEC-08, BR-015 |

## 2. Authentication Strategy (FR-002)

- Email + password; passwords hashed with Django's default strong hasher (PBKDF2, or Argon2 [REC]) — never stored or logged in plaintext.
- JWT access token (short TTL) + rotating refresh token; logout revokes the refresh token (server-side deny-list or rotation invalidation).
- HTTPS everywhere in any non-local deployment (SEC-04).
- Login throttling to resist brute force (§6).

## 3. Authorization Rules (NFR-002, BR-008)

- Every object endpoint filters by `owner == request.user` **before** any read/write; nested resources verify the chain up to the owning decision.
- Cross-user access → **404** (not 403) to avoid existence leakage (AC-009). 403 only for authenticated-but-forbidden operations.
- Operator/admin has ops access (health, config) but **not** routine access to users' private decision content [REC policy — 14/OQ-7].
- Permissions are centralized in a reusable DRF permission/queryset mixin so no endpoint can forget the check (tested for isolation — see 10).

## 4. Password Security

- Strength policy: min length + complexity (VLD-02); reject common/breached passwords [REC via a local list].
- Hash with per-user salt (framework default); configurable work factor.
- Password change/reset invalidates existing refresh tokens [REC].

## 5. Token Storage (SEC-04, OQ-3)

- **Recommended [REC]:** refresh token in an **httpOnly, Secure, SameSite** cookie; access token in memory (not localStorage) to reduce XSS token theft. This choice interacts with CSRF (§6) and is flagged for product-owner confirmation in `14-assumptions-open-questions.md` (OQ-3).
- Alternative (simpler, weaker): both tokens in memory with silent refresh; acceptable for a portfolio demo but documented as a trade-off.
- Never store tokens where third-party scripts can read them; the app ships no third-party analytics that could exfiltrate tokens.

## 6. CSRF and CORS

- **CORS:** allow only the known frontend origin(s) via env `CORS_ALLOWED_ORIGINS`; no wildcard with credentials.
- **CSRF:** if refresh uses cookies (§5), enforce CSRF protection (double-submit token or Django CSRF) on state-changing requests; if pure bearer-in-memory, CSRF risk is minimal but CORS still locked down.
- **Rate limiting:** per-IP and per-user throttles on auth and write endpoints (DRF throttling); AI additionally quota-limited (BR-013). Thresholds are [REC] — 14/OQ-6.

## 7. Input Validation (SEC-05)

- All input validated at the serializer layer (types, ranges, enums) mirroring SRS VLD-*; reject unknown fields.
- Enforce max lengths/list sizes to bound payloads (also limits prompt size).
- Use the ORM / parameterized queries exclusively — no string-built SQL (prevents SQLi).

## 8. Secret Management (SEC-03)

- Secrets only via environment variables / a secrets manager; never committed. Repository ships `.env.example` with **names only**, no values.
- `.env` is git-ignored; CI has its own secret store.
- Required secrets: `GEMINI_API_KEY`, `DJANGO_SECRET_KEY`, DB creds, Redis creds (if any), Grafana admin creds.

## 9. API-Key Protection (NFR-001, AC-012)

- `GEMINI_API_KEY` is read only by the backend adapter; it is never sent to the client, embedded in the SPA build, or returned by any endpoint.
- **Build-time guard [REC]:** a CI check greps the built frontend bundle for the key name/patterns and known secret prefixes; the build fails if any secret is present (directly supports AC-012 / the DoD "no secrets in the frontend bundle").
- The SPA has no code path that calls Gemini (enforced by architecture, ADR-02/03).

## 10. Logging Redaction (SEC-08, BR-015)

- A logging filter redacts secrets, tokens, passwords, and the Gemini key from all log records.
- Logs minimize personal content; they may include a `request_id` correlation id but not decision content or prompts.
- Exceptions are logged with stack traces server-side only, never returned to clients (500 → generic message + request_id).
- Metrics carry no private/high-cardinality labels (BR-015 / OBS-03).

## 11. Prompt-Injection Risk (SEC-09)

- Treat all decision text as **data, not instructions**; the system prompt states context is to be analyzed, not obeyed (see `06-gemini-integration-design.md` §10).
- Output is validated against strict JSON Schema and referential checks; it can never introduce new fields, execute actions, or alter scores (BR-006).
- AI text is rendered as **escaped plain text** in the UI (no `dangerouslySetInnerHTML`), preventing stored-XSS via model output.
- List sizes/string lengths are capped to bound injected content.

## 12. Dependency Security

- Pin dependencies; use lockfiles (`package-lock.json`/`poetry.lock` or `requirements.txt` hashes).
- CI runs `pip-audit`/`npm audit` (or Dependabot [REC]); fail on high-severity known vulns.
- Regular base-image updates (§13).

## 13. Container Security

- Minimal base images (slim/alpine where practical); run as a **non-root** user.
- Only required ports exposed; `/metrics`, DB, Redis, exporters not published to the public internet (network policy / internal Compose network).
- No secrets baked into images; inject at runtime via env.
- Multi-stage frontend build so source/dev tooling isn't shipped; the served bundle contains no secrets (§9).
- Pin image tags/digests; scan images in CI [REC].

## 14. PostgreSQL Security

- Least-privilege DB user for the app (no superuser); separate credentials per environment.
- Not exposed publicly; reachable only on the internal network.
- TLS to the DB in non-local deployments [REC].
- Backups encrypted at rest [REC]; restore tested (§15).

## 15. Backup Considerations

- **MVP/local:** documented `pg_dump`/`pg_restore` procedure in the runbook (11 §Backup and restore).
- **Production path [REC]:** scheduled encrypted backups, retention policy, periodic restore drills.
- Backups exclude secrets (they're env-provided, not in the DB) and are access-controlled.

## 16. User-Data Export and Deletion (SEC-07, BR-014)

- **Export:** `GET /decisions/{id}/export` (JSON/printable) — owner's data only, no secrets (FR-017).
- **Deletion:** deleting a decision removes/anonymizes dependent private data per policy (BR-014, see 04 §6); account deletion removes/anonymizes user data (DPR). The delete/anonymize choice is confirmed in 14/OQ-4.
- Deletion is audited (ActivityEvent) without retaining the deleted private payload.

## 17. Security Test Checklist (feeds `10-testing-strategy.md`)

- [ ] Cross-user access to every nested resource returns 404, no content leak (AC-009).
- [ ] No endpoint returns another user's data via filtering/sorting/pagination.
- [ ] JWT expiry/refresh/rotation and logout revocation behave correctly.
- [ ] Login/write endpoints throttle under burst.
- [ ] AI quota enforced; over-quota returns 429 and scoring still works (AC-008).
- [ ] Frontend bundle contains no secrets/API key (AC-012 build guard).
- [ ] Logs contain no secrets/tokens/prompts (redaction filter).
- [ ] Metrics contain no IDs/emails/prompts/raw URLs (BR-015).
- [ ] AI input builder excludes email/id/unrelated profile data (NFR-010).
- [ ] Invalid Gemini output is discarded; nothing invalid rendered (AC-007).
- [ ] AI output rendered escaped (no XSS via model text).
- [ ] SQL is parameterized (no injection); serializers reject unknown fields.
- [ ] Containers run non-root; internal ports not publicly exposed.
- [ ] Dependency audit passes (no high-severity vulns).
- [ ] Data export/deletion works and leaves no orphaned private data (BR-014).
