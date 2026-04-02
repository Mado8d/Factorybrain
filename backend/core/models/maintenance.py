"""Maintenance models — alerts, work orders, service providers."""

import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    Interval,
    Numeric,
    Float,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class ServiceProvider(Base):
    __tablename__ = "service_providers"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    company_name: Mapped[str] = mapped_column(String, nullable=False)
    contact_name: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_email: Mapped[str | None] = mapped_column(String, nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String, nullable=True)
    specializations: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)
    sla_response_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sla_resolve_hours: Mapped[int | None] = mapped_column(Integer, nullable=True)
    contract_type: Mapped[str | None] = mapped_column(String, nullable=True)
    hourly_rate: Mapped[Decimal | None] = mapped_column(Numeric(8, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    technicians = relationship("ServiceProviderUser", back_populates="provider", lazy="selectin")


class ServiceProviderUser(Base):
    __tablename__ = "service_provider_users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    service_provider_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_providers.id"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    email: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, server_default="technician")
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    provider = relationship("ServiceProvider", back_populates="technicians")


class MaintenanceAlert(Base):
    __tablename__ = "maintenance_alerts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False
    )
    node_id: Mapped[str | None] = mapped_column(
        String, ForeignKey("sensor_nodes.id"), nullable=True
    )
    alert_type: Mapped[str] = mapped_column(String, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False, server_default="info")
    anomaly_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_rul: Mapped[str | None] = mapped_column(Interval, nullable=True)
    details: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    status: Mapped[str] = mapped_column(String, server_default="open")
    acknowledged_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine", back_populates="alerts")


class PreventiveMaintenanceSchedule(Base):
    """PM schedule — defines recurring maintenance tasks for a machine."""
    __tablename__ = "pm_schedules"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False
    )
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    priority: Mapped[str] = mapped_column(String, server_default="medium")

    # Trigger configuration
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)  # calendar, meter, condition, hybrid
    calendar_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calendar_unit: Mapped[str | None] = mapped_column(String, nullable=True)  # days, weeks, months
    calendar_unit_value: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_floating: Mapped[bool] = mapped_column(Boolean, server_default="false")
    meter_interval_hours: Mapped[float | None] = mapped_column(Float, nullable=True)
    meter_source_node_id: Mapped[str | None] = mapped_column(String, ForeignKey("sensor_nodes.id"), nullable=True)
    condition_sensor_field: Mapped[str | None] = mapped_column(String, nullable=True)
    condition_operator: Mapped[str | None] = mapped_column(String, nullable=True)
    condition_threshold: Mapped[float | None] = mapped_column(Float, nullable=True)
    condition_node_id: Mapped[str | None] = mapped_column(String, ForeignKey("sensor_nodes.id"), nullable=True)

    # Scheduling window
    window_before_days: Mapped[int] = mapped_column(Integer, server_default="3")
    window_after_days: Mapped[int] = mapped_column(Integer, server_default="3")
    lead_time_days: Mapped[int] = mapped_column(Integer, server_default="0")
    allowed_weekdays: Mapped[list[int] | None] = mapped_column(ARRAY(Integer), nullable=True)
    estimated_duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Default assignment
    default_assigned_provider: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_providers.id"), nullable=True
    )
    default_assigned_tech: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_provider_users.id"), nullable=True
    )

    # Content
    checklist: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    parts_required: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    instructions: Mapped[str | None] = mapped_column(String, nullable=True)
    template_id: Mapped[str | None] = mapped_column(String, nullable=True)

    # State
    next_due_date: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    next_meter_due: Mapped[float | None] = mapped_column(Float, nullable=True)
    last_meter_reading: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine")
    occurrences = relationship("PMOccurrence", back_populates="schedule", lazy="selectin")


class PMOccurrence(Base):
    """Tracks each individual PM instance for compliance reporting."""
    __tablename__ = "pm_occurrences"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    schedule_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm_schedules.id"), nullable=False, index=True
    )
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_work_orders.id"), nullable=True
    )
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, server_default="upcoming")
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    skip_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    compliance_status: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    schedule = relationship("PreventiveMaintenanceSchedule", back_populates="occurrences")
    work_order = relationship("MaintenanceWorkOrder", foreign_keys="PMOccurrence.work_order_id")


class MaintenanceWorkOrder(Base):
    __tablename__ = "maintenance_work_orders"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    wo_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)
    trigger_alert_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_alerts.id"), nullable=True
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    priority: Mapped[str] = mapped_column(String, nullable=False, server_default="medium")
    category: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_context: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    assigned_to_provider: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_providers.id"), nullable=True
    )
    assigned_to_tech: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("service_provider_users.id"), nullable=True
    )
    assigned_at: Mapped[datetime | None] = mapped_column(nullable=True)
    assigned_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String, server_default="draft")
    requested_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    scheduled_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    estimated_duration: Mapped[str | None] = mapped_column(Interval, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    work_performed: Mapped[str | None] = mapped_column(String, nullable=True)
    root_cause: Mapped[str | None] = mapped_column(String, nullable=True)
    checklist: Mapped[list | None] = mapped_column(JSONB, nullable=True)  # [{step, required, completed}]
    parts_used: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    labor_hours: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    total_cost: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    verified_at: Mapped[datetime | None] = mapped_column(nullable=True)
    verified_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    verification_status: Mapped[str | None] = mapped_column(String, nullable=True)
    quality_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    downtime_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attachments: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # PM tracking (nullable — only set for PM-generated WOs)
    pm_schedule_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm_schedules.id"), nullable=True
    )
    pm_occurrence_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("pm_occurrences.id"), nullable=True
    )

    # Relationships
    trigger_alert = relationship("MaintenanceAlert")
    machine = relationship("Machine")
    provider = relationship("ServiceProvider")
    technician = relationship("ServiceProviderUser")
    pm_schedule = relationship("PreventiveMaintenanceSchedule")
    pm_occurrence = relationship("PMOccurrence", foreign_keys="MaintenanceWorkOrder.pm_occurrence_id")
