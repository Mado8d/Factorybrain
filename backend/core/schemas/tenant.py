"""Tenant schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


# --- Default tenant settings (source of truth for all thresholds) ---

DEFAULT_TENANT_SETTINGS = {
    "thresholds": {
        "vibration_warning": 2.5,
        "vibration_critical": 4.0,
        "anomaly_warning": 0.3,
        "anomaly_critical": 0.6,
        "temperature_warning": 60.0,
        "temperature_critical": 80.0,
        "current_warning": 15.0,
        "current_critical": 20.0,
    },
    "refresh_interval_seconds": 30,
    "data_retention_days": 365,
    "chart_defaults": {
        "time_range_hours": 6,
        "chart_type": "line",
    },
}


# --- Schemas ---

class ThresholdSettings(BaseModel):
    vibration_warning: float = 2.5
    vibration_critical: float = 4.0
    anomaly_warning: float = 0.3
    anomaly_critical: float = 0.6
    temperature_warning: float = 60.0
    temperature_critical: float = 80.0
    current_warning: float = 15.0
    current_critical: float = 20.0


class ChartDefaults(BaseModel):
    time_range_hours: int = 6
    chart_type: str = "line"


class TenantSettingsUpdate(BaseModel):
    thresholds: ThresholdSettings | None = None
    refresh_interval_seconds: int | None = None
    data_retention_days: int | None = None
    chart_defaults: ChartDefaults | None = None


class TenantSettingsResponse(BaseModel):
    settings: dict

    class Config:
        from_attributes = True


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "starter"
    timezone: str = "Europe/Brussels"
    locale: str = "nl-BE"


class TenantUpdate(BaseModel):
    name: str | None = None
    plan: str | None = None
    timezone: str | None = None
    locale: str | None = None
    settings: dict | None = None


class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    timezone: str
    locale: str
    settings: dict
    created_at: datetime

    class Config:
        from_attributes = True
