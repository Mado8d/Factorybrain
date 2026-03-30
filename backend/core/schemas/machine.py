"""Machine schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class MachineCreate(BaseModel):
    name: str
    line_id: UUID | None = None
    asset_tag: str | None = None
    machine_type: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    year_installed: int | None = None
    rated_power_kw: float | None = None
    specifications: dict | None = None


class MachineUpdate(BaseModel):
    name: str | None = None
    line_id: UUID | None = None
    asset_tag: str | None = None
    machine_type: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    year_installed: int | None = None
    rated_power_kw: float | None = None
    status: str | None = None
    specifications: dict | None = None


class MachineResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    line_id: UUID | None
    name: str
    asset_tag: str | None
    machine_type: str | None
    manufacturer: str | None
    model: str | None
    year_installed: int | None
    rated_power_kw: float | None
    status: str
    specifications: dict
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class MachineTelemetryQuery(BaseModel):
    """Query parameters for telemetry data."""
    hours: int = 24
    interval: str = "5 minutes"
