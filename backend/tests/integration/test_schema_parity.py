"""
Guard against fresh-vs-adopted schema drift: a Django-created database has NO server-side default
on NOT NULL timestamp columns, so the test schema (built by `alembic upgrade head`) must not have
one either -- otherwise tests pass on a schema shape production doesn't have.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

DJANGO_TABLES = [
    "accounts_user",
    "accounts_userprofile",
    "decisions_decision",
    "decisions_alternative",
    "decisions_criterion",
    "decisions_alternativescore",
]


@pytest.mark.parametrize("table", DJANGO_TABLES)
async def test_no_server_defaults_on_django_origin_columns(db_session: AsyncSession, table: str):
    rows = (
        await db_session.execute(
            text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :t AND column_default IS NOT NULL "
                "AND column_name <> 'id'"
            ),
            {"t": table},
        )
    ).all()
    assert rows == [], f"{table} has server defaults Django's schema does not: {rows}"
