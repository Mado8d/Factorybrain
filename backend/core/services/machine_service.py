"""Machine CRUD service."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.machine import Machine
from core.models.sensor_reading import SensorReading
from core.schemas.machine import MachineCreate, MachineUpdate


async def list_machines(db: AsyncSession, limit: int = 100, offset: int = 0) -> list[Machine]:
    result = await db.execute(select(Machine).order_by(Machine.name).limit(limit).offset(offset))
    return list(result.scalars().all())


async def get_machine(db: AsyncSession, machine_id: uuid.UUID) -> Machine | None:
    result = await db.execute(select(Machine).where(Machine.id == machine_id))
    return result.scalar_one_or_none()


async def create_machine(db: AsyncSession, tenant_id: uuid.UUID, data: MachineCreate) -> Machine:
    machine = Machine(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(machine)
    await db.flush()
    await db.refresh(machine)
    return machine


async def update_machine(db: AsyncSession, machine: Machine, data: MachineUpdate) -> Machine:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(machine, field, value)
    machine.updated_at = datetime.now(UTC)
    await db.flush()
    await db.refresh(machine)
    return machine


async def delete_machine(db: AsyncSession, machine: Machine) -> None:
    await db.delete(machine)
    await db.flush()


async def get_machine_telemetry(db: AsyncSession, machine_id: uuid.UUID, hours: int = 24) -> list:
    """Get recent telemetry for all sensor nodes attached to a machine."""
    since = datetime.now(UTC) - timedelta(hours=hours)
    result = await db.execute(
        select(SensorReading)
        .join(
            Machine.__table__,
            text("sensor_nodes.machine_id = machines.id"),
        )
        .where(SensorReading.time >= since)
        .order_by(SensorReading.time.desc())
        .limit(500)
    )
    return list(result.scalars().all())


async def get_latest_telemetry_per_node(
    db: AsyncSession,
) -> dict[str, SensorReading]:
    """Get the most recent reading for each node (for dashboard KPIs)."""
    subq = (
        select(
            SensorReading.node_id,
            func.max(SensorReading.time).label("latest"),
        )
        .group_by(SensorReading.node_id)
        .subquery()
    )
    result = await db.execute(
        select(SensorReading).join(
            subq,
            (SensorReading.node_id == subq.c.node_id) & (SensorReading.time == subq.c.latest),
        )
    )
    readings = result.scalars().all()
    return {r.node_id: r for r in readings}
