"""MQTT consumer — ingests sensor telemetry into TimescaleDB."""

import asyncio
import json
import logging
from datetime import datetime, timezone

import aiomqtt

from sqlalchemy import update

from core.config import settings
from core.database import async_session
from core.models.sensor_node import SensorNode
from core.models.sensor_reading import SensorReading

logger = logging.getLogger(__name__)


class MQTTService:
    """Background service that consumes MQTT sensor telemetry."""

    def __init__(self):
        self._task: asyncio.Task | None = None

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _run(self):
        """Main MQTT consumer loop with auto-reconnect."""
        while True:
            try:
                async with aiomqtt.Client(
                    hostname=settings.mqtt_host,
                    port=settings.mqtt_port,
                    username=settings.mqtt_user or None,
                    password=settings.mqtt_password or None,
                ) as client:
                    await client.subscribe("factory/+/machine/+/telemetry")
                    await client.subscribe("home/+/telemetry")
                    logger.info("MQTT subscribed to telemetry topics")

                    async for message in client.messages:
                        try:
                            await self._handle_message(message)
                        except Exception:
                            logger.exception("Error handling MQTT message")

            except aiomqtt.MqttError as e:
                logger.warning(f"MQTT connection lost: {e}. Reconnecting in 5s...")
                await asyncio.sleep(5)
            except asyncio.CancelledError:
                logger.info("MQTT consumer stopped")
                return

    async def _handle_message(self, message: aiomqtt.Message):
        """Parse and store a telemetry message."""
        payload = json.loads(message.payload)

        vibration = payload.get("vibration", {})
        power = payload.get("power", {})

        reading = SensorReading(
            time=datetime.fromtimestamp(
                payload.get("ts", datetime.now(timezone.utc).timestamp()),
                tz=timezone.utc,
            ),
            tenant_id=payload.get("tenant_id"),
            node_id=payload.get("node_id"),
            node_type=payload.get("node_type", "vibesense"),
            # VibeSense
            vib_rms_x=vibration.get("rms_x"),
            vib_rms_y=vibration.get("rms_y"),
            vib_rms_z=vibration.get("rms_z"),
            dominant_freq=vibration.get("dominant_freq"),
            crest_factor=vibration.get("crest_factor"),
            anomaly_score=vibration.get("anomaly_score"),
            # Power (shared)
            current_rms=power.get("current_rms"),
            energy_kwh=power.get("energy_kwh"),
            power_factor=power.get("power_factor"),
            temperature_1=payload.get("temp"),
            # EnergySense
            grid_power_w=payload.get("grid_power_w"),
            solar_power_w=payload.get("solar_power_w"),
            channel_1_w=payload.get("channel_1_w"),
            channel_2_w=payload.get("channel_2_w"),
            channel_3_w=payload.get("channel_3_w"),
            channel_4_w=payload.get("channel_4_w"),
            voltage_v=payload.get("voltage_v"),
        )

        async with async_session() as session:
            session.add(reading)
            # Update sensor node last_seen timestamp
            node_id = payload.get("node_id")
            if node_id:
                await session.execute(
                    update(SensorNode)
                    .where(SensorNode.id == node_id)
                    .values(last_seen=reading.time)
                )
            await session.commit()

        # Broadcast to WebSocket clients
        try:
            from core.api.dashboard import ws_manager

            await ws_manager.broadcast({
                "type": "telemetry",
                "node_id": payload.get("node_id"),
                "node_type": payload.get("node_type", "vibesense"),
                "time": reading.time.isoformat(),
                "data": {
                    k: v for k, v in payload.items()
                    if k not in ("ts", "tenant_id", "node_id", "node_type")
                },
            })
        except Exception:
            pass  # Don't let WS errors affect ingestion

        logger.debug(f"Stored telemetry from {payload.get('node_id')}")


mqtt_service = MQTTService()
