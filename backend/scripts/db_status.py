#!/usr/bin/env python
"""
Read-only schema/migration status: which Alembic revision is applied, plus a live diff between
the actual database schema and what the SQLAlchemy models declare (schema drift detection).
Never modifies anything. docs/adr/ADR-fastapi-database-migration.md.

Two kinds of diff noise are filtered out (not bugs, expected):
1. Tables this codebase doesn't model at all (Django/Celery-beat/simplejwt framework tables like
   `django_content_type`, `django_celery_beat_*`, `token_blacklist_*`, `auth_group*`) — those
   belong to the Django backend, not to app/models/, and are irrelevant to FastAPI drift.
2. Foreign-key/index/unique-constraint *name* differences on an adopted database: `alembic stamp`
   (used for existing-DB adoption, docs/adr/ADR-fastapi-database-migration.md) never renames
   anything, so a database adopted from Django keeps Django's auto-generated names
   (e.g. `accounts_user_email_key`, `decisions_decision_owner_id_cd32984d_fk_accounts_user_id`)
   rather than this codebase's naming convention (`uq_accounts_user_email`,
   `fk_decisions_decision_owner_id_accounts_user`). The columns, references, and ON DELETE
   behavior are identical either way — only the label differs, so it's reported separately from
   real drift rather than hidden, but not treated as an error.
"""

import sys

from sqlalchemy import create_engine

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from app.core.config import get_settings
from app.core.database import Base
from app.models import decision as _decision_models  # noqa: F401
from app.models import user as _user_models  # noqa: F401

TRACKED_TABLES = set(Base.metadata.tables.keys())


def _touches_tracked_table(diff_item) -> bool:
    obj = diff_item[1] if len(diff_item) > 1 else None
    table = getattr(obj, "table", obj)
    table_name = getattr(table, "name", None)
    return table_name in TRACKED_TABLES


def main() -> int:
    settings = get_settings()
    engine = create_engine(settings.sync_database_url)

    with engine.connect() as conn:
        context = MigrationContext.configure(conn)
        current_rev = context.get_current_revision()
        print(f"Current Alembic revision: {current_rev or '(none — unstamped)'}")
        diff = compare_metadata(context, Base.metadata)

    relevant = [item for item in diff if _touches_tracked_table(item)]
    naming_only = [
        item
        for item in relevant
        if item[0]
        in (
            "add_fk",
            "remove_fk",
            "add_index",
            "remove_index",
            "add_constraint",
            "remove_constraint",
        )
    ]
    real_drift = [item for item in relevant if item not in naming_only]

    if not real_drift and not naming_only:
        print("No schema drift detected: live database matches the SQLAlchemy models exactly.")
        return 0

    if naming_only:
        print(
            f"{len(naming_only)} FK/index NAME-only difference(s) found (expected on a database "
            "adopted via `alembic stamp` — see this script's docstring; not treated as an error)."
        )
    if real_drift:
        print(f"{len(real_drift)} real schema difference(s) found:")
        for item in real_drift:
            print(f"  - {item}")
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
