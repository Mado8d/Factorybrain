"""Maintenance schemas — alerts, work orders, service providers."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel


# --- Alerts ---

class AlertCreate(BaseModel):
    machine_id: UUID
    node_id: str | None = None
    alert_type: str
    severity: str = "info"
    anomaly_score: float | None = None
    details: dict | None = None


class AlertUpdate(BaseModel):
    status: str | None = None
    acknowledged_by: UUID | None = None


class AlertResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    machine_id: UUID
    node_id: str | None
    alert_type: str
    severity: str
    anomaly_score: float | None
    details: dict
    status: str
    acknowledged_by: UUID | None
    acknowledged_at: datetime | None
    resolved_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Work Orders ---

class WorkOrderCreate(BaseModel):
    machine_id: UUID
    title: str
    trigger_type: str = "manual"
    trigger_alert_id: UUID | None = None
    description: str | None = None
    priority: str = "medium"
    category: str | None = None
    requested_date: date | None = None


class WorkOrderUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    status: str | None = None
    assigned_to_provider: UUID | None = None
    assigned_to_tech: UUID | None = None
    scheduled_date: date | None = None
    work_performed: str | None = None
    root_cause: str | None = None
    labor_hours: Decimal | None = None
    total_cost: Decimal | None = None


class WorkOrderResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    wo_number: str
    trigger_type: str
    trigger_alert_id: UUID | None
    machine_id: UUID
    title: str
    description: str | None
    priority: str
    category: str | None
    status: str
    assigned_to_provider: UUID | None
    assigned_to_tech: UUID | None
    scheduled_date: date | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- Service Providers ---

class ServiceProviderCreate(BaseModel):
    company_name: str
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    specializations: list[str] | None = None
    sla_response_hours: int | None = None
    sla_resolve_hours: int | None = None
    contract_type: str | None = None
    hourly_rate: Decimal | None = None


class ServiceProviderResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    company_name: str
    contact_name: str | None
    contact_email: str | None
    contact_phone: str | None
    specializations: list[str] | None
    sla_response_hours: int | None
    sla_resolve_hours: int | None
    contract_type: str | None
    hourly_rate: Decimal | None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
