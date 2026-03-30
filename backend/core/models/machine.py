"""Machine model — manufacturing asset registry."""

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class Machine(Base):
    __tablename__ = "machines"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    line_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("production_lines.id"), nullable=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    asset_tag: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_type: Mapped[str | None] = mapped_column(String, nullable=True)
    manufacturer: Mapped[str | None] = mapped_column(String, nullable=True)
    model: Mapped[str | None] = mapped_column(String, nullable=True)
    year_installed: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rated_power_kw: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, server_default="active")
    specifications: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    tenant = relationship("Tenant", back_populates="machines")
    line = relationship("ProductionLine", back_populates="machines")
    sensor_nodes = relationship("SensorNode", back_populates="machine", lazy="selectin")
    alerts = relationship("MaintenanceAlert", back_populates="machine", lazy="selectin")
