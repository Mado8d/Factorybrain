"""SensorNode schemas."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel


class SensorNodeCreate(BaseModel):
    id: str
    machine_id: UUID | None = None
    node_type: str = "vibesense"
    firmware_ver: str | None = None
    hw_revision: str | None = None
    install_date: date | None = None
    config: dict | None = None


class SensorNodeUpdate(BaseModel):
    machine_id: UUID | None = None
    firmware_ver: str | None = None
    hw_revision: str | None = None
    config: dict | None = None
    is_active: bool | None = None


class SensorNodeResponse(BaseModel):
    id: str
    tenant_id: UUID
    machine_id: UUID | None
    node_type: str
    firmware_ver: str | None
    hw_revision: str | None
    install_date: date | None
    last_seen: datetime | None
    config: dict
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True
