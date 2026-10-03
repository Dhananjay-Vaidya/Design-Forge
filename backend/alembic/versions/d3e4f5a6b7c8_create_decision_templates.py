"""create decision_templates (user-saved templates, FX-16)

Revision ID: d3e4f5a6b7c8
Revises: a1e2c3d4f5a6
Create Date: 2026-10-04 10:00:00.000000

Additive only. Built-in templates are code (app/domain/templates.py), so this table holds only
templates a user saved from one of their own decisions.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d3e4f5a6b7c8"
down_revision: Union[str, None] = "a1e2c3d4f5a6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "decision_templates",
        sa.Column("owner_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=False),
        sa.Column("title_hint", sa.String(length=200), nullable=False),
        sa.Column("criteria_json", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts_user.id"],
            name=op.f("fk_decision_templates_owner_id_accounts_user"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_decision_templates")),
        sa.UniqueConstraint("owner_id", "name", name="unique_template_name_per_owner"),
    )


def downgrade() -> None:
    op.drop_table("decision_templates")
