# ADR: FastAPI authentication strategy

**Status:** Accepted
**Date:** 2026-09-23
**Supersedes (mechanism only, not the token-storage decision itself):**
`docs/architecture-decision-records/0001-auth-token-storage.md`

## Context

ADR-0001 already fixed the token-storage *policy* for this product: short-lived JWT access token
kept in frontend memory, longer-lived rotating refresh token in an httpOnly `SameSite=Lax` cookie,
with CSRF double-submit protection on the two cookie-authenticated endpoints (`/auth/refresh`,
`/auth/logout`). That policy is **not changing** in the FastAPI migration — verified via
`docs/fastapi-migration-audit.md` §6 that the frontend's `axios` client already hard-codes the
cookie/header names (`df_csrftoken` / `X-CSRFToken`, `withCredentials: true`) and calls exactly
six auth endpoints. Changing the mechanism, as long as it produces byte-identical cookie/header
behavior, requires **zero frontend changes**.

What changes is the *implementation mechanism*, because Django's CSRF middleware
(`django.middleware.csrf`, `ensure_csrf_cookie`, `csrf_protect`) and
`rest_framework_simplejwt.token_blacklist` have no FastAPI equivalent.

## Decision

1. **JWT issuing/verification**: `PyJWT`, HS256, secret from `settings.jwt_secret_key` (env-only,
   never logged). Claims: `sub` (user id), `token_type` (`access`|`refresh`), `jti` (refresh only),
   `exp`, `iat`. This mirrors simplejwt's claim shape closely enough that no frontend change is
   needed (the frontend never inspects token contents — it only stores the opaque access-token
   string and relies on the server for validation).
2. **Password hashing**: `pwdlib` with the Argon2 hasher (upgrade over Django's default PBKDF2;
   backward compatible migration path: existing Django-hashed passwords use the PBKDF2 format
   Django writes, which `pwdlib`/`passlib` can still verify via a PBKDF2 handler registered
   alongside Argon2, with lazy re-hash to Argon2 on next successful login — documented so a real
   data-adoption run doesn't lock out existing users).
3. **Refresh-token rotation & revocation**: an explicit `refresh_tokens` SQLAlchemy table
   (`id`, `user_id` FK, `jti` unique, `expires_at`, `revoked_at` nullable, `created_at`).
   `/auth/refresh` looks up the incoming token's `jti`, checks `revoked_at IS NULL AND expires_at >
   now()`, marks it revoked, and issues a new refresh token row + new access token — the same
   rotate-and-blacklist behavior simplejwt provided, implemented explicitly instead of via a
   third-party Django app.
4. **CSRF (double-submit cookie)**: a small `app/core/security.py` helper —
   - `GET /auth/csrf` sets a cryptographically random token (32 bytes, `secrets.token_urlsafe`)
     as a **non-httpOnly**, `SameSite=Lax` cookie named `df_csrftoken` (matching Django's cookie
     name so the frontend's `xsrfCookieName` config needs no change), with no server-side state
     (the value itself, not a lookup, is what gets echoed back — classic stateless double-submit).
   - `/auth/refresh` and `/auth/logout` require the `X-CSRFToken` header to be present and equal
     (constant-time compare, `hmac.compare_digest`) to the `df_csrftoken` cookie value on the same
     request. Mismatch or missing → 403 `permission_denied`, matching the existing Django behavior
     (verified by the existing Django test `test_refresh_without_csrf_header_returns_403`, which
     is ported as-is against the FastAPI implementation).
   - This is a FastAPI dependency (`require_csrf`), not global middleware, so it applies to
     exactly the two endpoints that need it — same scope as the Django implementation.
5. **Auth dependencies** (`app/api/dependencies.py`): `get_current_user` (decodes the `Authorization:
   Bearer` header, 401 on missing/invalid/expired), `get_current_active_user` (401 if
   `is_active=False`), and per-resource ownership checks live in the decisions service layer
   (query always scoped by `owner_id == current_user.id`, never trust a path-supplied id alone —
   same pattern as the Django `selectors.py` owner-scoped lookups, ported directly).
6. **Registration duplicate-email → 409, not 400**: preserved exactly (checked explicitly in the
   service before insert, not left to a bare `IntegrityError`, so the response is the clean
   `409 conflict` envelope rather than a raw DB error leaking to the client).
7. **Negative authorization tests are mandatory** for every protected resource (ported 1:1 from
   the existing Django parametrized-style tests: unauthenticated → 401, cross-user → 404, invalid/
   expired token → 401, missing/invalid CSRF on the two cookie endpoints → 403).

## Consequences

- Frontend requires **no changes** — same cookie names, same header name, same response body
  shapes (`{user, access}` / `{access}`), same status codes.
- The double-submit CSRF check is intentionally simpler than Django's (no server-side session tied
  to the token, no per-request token rotation) but provides the same real protection this app
  needs: it's the standard stateless double-submit pattern, appropriate because the app has no
  other ambient-cookie-authenticated state-changing endpoints beyond these two, and both already
  require the cookie to even reach the handler.
- Password verification must handle the PBKDF2 → Argon2 transition explicitly during the
  existing-database adoption path; this is called out in the migration report as a manual
  verification step (log in as the pre-existing dev user created during Phase 1/2 testing) rather
  than assumed to work.
