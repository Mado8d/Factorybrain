"""MachineEvent model — state changes and alarms (hypertable)."""

import uuid
from datetime import datetime

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base


class MachineEvent(Base):
    __tablename__ = "machine_events"

    # Composite primary key for hypertable
    time: Mapped[datetime] = mapped_column(primary_key=True)
    machine_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    event_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, server_default="info")
    source: Mapped[str | None] = mapped_column(String, nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
