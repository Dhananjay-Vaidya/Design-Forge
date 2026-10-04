"""create decision_snapshots (immutable versions, FX-04 / BR-007)

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-10-04 12:00:00.000000

Additive only. Insert-only table: the application never updates or deletes a row (rows go away
only with their decision, via ON DELETE CASCADE).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, None] = "d3e4f5a6b7c8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "decision_snapshots",
        sa.Column("decision_id", sa.UUID(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("reason", sa.String(length=16), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("snapshot_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "reason IN ('manual', 'analysis', 'commitment')", name=op.f("ck_decision_snapshots_snapshot_reason_valid")
        ),
        sa.ForeignKeyConstraint(
            ["decision_id"],
            ["decisions_decision.id"],
            name=op.f("fk_decision_snapshots_decision_id_decisions_decision"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_decision_snapshots")),
        sa.UniqueConstraint("decision_id", "version", name="unique_snapshot_version"),
    )
    op.create_index(
        "decision_snapshots_decision_version_idx", "decision_snapshots", ["decision_id", "version"]
    )


def downgrade() -> None:
    op.drop_index("decision_snapshots_decision_version_idx", table_name="decision_snapshots")
    op.drop_table("decision_snapshots")
