"""Dashboard API — KPIs and real-time telemetry WebSocket."""

import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.models.sensor_reading import SensorReading
from core.models.user import User
from core.schemas.telemetry import (
    DEFAULT_WIDGET_LAYOUT,
    DashboardKPIs,
    DashboardPreferencesUpdate,
)
from core.services import dashboard_service, machine_service

logger = logging.getLogger(__name__)
router = APIRouter()


# --- Dashboard preferences (widget layout per user) ---

@router.get("/preferences")
async def get_dashboard_preferences(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get the current user's dashboard widget configuration."""
    widgets = (user.preferences or {}).get("widgets")
    return {"widgets": widgets if widgets else DEFAULT_WIDGET_LAYOUT}


@router.put("/preferences")
async def update_dashboard_preferences(
    data: DashboardPreferencesUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Save the user's dashboard widget layout."""
    prefs = user.preferences or {}
    prefs["widgets"] = [w.model_dump() for w in data.widgets]
    user.preferences = prefs
    await db.flush()
    return {"widgets": prefs["widgets"]}


# --- KPIs ---

@router.get("/kpis", response_model=DashboardKPIs)
async def get_kpis(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get aggregated dashboard KPIs."""
    await set_tenant_context(db, str(user.tenant_id))
    return await dashboard_service.get_dashboard_kpis(db)


@router.get("/latest-telemetry")
async def get_latest_telemetry(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get the most recent telemetry reading per sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    readings = await machine_service.get_latest_telemetry_per_node(db)
    return {
        node_id: {
            "time": r.time.isoformat(),
            "node_type": r.node_type,
            "vib_rms_x": r.vib_rms_x,
            "vib_rms_y": r.vib_rms_y,
            "vib_rms_z": r.vib_rms_z,
            "anomaly_score": r.anomaly_score,
            "dominant_freq": r.dominant_freq,
            "temperature_1": r.temperature_1,
            "current_rms": r.current_rms,
            "grid_power_w": r.grid_power_w,
            "solar_power_w": r.solar_power_w,
        }
        for node_id, r in readings.items()
    }


@router.get("/telemetry-history")
async def get_telemetry_history(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    node_id: str | None = Query(None),
    node_type: str | None = Query(None),
    hours: int | None = Query(None, ge=1, le=168),
    start: str | None = Query(None, description="ISO datetime, e.g. 2026-03-30T08:00:00Z"),
    end: str | None = Query(None, description="ISO datetime, e.g. 2026-03-31T18:00:00Z"),
):
    """Get telemetry time-series for charts. Supports date range or hours-back.

    Uses TimescaleDB time_bucket for efficient downsampling of large time ranges.
    """
    await set_tenant_context(db, str(user.tenant_id))

    # Determine time window
    if start and end:
        since = datetime.fromisoformat(start.replace("Z", "+00:00"))
        until = datetime.fromisoformat(end.replace("Z", "+00:00"))
    else:
        h = hours or 6
        until = datetime.now(timezone.utc)
        since = until - timedelta(hours=h)

    # Choose bucket interval based on time span (aim for ~200-400 points)
    span_hours = max(1, (until - since).total_seconds() / 3600)
    if span_hours <= 1:
        bucket = "10 seconds"
    elif span_hours <= 6:
        bucket = "1 minute"
    elif span_hours <= 24:
        bucket = "5 minutes"
    elif span_hours <= 48:
        bucket = "10 minutes"
    elif span_hours <= 168:
        bucket = "30 minutes"
    else:
        bucket = "1 hour"

    # Build filters
    filters = "WHERE time >= :since AND time <= :until"
    params: dict = {"since": since, "until": until, "bucket": bucket}
    if node_id:
        filters += " AND node_id = :node_id"
        params["node_id"] = node_id
    if node_type:
        filters += " AND node_type = :node_type"
        params["node_type"] = node_type

    # Use time_bucket for downsampling with AVG aggregation
    from sqlalchemy import text as sa_text
    sql = sa_text(f"""
        SELECT
            time_bucket(:bucket, time) AS bucket_time,
            node_id, node_type,
            AVG(vib_rms_x) AS vib_rms_x,
            AVG(vib_rms_y) AS vib_rms_y,
            AVG(vib_rms_z) AS vib_rms_z,
            AVG(anomaly_score) AS anomaly_score,
            AVG(dominant_freq) AS dominant_freq,
            AVG(crest_factor) AS crest_factor,
            AVG(temperature_1) AS temperature_1,
            AVG(current_rms) AS current_rms,
            AVG(energy_kwh) AS energy_kwh,
            AVG(grid_power_w) AS grid_power_w,
            AVG(solar_power_w) AS solar_power_w,
            AVG(channel_1_w) AS channel_1_w,
            AVG(channel_2_w) AS channel_2_w,
            AVG(channel_3_w) AS channel_3_w,
            AVG(channel_4_w) AS channel_4_w,
            AVG(voltage_v) AS voltage_v,
            AVG(power_factor) AS power_factor
        FROM sensor_readings
        {filters}
        GROUP BY bucket_time, node_id, node_type
        ORDER BY bucket_time ASC
    """)

    result = await db.execute(sql, params)
    rows = result.mappings().all()

    return [
        {
            "time": row["bucket_time"].isoformat(),
            "node_id": row["node_id"],
            "node_type": row["node_type"],
            "vib_rms_x": round(row["vib_rms_x"], 4) if row["vib_rms_x"] is not None else None,
            "vib_rms_y": round(row["vib_rms_y"], 4) if row["vib_rms_y"] is not None else None,
            "vib_rms_z": round(row["vib_rms_z"], 4) if row["vib_rms_z"] is not None else None,
            "anomaly_score": round(row["anomaly_score"], 4) if row["anomaly_score"] is not None else None,
            "dominant_freq": round(row["dominant_freq"], 2) if row["dominant_freq"] is not None else None,
            "crest_factor": round(row["crest_factor"], 2) if row["crest_factor"] is not None else None,
            "temperature_1": round(row["temperature_1"], 1) if row["temperature_1"] is not None else None,
            "current_rms": round(row["current_rms"], 2) if row["current_rms"] is not None else None,
            "energy_kwh": round(row["energy_kwh"], 2) if row["energy_kwh"] is not None else None,
            "grid_power_w": round(row["grid_power_w"], 1) if row["grid_power_w"] is not None else None,
            "solar_power_w": round(row["solar_power_w"], 1) if row["solar_power_w"] is not None else None,
            "channel_1_w": round(row["channel_1_w"], 1) if row["channel_1_w"] is not None else None,
            "channel_2_w": round(row["channel_2_w"], 1) if row["channel_2_w"] is not None else None,
            "channel_3_w": round(row["channel_3_w"], 1) if row["channel_3_w"] is not None else None,
            "channel_4_w": round(row["channel_4_w"], 1) if row["channel_4_w"] is not None else None,
            "voltage_v": round(row["voltage_v"], 1) if row["voltage_v"] is not None else None,
            "power_factor": round(row["power_factor"], 3) if row["power_factor"] is not None else None,
        }
        for row in rows
    ]


# --- WebSocket for live telemetry push ---

class ConnectionManager:
    """Manages active WebSocket connections."""

    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        data = json.dumps(message, default=str)
        for connection in self.active_connections:
            try:
                await connection.send_text(data)
            except Exception:
                pass


ws_manager = ConnectionManager()


@router.websocket("/ws/telemetry")
async def websocket_telemetry(websocket: WebSocket):
    """WebSocket endpoint for real-time telemetry updates.

    Clients connect and receive telemetry broadcasts pushed by the MQTT consumer.
    """
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, ignore client messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
