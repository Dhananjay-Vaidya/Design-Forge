"""create minimal public contact inbox

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
"""

import sqlalchemy as sa
from alembic import op

revision = "b7c8d9e0f1a2"
down_revision = "a6b7c8d9e0f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contact_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("reason", sa.String(16), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("consent", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ip_hash", sa.String(64), nullable=False),
        sa.Column("handled", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint("consent = true", name="contact_consent_required"),
        sa.CheckConstraint("reason IN ('general', 'feedback', 'partnership', 'support', 'press')", name="contact_reason_valid"),
        sa.PrimaryKeyConstraint("id", name="pk_contact_messages"),
    )


def downgrade() -> None:
    op.drop_table("contact_messages")
