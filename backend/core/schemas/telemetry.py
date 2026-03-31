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


# --- Widget configuration for flexible dashboards ---

class WidgetConfig(BaseModel):
    """Single dashboard widget configuration."""
    id: str
    type: str  # kpi, line_chart, area_chart, bar_chart, gauge, table
    title: str
    metric: str | None = None  # e.g. "vib_rms_x", "anomaly_score", "grid_power_w"
    node_type: str | None = None  # "vibesense", "energysense", or None for all
    node_id: str | None = None  # specific node, or None for all
    time_range_hours: int = 6
    chart_type: str = "line"  # line, area, bar
    data_keys: list[dict] | None = None  # [{"key": "vib_rms_x", "name": "RMS X", "color": "#3b82f6"}]
    thresholds: list[dict] | None = None  # [{"value": 2.5, "color": "#f59e0b", "label": "Warning"}]
    height: int = 250
    col_span: int = 1  # 1 or 2 columns wide
    position: int = 0  # sort order


class DashboardPreferencesUpdate(BaseModel):
    """User's complete dashboard widget layout."""
    widgets: list[WidgetConfig]


# Default widget layout (matches the original hardcoded dashboard)
DEFAULT_WIDGET_LAYOUT: list[dict] = [
    {"id": "kpi-machines", "type": "kpi", "title": "Active Machines", "metric": "active_machines", "position": 0, "col_span": 1},
    {"id": "kpi-oee", "type": "kpi", "title": "Plant OEE", "metric": "avg_oee", "position": 1, "col_span": 1},
    {"id": "kpi-alerts", "type": "kpi", "title": "Open Alerts", "metric": "open_alerts", "position": 2, "col_span": 1},
    {"id": "kpi-energy", "type": "kpi", "title": "Energy Usage", "metric": "total_power_kw", "position": 3, "col_span": 1},
    {"id": "chart-vibration", "type": "line_chart", "title": "Vibration Trend", "node_type": "vibesense", "time_range_hours": 6, "chart_type": "line", "data_keys": [{"key": "vib_rms_x", "name": "RMS X", "color": "#3b82f6"}, {"key": "vib_rms_y", "name": "RMS Y", "color": "#10b981"}, {"key": "vib_rms_z", "name": "RMS Z", "color": "#f59e0b"}], "position": 4, "col_span": 1, "height": 250},
    {"id": "chart-anomaly", "type": "area_chart", "title": "Anomaly Score", "node_type": "vibesense", "time_range_hours": 6, "chart_type": "area", "data_keys": [{"key": "anomaly_score", "name": "Anomaly", "color": "#8b5cf6"}], "thresholds": [{"value": 0.5, "color": "#ef4444", "label": "Threshold"}], "position": 5, "col_span": 1, "height": 250},
    {"id": "chart-energy-overview", "type": "area_chart", "title": "Grid vs Solar", "node_type": "energysense", "time_range_hours": 6, "chart_type": "area", "data_keys": [{"key": "grid_power_w", "name": "Grid", "color": "#ef4444"}, {"key": "solar_power_w", "name": "Solar", "color": "#22c55e"}], "position": 6, "col_span": 1, "height": 250},
    {"id": "chart-energy-channels", "type": "area_chart", "title": "Consumption by Channel", "node_type": "energysense", "time_range_hours": 6, "chart_type": "area", "data_keys": [{"key": "channel_1_w", "name": "Channel 1", "color": "#3b82f6"}, {"key": "channel_2_w", "name": "Channel 2", "color": "#f59e0b"}, {"key": "channel_3_w", "name": "Channel 3", "color": "#10b981"}, {"key": "channel_4_w", "name": "Channel 4", "color": "#8b5cf6"}], "position": 7, "col_span": 1, "height": 250},
]
