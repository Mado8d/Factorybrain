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
from core.schemas.telemetry import DashboardKPIs
from core.services import dashboard_service, machine_service

logger = logging.getLogger(__name__)
router = APIRouter()


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
    hours: int = Query(24, ge=1, le=168),
):
    """Get telemetry time-series for charts. Optionally filter by node_id or node_type."""
    await set_tenant_context(db, str(user.tenant_id))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    query = (
        select(SensorReading)
        .where(SensorReading.time >= since)
        .order_by(SensorReading.time.asc())
    )
    if node_id:
        query = query.where(SensorReading.node_id == node_id)
    if node_type:
        query = query.where(SensorReading.node_type == node_type)

    query = query.limit(2000)
    result = await db.execute(query)
    rows = result.scalars().all()

    return [
        {
            "time": r.time.isoformat(),
            "node_id": r.node_id,
            "node_type": r.node_type,
            "vib_rms_x": r.vib_rms_x,
            "vib_rms_y": r.vib_rms_y,
            "vib_rms_z": r.vib_rms_z,
            "anomaly_score": r.anomaly_score,
            "dominant_freq": r.dominant_freq,
            "crest_factor": r.crest_factor,
            "temperature_1": r.temperature_1,
            "current_rms": r.current_rms,
            "energy_kwh": r.energy_kwh,
            "grid_power_w": r.grid_power_w,
            "solar_power_w": r.solar_power_w,
            "channel_1_w": r.channel_1_w,
            "channel_2_w": r.channel_2_w,
            "channel_3_w": r.channel_3_w,
            "channel_4_w": r.channel_4_w,
            "voltage_v": r.voltage_v,
            "power_factor": r.power_factor,
        }
        for r in rows
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
