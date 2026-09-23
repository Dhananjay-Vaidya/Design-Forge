# Frontend ↔ FastAPI Compatibility

**Result: no frontend changes were required.** The frontend currently calls only the auth/profile
endpoints (there is no decisions UI yet), all of which are served by FastAPI with identical
contracts. This is enforced by `backend/tests/contract/test_frontend_contract.py`, which scans the
frontend source for every `apiClient.<method>(path)` call and fails if any is missing from the
backend's OpenAPI schema, and by `backend/scripts/verify_e2e.py` against the running stack.

Base URL: `VITE_API_BASE_URL` (default `http://localhost:8000/api/v1`), unchanged. The client sends
`withCredentials: true`, so the refresh cookie and CSRF cookie flow cross-origin from
`http://localhost:5173`; the backend's CORS allows exactly the configured origins with credentials
(verified: allowed origin echoed, unknown origin rejected).

| Frontend function (`src/features/auth/api.ts`) | Endpoint | Request | Response type | Auth | FastAPI compatible | Frontend change |
|---|---|---|---|---|---|---|
| `registerRequest` | `POST /auth/register` | `{email, password}` (unknown fields rejected) | `AuthResponse {user, access}` + `df_refresh` cookie | none (CSRF header) | Yes: 201; 409 on duplicate; 400 with `fields` | None |
| `loginRequest` | `POST /auth/login` | `{email, password}` | `AuthResponse` + `df_refresh` cookie | none (CSRF header) | Yes: 200; 401 on bad credentials | None |
| `logoutRequest` | `POST /auth/logout` | none | 204, cookie cleared | bearer + CSRF | Yes | None |
| `fetchCurrentUser` | `GET /me` | none | `User {id,email,created_at,profile{display_name,timezone,quota_tier,preferences}}` | bearer | Yes (field set asserted in tests) | None |
| `primeCsrfCookie` | `GET /auth/csrf` | none | 204 + `df_csrftoken` cookie | none | Yes | None |
| `silentRefresh` and the refresh interceptor in `src/api/client.ts` | `POST /auth/refresh` | cookie + `X-CSRFToken` | `{access}` + rotated cookie | cookie + CSRF | Yes: 403 without CSRF, 401 after logout | None |

Error handling in `client.ts` reads `error.code`, `error.message`, `error.fields`,
`error.retry_after_seconds`, `error.request_id`; the FastAPI envelope provides all of these
(`retry_after_seconds` only when set). Validation messages use DRF's wording (e.g. "Enter a valid
email address.") so form-field text does not change.

## Endpoints the frontend does not call yet (already contract-matched to Django)

`/decisions` (+ nested alternatives, criteria, scores, ranking), `/me/profile`, `/me/delete`.
When the decisions UI is built, note the wire contract preserved from Django (differs from the
Python attribute names): alternatives/criteria carry `decision` (not `decision_id`); score rows
carry `alternative` and `criterion`; alternatives, criteria and decisions lists are
`{count, page, page_size, results}` (`page`/`page_size` are lenient: junk → default, `page_size`
clamps at 100, an invalid or past-the-end `page` is 404 "Invalid page."); the score-upsert
*request* uses `alternative_id`/`criterion_id`.

## Frontend checks run (final code, in the frontend container)

`npm run lint` ✓ · `tsc --noEmit` ✓ · `npm run test -- --run` ✓ (3 files, 9 tests) ·
`npm run build` ✓ (179 modules). Not run: a clean `npm ci`, and Playwright (no E2E suite exists in
this repository).
