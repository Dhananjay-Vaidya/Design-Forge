"""create ai_proposals (AX-INF-1)

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-10-04 18:00:00.000000

Additive only. Stores staged AI suggestions and what the person did with each item. No prompt text.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a6b7c8d9e0f1"
down_revision: Union[str, None] = "f5a6b7c8d9e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_proposals",
        sa.Column("decision_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(length=48), nullable=False),
        sa.Column("kind", sa.String(length=12), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("prompt_version", sa.String(length=16), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("payload_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("resolution_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("cache_hit", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "status IN ('QUEUED', 'READY', 'ACCEPTED', 'REJECTED', 'EXPIRED')",
            name=op.f("ck_ai_proposals_proposal_status_valid"),
        ),
        sa.CheckConstraint(
            "kind IN ('proposal', 'advisory')", name=op.f("ck_ai_proposals_proposal_kind_valid")
        ),
        sa.ForeignKeyConstraint(
            ["decision_id"],
            ["decisions_decision.id"],
            name=op.f("fk_ai_proposals_decision_id_decisions_decision"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["decision_snapshots.id"],
            name=op.f("fk_ai_proposals_snapshot_id_decision_snapshots"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_proposals")),
    )
    op.create_index(
        "ai_proposals_decision_created_idx", "ai_proposals", ["decision_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ai_proposals_decision_created_idx", table_name="ai_proposals")
    op.drop_table("ai_proposals")
