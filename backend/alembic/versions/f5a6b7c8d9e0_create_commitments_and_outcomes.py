"""create commitments and outcome_reviews (FX-06 prerequisites, BR-009/BR-010)

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-10-04 15:00:00.000000

Additive only.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "f5a6b7c8d9e0"
down_revision: Union[str, None] = "e4f5a6b7c8d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "commitments",
        sa.Column("decision_id", sa.UUID(), nullable=False),
        sa.Column("alternative_id", sa.UUID(), nullable=False),
        sa.Column("snapshot_id", sa.UUID(), nullable=False),
        sa.Column("confidence", sa.Integer(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "confidence BETWEEN 0 AND 100", name=op.f("ck_commitments_confidence_range")
        ),
        sa.ForeignKeyConstraint(
            ["decision_id"],
            ["decisions_decision.id"],
            name=op.f("fk_commitments_decision_id_decisions_decision"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["alternative_id"],
            ["decisions_alternative.id"],
            name=op.f("fk_commitments_alternative_id_decisions_alternative"),
        ),
        sa.ForeignKeyConstraint(
            ["snapshot_id"],
            ["decision_snapshots.id"],
            name=op.f("fk_commitments_snapshot_id_decision_snapshots"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_commitments")),
    )
    op.create_index(
        "unique_active_commitment",
        "commitments",
        ["decision_id"],
        unique=True,
        postgresql_where=sa.text("is_active"),
    )
    op.create_table(
        "outcome_reviews",
        sa.Column("decision_id", sa.UUID(), nullable=False),
        sa.Column("commitment_id", sa.UUID(), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("satisfaction", sa.Integer(), nullable=True),
        sa.Column("result_notes", sa.Text(), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.CheckConstraint(
            "status IN ('SCHEDULED', 'DUE', 'SUBMITTED', 'CANCELLED')",
            name=op.f("ck_outcome_reviews_outcome_status_valid"),
        ),
        sa.CheckConstraint(
            "satisfaction IS NULL OR satisfaction BETWEEN 1 AND 5",
            name=op.f("ck_outcome_reviews_satisfaction_range"),
        ),
        sa.ForeignKeyConstraint(
            ["decision_id"],
            ["decisions_decision.id"],
            name=op.f("fk_outcome_reviews_decision_id_decisions_decision"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["commitment_id"],
            ["commitments.id"],
            name=op.f("fk_outcome_reviews_commitment_id_commitments"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_outcome_reviews")),
    )
    op.create_index("outcome_reviews_status_due_idx", "outcome_reviews", ["status", "due_at"])
    op.create_index("outcome_reviews_decision_idx", "outcome_reviews", ["decision_id"])


def downgrade() -> None:
    op.drop_index("outcome_reviews_decision_idx", table_name="outcome_reviews")
    op.drop_index("outcome_reviews_status_due_idx", table_name="outcome_reviews")
    op.drop_table("outcome_reviews")
    op.drop_index("unique_active_commitment", table_name="commitments")
    op.drop_table("commitments")
