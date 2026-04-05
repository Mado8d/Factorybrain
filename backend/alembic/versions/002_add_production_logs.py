"""Add production_logs table for OEE tracking.

Revision ID: 002
Revises: 001
Create Date: 2026-04-05
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "002"
down_revision: str = "001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "production_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("gen_random_uuid()"), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id"), nullable=False, index=True),
        sa.Column("machine_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("machines.id"), nullable=True, index=True),
        sa.Column(
            "production_line_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("production_lines.id"), nullable=True
        ),
        sa.Column("shift_date", sa.Date(), nullable=False, index=True),
        sa.Column("shift_type", sa.String(), nullable=True),
        sa.Column("planned_units", sa.Integer(), server_default="0"),
        sa.Column("actual_units", sa.Integer(), server_default="0"),
        sa.Column("defect_units", sa.Integer(), server_default="0"),
        sa.Column("planned_runtime_minutes", sa.Integer(), server_default="480"),
        sa.Column("actual_runtime_minutes", sa.Integer(), nullable=True),
        sa.Column("downtime_minutes", sa.Integer(), server_default="0"),
        sa.Column("ideal_cycle_time_seconds", sa.Float(), nullable=True),
        sa.Column("product_type", sa.String(), nullable=True),
        sa.Column("batch_number", sa.String(), nullable=True),
        sa.Column("operator_name", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("source", sa.String(), server_default="manual"),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("imported_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("NOW()")),
    )

    # RLS policy
    op.execute("ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY")
    op.execute("""
        CREATE POLICY tenant_isolation ON production_logs
        USING (tenant_id::text = current_setting('app.current_tenant', true))
    """)


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation ON production_logs")
    op.drop_table("production_logs")
