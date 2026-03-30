"""Telemetry schemas — sensor readings and aggregates."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SensorReadingResponse(BaseModel):
    time: datetime
    node_id: str
    node_type: str
    temperature_1: float | None = None
    # VibeSense
    vib_rms_x: float | None = None
    vib_rms_y: float | None = None
    vib_rms_z: float | None = None
    dominant_freq: float | None = None
    crest_factor: float | None = None
    anomaly_score: float | None = None
    # EnergySense
    grid_power_w: float | None = None
    solar_power_w: float | None = None
    channel_1_w: float | None = None
    channel_2_w: float | None = None
    channel_3_w: float | None = None
    channel_4_w: float | None = None
    voltage_v: float | None = None
    power_factor: float | None = None
    # Shared
    current_rms: float | None = None
    energy_kwh: float | None = None

    class Config:
        from_attributes = True


class DashboardKPIs(BaseModel):
    """Aggregated KPIs for the dashboard overview."""
    active_machines: int
    total_machines: int
    open_alerts: int
    critical_alerts: int
    avg_oee: float | None = None
    total_power_kw: float | None = None
    solar_power_kw: float | None = None
