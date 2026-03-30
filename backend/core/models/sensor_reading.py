"""SensorReading model — TimescaleDB hypertable for telemetry."""

import uuid
from datetime import datetime

from sqlalchemy import Real, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base


class SensorReading(Base):
    __tablename__ = "sensor_readings"

    # Composite primary key for hypertable (time + node_id)
    time: Mapped[datetime] = mapped_column(primary_key=True)
    node_id: Mapped[str] = mapped_column(String, primary_key=True)

    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    node_type: Mapped[str] = mapped_column(String, nullable=False, server_default="vibesense")

    # Common
    temperature_1: Mapped[float | None] = mapped_column(Real, nullable=True)

    # VibeSense
    vib_rms_x: Mapped[float | None] = mapped_column(Real, nullable=True)
    vib_rms_y: Mapped[float | None] = mapped_column(Real, nullable=True)
    vib_rms_z: Mapped[float | None] = mapped_column(Real, nullable=True)
    dominant_freq: Mapped[float | None] = mapped_column(Real, nullable=True)
    crest_factor: Mapped[float | None] = mapped_column(Real, nullable=True)
    anomaly_score: Mapped[float | None] = mapped_column(Real, nullable=True)

    # EnergySense
    grid_power_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    solar_power_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    channel_1_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    channel_2_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    channel_3_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    channel_4_w: Mapped[float | None] = mapped_column(Real, nullable=True)
    voltage_v: Mapped[float | None] = mapped_column(Real, nullable=True)
    power_factor: Mapped[float | None] = mapped_column(Real, nullable=True)

    # Shared
    current_rms: Mapped[float | None] = mapped_column(Real, nullable=True)
    energy_kwh: Mapped[float | None] = mapped_column(Real, nullable=True)
