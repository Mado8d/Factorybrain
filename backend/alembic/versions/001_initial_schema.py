"""Initial schema — matches init-db.sql (already applied via Docker).

Revision ID: 001
Revises: None
Create Date: 2026-03-30
"""

from collections.abc import Sequence

from alembic import op

revision: str = "001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Schema is created by init-db.sql on first docker compose up.
    # This migration exists to mark the baseline for Alembic.
    # Run `alembic stamp 001` on an existing database to mark as applied.
    pass


def downgrade() -> None:
    # Dropping the entire schema is too destructive for a migration.
    # Use docker compose down -v to reset the database instead.
    op.execute("DROP TABLE IF EXISTS ai_suggestions CASCADE")
    op.execute("DROP TABLE IF EXISTS maintenance_work_orders CASCADE")
    op.execute("DROP TABLE IF EXISTS maintenance_alerts CASCADE")
    op.execute("DROP TABLE IF EXISTS service_provider_users CASCADE")
    op.execute("DROP TABLE IF EXISTS service_providers CASCADE")
    op.execute("DROP TABLE IF EXISTS machine_events CASCADE")
    op.execute("DROP TABLE IF EXISTS sensor_readings CASCADE")
    op.execute("DROP TABLE IF EXISTS sensor_nodes CASCADE")
    op.execute("DROP TABLE IF EXISTS machines CASCADE")
    op.execute("DROP TABLE IF EXISTS production_lines CASCADE")
    op.execute("DROP TABLE IF EXISTS plants CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")
    op.execute("DROP TABLE IF EXISTS tenants CASCADE")
