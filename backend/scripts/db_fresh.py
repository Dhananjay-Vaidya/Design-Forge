#!/usr/bin/env python
"""
Fresh-database migration: `alembic upgrade head` against an EMPTY database. Real DDL runs.
Use for new dev environments, CI, or any database that has never had the Django schema applied.
docs/adr/ADR-fastapi-database-migration.md.
"""

import sys

from alembic import command
from alembic.config import Config


def main() -> int:
    config = Config("alembic.ini")
    print("Running `alembic upgrade head` (fresh database — real DDL)...")
    command.upgrade(config, "head")
    print("Done.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
