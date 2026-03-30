"""Plant and ProductionLine schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class PlantCreate(BaseModel):
    name: str
    timezone: str = "Europe/Brussels"
    address: str | None = None


class PlantUpdate(BaseModel):
    name: str | None = None
    timezone: str | None = None
    address: str | None = None


class PlantResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    timezone: str
    address: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class ProductionLineCreate(BaseModel):
    plant_id: UUID
    name: str
    line_type: str | None = None
    sort_order: int = 0


class ProductionLineUpdate(BaseModel):
    name: str | None = None
    line_type: str | None = None
    sort_order: int | None = None


class ProductionLineResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    plant_id: UUID
    name: str
    line_type: str | None
    sort_order: int
    created_at: datetime

    class Config:
        from_attributes = True
