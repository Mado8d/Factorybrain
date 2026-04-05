"""Technician scheduling models — skills, availability, requirements."""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class TechnicianSkill(Base):
    """Skill/certification for a technician."""

    __tablename__ = "technician_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_type", name="uq_tech_skill"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    skill_type: Mapped[str] = mapped_column(String, nullable=False)
    # electrical, mechanical, hydraulic, pneumatic, welding, plumbing, hvac, instrumentation
    level: Mapped[int] = mapped_column(Integer, server_default="1")  # 1-5
    is_certified: Mapped[bool] = mapped_column(Boolean, server_default="false")
    certification_name: Mapped[str | None] = mapped_column(String, nullable=True)
    certification_expiry: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    user = relationship("User", lazy="selectin")


class MachineSkillRequirement(Base):
    """Skill requirements for working on a specific machine."""

    __tablename__ = "machine_skill_requirements"
    __table_args__ = (UniqueConstraint("machine_id", "skill_type", name="uq_machine_skill"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False, index=True
    )
    skill_type: Mapped[str] = mapped_column(String, nullable=False)
    min_level: Mapped[int] = mapped_column(Integer, server_default="1")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))


class TechnicianAvailability(Base):
    """Daily availability per technician per shift."""

    __tablename__ = "technician_availability"
    __table_args__ = (UniqueConstraint("user_id", "date", "shift_type", name="uq_tech_avail"),)

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    shift_type: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False)
    # available, off, sick, vacation, on_call, training
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    user = relationship("User", lazy="selectin")
