"""Production log model — tracks production output per machine/line for OEE calculation."""

import uuid
from datetime import date, datetime

from sqlalchemy import Date, Float, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class ProductionLog(Base):
    """Production output log — one entry per machine per shift."""

    __tablename__ = "production_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True, index=True
    )
    production_line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_lines.id"), nullable=True
    )
    shift_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_type: Mapped[str | None] = mapped_column(String, nullable=True)  # morning/afternoon/night

    # Production metrics
    planned_units: Mapped[int] = mapped_column(Integer, server_default="0")
    actual_units: Mapped[int] = mapped_column(Integer, server_default="0")
    defect_units: Mapped[int] = mapped_column(Integer, server_default="0")

    # Time metrics (minutes)
    planned_runtime_minutes: Mapped[int] = mapped_column(Integer, server_default="480")
    actual_runtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    downtime_minutes: Mapped[int] = mapped_column(Integer, server_default="0")

    # Rates
    ideal_cycle_time_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)

    # Context
    product_type: Mapped[str | None] = mapped_column(String, nullable=True)
    batch_number: Mapped[str | None] = mapped_column(String, nullable=True)
    operator_name: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Import tracking
    source: Mapped[str] = mapped_column(String, server_default="manual")
    imported_at: Mapped[datetime | None] = mapped_column(nullable=True)
    imported_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine", lazy="selectin")
