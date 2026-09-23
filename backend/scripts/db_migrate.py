#!/usr/bin/env python
"""
Idempotent startup migration used by the container entrypoint. Inspects the live database and
picks the one safe path:

* has `alembic_version`          -> `alembic upgrade head` (normal case)
* no Django tables either        -> `alembic upgrade head` (fresh database; baseline creates schema)
* Django tables, no alembic_version -> adopt (verify schema, stamp baseline, upgrade head)

Only additive DDL ever runs; nothing is dropped or truncated.
docs/adr/ADR-fastapi-database-migration.md.
"""

import sys

from sqlalchemy import create_engine, inspect

from alembic import command
from alembic.config import Config
from app.core.config import get_settings
from scripts import db_adopt_existing


def main() -> int:
    engine = create_engine(get_settings().sync_database_url)
    tables = set(inspect(engine).get_table_names())
    engine.dispose()

    if "alembic_version" in tables or "accounts_user" not in tables:
        print("db_migrate: running `alembic upgrade head`")
        command.upgrade(Config("alembic.ini"), "head")
        return 0

    print("db_migrate: Django-created schema without alembic_version detected -> adopting")
    return db_adopt_existing.main()


if __name__ == "__main__":
    sys.exit(main())
