#!/usr/bin/env python
"""
Adopt an existing Django-created database: verify its schema matches what the baseline
migration expects (table-by-table, column-by-column via information_schema — not just "does the
table exist"), then `alembic stamp` the baseline (no DDL) and `alembic upgrade head` (runs only
the genuinely new, additive revisions for real). Aborts with a diff report if the live schema
doesn't match; never force-applies. docs/adr/ADR-fastapi-database-migration.md.
"""

import sys

from sqlalchemy import create_engine, inspect

from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from app.core.database import Base
from app.models import decision as _decision_models  # noqa: F401
from app.models import user as _user_models  # noqa: F401

BASELINE_REVISION = "b155269d9f5d"

# Tables Django originally created; refresh_tokens is new (never existed under Django), so it's
# not part of this check — it's fine (expected) for it to be absent on a database being adopted.
DJANGO_ORIGIN_TABLES = {
    "accounts_user",
    "accounts_userprofile",
    "decisions_decision",
    "decisions_alternative",
    "decisions_criterion",
    "decisions_alternativescore",
}


def verify_schema_matches(engine) -> list[str]:
    """Returns a list of human-readable problems; empty list means the schema matches."""
    problems: list[str] = []
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    missing = DJANGO_ORIGIN_TABLES - existing_tables
    if missing:
        problems.append(f"Missing expected tables: {sorted(missing)}")
        return problems  # no point checking columns of tables that don't exist

    for table in Base.metadata.tables.values():
        if table.name not in DJANGO_ORIGIN_TABLES:
            continue
        existing_columns = {c["name"] for c in inspector.get_columns(table.name)}
        expected_columns = {c.name for c in table.columns}
        missing_columns = expected_columns - existing_columns
        if missing_columns:
            problems.append(f"Table '{table.name}' is missing columns: {sorted(missing_columns)}")

    return problems


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    print(f"Checking schema at {settings.sync_database_url.split('@')[-1]} ...")
    problems = verify_schema_matches(engine)
    if problems:
        print("Schema does NOT match the expected baseline — aborting, no changes made:")
        for p in problems:
            print(f"  - {p}")
        print(
            "\nIf this is actually a fresh/empty database, use scripts/db_fresh.py instead. "
            "If the schema has genuinely diverged, resolve manually before adopting."
        )
        return 1

    print("Schema matches. Stamping baseline revision (no DDL runs)...")
    config = Config("alembic.ini")
    command.stamp(config, BASELINE_REVISION)

    print("Applying any revisions after the baseline (real DDL, additive only)...")
    command.upgrade(config, "head")

    print("Done. Existing database adopted without data loss.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
