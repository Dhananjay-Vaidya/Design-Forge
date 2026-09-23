"""add status and direction CHECK constraints (additive, not in the original Django schema)

Revision ID: a1e2c3d4f5a6
Revises: c2d3e4f5a6b7
Create Date: 2026-09-23 12:50:00.000000

Django never added these as DB-level CHECK constraints (enforced only at the serializer layer;
verified against the live DB in docs/fastapi-migration-audit.md §3). Safe on existing data because
the application layer has always enforced the same value sets, so no existing row can violate
them (docs/adr/ADR-fastapi-database-migration.md point 3).
"""

from typing import Sequence, Union

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1e2c3d4f5a6"
down_revision: Union[str, None] = "c2d3e4f5a6b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUS_VALUES = ("DRAFT", "SCORED", "COMMITTED", "UNDER_REVIEW", "REVIEWED", "ARCHIVED")
DIRECTION_VALUES = ("benefit", "cost")


def upgrade() -> None:
    op.create_check_constraint(
        "status_valid",
        "decisions_decision",
        f"status IN {STATUS_VALUES!r}",
    )
    op.create_check_constraint(
        "direction_valid",
        "decisions_criterion",
        f"direction IN {DIRECTION_VALUES!r}",
    )


def downgrade() -> None:
    op.drop_constraint("direction_valid", "decisions_criterion", type_="check")
    op.drop_constraint("status_valid", "decisions_decision", type_="check")
