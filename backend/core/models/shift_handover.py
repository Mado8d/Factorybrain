"""Shift handover model — structured digital shift change documentation."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class ShiftHandover(Base):
    """Digital shift handover with auto-populated data and dual sign-off."""

    __tablename__ = "shift_handovers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    plant_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("plants.id"), nullable=True)
    shift_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_type: Mapped[str] = mapped_column(String, nullable=False)

    # Auto-populated snapshots
    machine_statuses: Mapped[list] = mapped_column(JSONB, server_default="[]")
    active_work_orders: Mapped[list] = mapped_column(JSONB, server_default="[]")
    active_alerts: Mapped[list] = mapped_column(JSONB, server_default="[]")
    sensor_anomalies: Mapped[list] = mapped_column(JSONB, server_default="[]")
    shift_activity: Mapped[dict] = mapped_column(JSONB, server_default="{}")

    # Manual entries
    events: Mapped[list] = mapped_column(JSONB, server_default="[]")
    open_items: Mapped[list] = mapped_column(JSONB, server_default="[]")
    safety_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    production_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Sign-off
    outgoing_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    outgoing_signed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    incoming_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    incoming_acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)

    is_locked: Mapped[bool] = mapped_column(Boolean, server_default="false")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    outgoing_user = relationship("User", foreign_keys=[outgoing_user_id], lazy="selectin")
    incoming_user = relationship("User", foreign_keys=[incoming_user_id], lazy="selectin")
    plant = relationship("Plant")
