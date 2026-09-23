"""create refresh_tokens table (new — Django used a third-party token_blacklist app instead)

Revision ID: c2d3e4f5a6b7
Revises: b155269d9f5d
Create Date: 2026-09-23 12:55:00.000000

Genuinely new table (docs/adr/ADR-fastapi-authentication.md): split out of the baseline revision
so it actually gets created (via real DDL) on both fresh databases and existing ones adopted via
`alembic stamp` of the baseline — stamping the baseline runs no DDL, so anything bundled into it
would otherwise be silently skipped for an adopted database.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: Union[str, None] = "b155269d9f5d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "refresh_tokens",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("jti", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["accounts_user.id"],
            name=op.f("fk_refresh_tokens_user_id_accounts_user"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_refresh_tokens")),
        sa.UniqueConstraint("jti", name=op.f("uq_refresh_tokens_jti")),
    )


def downgrade() -> None:
    op.drop_table("refresh_tokens")
