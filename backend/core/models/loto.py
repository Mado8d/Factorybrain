"""LOTO models — Lock-Out/Tag-Out procedures and permits."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class LOTOProcedure(Base):
    """Machine-specific energy isolation procedure template."""

    __tablename__ = "loto_procedures"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, server_default="1")
    energy_sources: Mapped[list] = mapped_column(JSONB, nullable=False)
    # [{type, location, isolation_method, verification_method, photo_url}]
    ppe_required: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)
    special_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine")
    approver = relationship("User", lazy="selectin")


class LOTOPermit(Base):
    """Active lock-out permit linked to a work order."""

    __tablename__ = "loto_permits"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_work_orders.id"), nullable=False, index=True
    )
    procedure_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loto_procedures.id"), nullable=False
    )
    status: Mapped[str] = mapped_column(String, server_default="draft")
    # draft → active → work_in_progress → completed | cancelled
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    authorized_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    authorized_at: Mapped[datetime | None] = mapped_column(nullable=True)
    isolation_steps: Mapped[list] = mapped_column(JSONB, server_default="[]")
    # [{step_idx, locked_by, locked_at, lock_id, verified, unlocked_by, unlocked_at}]
    all_locked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    work_started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    work_completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    all_unlocked_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    procedure = relationship("LOTOProcedure", lazy="selectin")
    work_order = relationship("MaintenanceWorkOrder")
    requester = relationship("User", foreign_keys=[requested_by], lazy="selectin")
    authorizer = relationship("User", foreign_keys=[authorized_by], lazy="selectin")


class PermitToWork(Base):
    """General permit-to-work for hazardous activities."""

    __tablename__ = "permits_to_work"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_work_orders.id"), nullable=False
    )
    permit_type: Mapped[str] = mapped_column(String, nullable=False)
    # hot_work, confined_space, height_work, electrical
    loto_permit_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("loto_permits.id"), nullable=True
    )
    hazards_identified: Mapped[list] = mapped_column(JSONB, server_default="[]")
    control_measures: Mapped[list] = mapped_column(JSONB, server_default="[]")
    ppe_required: Mapped[list | None] = mapped_column(ARRAY(String), nullable=True)
    requested_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    valid_from: Mapped[datetime | None] = mapped_column(nullable=True)
    valid_until: Mapped[datetime | None] = mapped_column(nullable=True)
    status: Mapped[str] = mapped_column(String, server_default="pending")
    # pending → approved → active → closed | expired
    closed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    work_order = relationship("MaintenanceWorkOrder")
    loto_permit = relationship("LOTOPermit")
