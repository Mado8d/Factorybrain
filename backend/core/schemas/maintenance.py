"""Maintenance schemas — alerts, work orders, service providers."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, model_validator


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
    checklist: list[dict] | None = None


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
    checklist: list[dict] | None = None


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
    checklist: list | None = None
    pm_schedule_id: UUID | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# --- PM Schedules ---

class PMScheduleCreate(BaseModel):
    name: str
    machine_id: UUID
    description: str | None = None
    category: str | None = None
    priority: str = "medium"
    trigger_type: str  # calendar, meter, condition, hybrid
    calendar_interval_days: int | None = None
    calendar_unit: str | None = None
    calendar_unit_value: int | None = None
    is_floating: bool = False
    meter_interval_hours: float | None = None
    meter_source_node_id: str | None = None
    condition_sensor_field: str | None = None
    condition_operator: str | None = None
    condition_threshold: float | None = None
    condition_node_id: str | None = None
    window_before_days: int = 3
    window_after_days: int = 3
    lead_time_days: int = 0
    allowed_weekdays: list[int] | None = None
    estimated_duration_minutes: int | None = None
    default_assigned_provider: UUID | None = None
    default_assigned_tech: UUID | None = None
    checklist: list[dict] | None = None
    parts_required: list[dict] | None = None
    instructions: str | None = None
    template_id: str | None = None
    start_date: date | None = None

    @model_validator(mode="after")
    def validate_trigger_fields(self):
        t = self.trigger_type
        if t in ("calendar", "hybrid") and not self.calendar_interval_days:
            raise ValueError("calendar_interval_days required for calendar/hybrid triggers")
        if t in ("meter", "hybrid") and (not self.meter_interval_hours or not self.meter_source_node_id):
            raise ValueError("meter_interval_hours and meter_source_node_id required for meter/hybrid triggers")
        if t == "condition" and not all([self.condition_sensor_field, self.condition_operator, self.condition_threshold, self.condition_node_id]):
            raise ValueError("condition fields required for condition triggers")
        return self


class PMScheduleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    category: str | None = None
    priority: str | None = None
    calendar_interval_days: int | None = None
    calendar_unit: str | None = None
    calendar_unit_value: int | None = None
    is_floating: bool | None = None
    meter_interval_hours: float | None = None
    window_before_days: int | None = None
    window_after_days: int | None = None
    lead_time_days: int | None = None
    allowed_weekdays: list[int] | None = None
    estimated_duration_minutes: int | None = None
    checklist: list[dict] | None = None
    parts_required: list[dict] | None = None
    instructions: str | None = None
    is_active: bool | None = None


class PMScheduleResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    machine_id: UUID
    category: str | None
    priority: str
    trigger_type: str
    calendar_interval_days: int | None
    calendar_unit: str | None
    calendar_unit_value: int | None
    is_floating: bool
    meter_interval_hours: float | None
    condition_sensor_field: str | None
    condition_operator: str | None
    condition_threshold: float | None
    window_before_days: int
    window_after_days: int
    lead_time_days: int
    estimated_duration_minutes: int | None
    checklist: list | None
    parts_required: list | None
    instructions: str | None
    template_id: str | None
    next_due_date: date | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PMOccurrenceResponse(BaseModel):
    id: UUID
    schedule_id: UUID
    work_order_id: UUID | None
    due_date: date
    status: str
    completed_at: datetime | None
    skip_reason: str | None
    compliance_status: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class PMTemplateResponse(BaseModel):
    id: str
    name: str
    category: str
    description: str
    trigger_type: str
    calendar_interval_days: int | None = None
    meter_interval_hours: float | None = None
    estimated_duration_minutes: int | None = None
    checklist: list[dict]
    parts_required: list[dict]
    instructions: str
    applicable_machine_types: list[str]


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
