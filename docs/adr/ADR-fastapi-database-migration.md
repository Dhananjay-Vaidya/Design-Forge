# ADR: FastAPI database migration strategy

**Status:** Accepted
**Date:** 2026-09-23

## Context

The Django backend already created a real Postgres schema (verified via `psql \dt` against the
running dev container — see `docs/fastapi-migration-audit.md` §3): `accounts_user`,
`accounts_userprofile`, `decisions_decision`, `decisions_alternative`, `decisions_criterion`,
`decisions_alternativescore`, plus Django/Celery-beat/simplejwt framework tables. There is
currently no production data (this is local dev only, per `docker-compose.yml`'s named volumes),
but the migration must still be able to adopt an existing populated database without destructive
operations, per the migration brief's hard rules (#7-#10).

## Decision

1. **Table and column names are preserved exactly** in the SQLAlchemy models — `accounts_user`,
   `accounts_userprofile`, `decisions_decision`, `decisions_alternative`, `decisions_criterion`,
   `decisions_alternativescore` — via explicit `__tablename__` and `Column("...")` names matching
   the Django-generated schema, not FastAPI/SQLAlchemy naming conventions. This means an existing
   database (with data) can be pointed at the new backend with zero data migration.
2. **`unique_lower_email`** (Django's `UniqueConstraint(Lower("email"))`) is reproduced as a plain
   SQLAlchemy `Index("unique_lower_email", func.lower(column("email")), unique=True)` in
   `app/models/user.py` — corrected after actually trying it: SQLAlchemy's `Index` construct
   accepts arbitrary column expressions (including `func.lower(...)`), so this needs no raw SQL /
   `op.execute()` at all, contrary to what an earlier draft of this ADR assumed. Verified against
   the live DB (`\d accounts_user`) that the name and definition (`UNIQUE btree (lower(email))`)
   match exactly.
2b. **Naming convention gotcha (found by actually generating the migration, not assumed):**
   SQLAlchemy's `naming_convention` rewrites a `CheckConstraint`'s name even when one is given
   explicitly — every other constraint type only gets the convention applied when left unnamed.
   The `"ck"` entry was therefore removed from `app/core/database.py`'s `NAMING_CONVENTION`, so
   `criterion_weight_positive` and `score_within_configured_range` come out of autogenerate
   exactly as named, matching the live DB, instead of being mangled into
   `ck_decisions_criterion_criterion_weight_positive`.
3. **Additive-only improvements**: two Postgres `CHECK` constraints Django never added
   (`decisions_decision.status IN (...)`, `decisions_criterion.direction IN (...)`) are added in a
   *separate*, clearly-labeled Alembic revision after the baseline — safe on existing data because
   the application layer (Django today, FastAPI going forward) has always enforced these same
   value sets, so no existing row can violate them.
4. **Two entry points, both provided as scripts** (`backend_fastapi/scripts/`):
   - `db_fresh.py` — `alembic upgrade head` against an empty database (new dev/test environments,
     CI). Runs real DDL.
   - `db_adopt_existing.py` — for a database that already has the Django-created schema: verifies
     the live schema matches the baseline revision's expected shape (column-by-column check via
     `information_schema`, not just "does the table exist"), and if so, runs `alembic stamp
     <baseline_revision>` (records the revision as applied **without running any DDL**), then
     `alembic upgrade head` to apply only the genuinely new revisions (the two additive CHECK
     constraints, and anything after). If the live schema does *not* match, it aborts with a
     diff report and does nothing — it never guesses or force-applies.
5. **Schema drift detection**: `db_status.py` runs `alembic current` plus a live
   `information_schema` introspection diffed against the SQLAlchemy metadata
   (`sqlalchemy.schema.MetaData.reflect()` compared to the declared models), printing any mismatch.
   This is read-only.
6. **Rollback**: every revision implements both `upgrade()` and `downgrade()`. Because the
   baseline revision's `upgrade()` is only ever run via real DDL against a *fresh* database (the
   existing-DB path uses `stamp`, not `upgrade`), its `downgrade()` is symmetric and safe to test
   in CI against a throwaway database. The additive-constraint revisions' `downgrade()` simply
   drops the two `CHECK` constraints.
7. **No destructive operations are ever automatic.** No script in `backend_fastapi/scripts/` calls
   `DROP TABLE`, `DROP COLUMN`, `alembic downgrade` against a real environment, or
   `docker compose down -v`. Any such action requires an explicit, separate, manually-invoked
   command and is never part of `make migrate`/`make up`.

## Consequences

- The FastAPI backend can start against the exact same Postgres volume Django was using, with no
  data loss and no re-import step.
- A brand-new environment (CI, a fresh laptop) gets the same schema via real `alembic upgrade
  head` DDL — both paths converge on an identical schema, verified by `db_status.py`.
- The two additive CHECK constraints are a deliberate, documented improvement over the Django-era
  schema, not an accidental behavior change — they tighten data integrity without being able to
  reject any row that valid application code could have produced.
