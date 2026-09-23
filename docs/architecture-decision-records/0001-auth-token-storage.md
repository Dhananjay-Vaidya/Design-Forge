# ADR-0001: Auth token storage strategy

**Status:** Accepted
**Date:** 2026-09-23
**Resolves:** `docs/14-assumptions-open-questions.md` OQ-3

## Context

`docs/09-security-and-privacy.md` §5 recommends [REC] refresh token in an httpOnly/Secure/SameSite
cookie with the access token held in memory, over both-in-memory bearer tokens, but flags it for
product-owner confirmation (OQ-3). SEC-04 requires protecting auth tokens; ADR-06 in
`docs/03-system-architecture.md` calls for "JWT access + rotating refresh."

## Decision

- Access token: short-lived JWT (`JWT_ACCESS_TOKEN_LIFETIME_MINUTES`, default 15 min), returned in the
  login/refresh response body and held only in frontend memory (a Zustand store), never in
  `localStorage`/`sessionStorage`.
- Refresh token: longer-lived JWT (`JWT_REFRESH_TOKEN_LIFETIME_DAYS`, default 7 days), set as an
  httpOnly, `SameSite=Lax` cookie (`Secure` in any non-local environment, controlled by
  `JWT_REFRESH_COOKIE_SECURE`). Never exposed to JavaScript.
- `POST /auth/refresh` and `POST /auth/logout` are cookie-based and require the CSRF double-submit
  double-submit header (`X-CSRFToken`) since they are cookie-authenticated, state-changing requests.
  Bearer-authenticated endpoints (everything else) do not require CSRF, since they carry no
  ambient browser credential.
- `CORS_ALLOWED_ORIGINS` is an explicit allowlist (no wildcard) because credentials (cookies) are
  used for the refresh/logout endpoints.

## Consequences

- Reduces XSS token-theft blast radius (access token lives only in JS memory and expires quickly;
  refresh token is unreachable from JS).
- Requires CSRF handling on the two cookie-based endpoints only, keeping the rest of the API
  simple bearer-auth.
- Frontend must re-hydrate the access token on page load via a silent `POST /auth/refresh` call
  (cookie is sent automatically).
