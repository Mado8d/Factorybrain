"""SensorNode model — device management."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class SensorNode(Base):
    __tablename__ = "sensor_nodes"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True
    )
    node_type: Mapped[str] = mapped_column(String, nullable=False, server_default="vibesense")
    firmware_ver: Mapped[str | None] = mapped_column(String, nullable=True)
    hw_revision: Mapped[str | None] = mapped_column(String, nullable=True)
    install_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    last_seen: Mapped[datetime | None] = mapped_column(nullable=True)
    config: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine", back_populates="sensor_nodes")
