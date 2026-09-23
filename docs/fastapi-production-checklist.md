# FastAPI Production Checklist

Each line says how it is enforced or where it is still on you. "Enforced" means the app refuses to
start or a test fails; "Manual" means nothing checks it.

## Configuration and secrets

- [ ] `ENVIRONMENT=production` — **Enforced**: startup validation (`tests/unit/test_settings.py`)
  rejects a weak/default/short `JWT_SECRET_KEY`, `DEBUG` on, insecure refresh cookie, wildcard
  CORS/hosts, and Gemini enabled without a key.
- [ ] Generate `JWT_SECRET_KEY` (`python -c "import secrets; print(secrets.token_urlsafe(48))"`).
  Rotating it invalidates all sessions. **Manual.**
- [ ] `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD` set to real values (the Compose fallbacks
  `decisionforge` / `change-me` are dev-only). **Manual.**
- [ ] `.env` is git-ignored; only `.env.example` (names, no values) is committed. **Enforced** by
  `.gitignore`; re-check with `git ls-files | grep -i '\.env'` before publishing.
- [ ] `GEMINI_API_KEY` is read only by the backend. Nothing in the frontend bundle references it
  (Vite only exposes `VITE_*`). AI is not implemented yet, so this is preparatory.

## Network edge

- [ ] TLS terminates at a reverse proxy (`infrastructure/nginx/` is empty — none is provided).
  **Manual.** Gunicorn already trusts `X-Forwarded-*` (`forwarded_allow_ips="*"`): only expose the
  container to the proxy, never directly to the internet.
- [ ] `ALLOWED_HOSTS` = the public API hostname(s) **plus** the internal name Prometheus/healthchecks
  use (`web`) — **Enforced**: unknown `Host` → 400 (`test_untrusted_host_is_rejected`).
- [ ] `CORS_ALLOWED_ORIGINS` = the real frontend origin(s) — **Enforced**
  (`test_cors_only_allows_configured_origins`).
- [ ] `JWT_REFRESH_COOKIE_SECURE=1` — **Enforced** in production.
- [ ] Security headers (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`) — **Enforced** by
  test. HSTS/CSP belong at the proxy. **Manual.**
- [ ] Rate limiting on `/auth/*` and writes — **Not implemented** (was not in Django either).
  Put limits at the proxy until this is built.

## Database

- [ ] Take a `pg_dump` before the first FastAPI start against an existing database. **Manual.**
- [ ] First start runs `scripts.db_migrate`: adopts a Django schema or upgrades (additive only).
  Check `make db-status`.
- [ ] `alembic check` is clean (CI runs it).
- [ ] Postgres is not published on a public interface (Compose publishes `5432:5432` for local
  development — remove that mapping in production). **Manual.**
- [ ] Backups + restore rehearsal. **Manual.**

## Runtime

- [ ] Build with `--build-arg INSTALL_DEV=false` for a production image (no pytest/ruff/mypy).
- [ ] Workers: `gunicorn.conf.py` (3 Uvicorn workers). Tune to CPU; each worker holds a DB pool of
  `DB_POOL_SIZE` (+`DB_MAX_OVERFLOW`), so total connections = workers × (pool + overflow) must stay
  under Postgres `max_connections`.
- [ ] Do not mount source into the container in production (the base Compose file bind-mounts
  `./backend` for development).
- [ ] Container runs as the non-root `app` user (in the Dockerfile).

## Observability

- [ ] Prometheus target `decisionforge-web` is `up`; alerts in `infrastructure/prometheus/alerts.yml`
  route somewhere real (no Alertmanager is configured). **Manual.**
- [ ] `/metrics` is on the same port as the API — restrict it at the proxy (do not expose publicly).
- [ ] Grafana not exposed publicly, default admin password changed.
- [ ] Logs: JSON-ish access log with `request_id`; secrets are redacted. Ship them somewhere. **Manual.**

## Before go-live

- [ ] `make verify` green against the target stack.
- [ ] `python -m scripts.verify_e2e https://<api-host>` green (creates throwaway users — delete them,
  or run it against staging).
- [ ] GitHub Actions workflow has run green at least once (it has been written and YAML-validated
  but **not** executed on GitHub yet).
- [ ] Decide the rollback stance on password hashes (see the caveat in
  `docs/django-to-fastapi-migration-report.md`).
