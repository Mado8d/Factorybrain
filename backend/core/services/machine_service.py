"""Machine CRUD service."""

import uuid
from datetime import timedelta

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import utcnow
from core.models.machine import Machine
from core.models.sensor_reading import SensorReading
from core.schemas.machine import MachineCreate, MachineUpdate
from core.services import audit_service


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
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="create",
        resource_type="machine",
        resource_id=str(machine.id),
        changes={"name": machine.name},
    )
    return machine


async def update_machine(db: AsyncSession, machine: Machine, data: MachineUpdate) -> Machine:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(machine, field, value)
    machine.updated_at = utcnow()
    await db.flush()
    await db.refresh(machine)
    await audit_service.log_action(
        db,
        machine.tenant_id,
        user_id=None,
        action="update",
        resource_type="machine",
        resource_id=str(machine.id),
        changes=updates,
    )
    return machine


async def delete_machine(db: AsyncSession, machine: Machine) -> None:
    tenant_id = machine.tenant_id
    machine_id = str(machine.id)
    machine_name = machine.name
    await db.delete(machine)
    await db.flush()
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="delete",
        resource_type="machine",
        resource_id=machine_id,
        changes={"name": machine_name},
    )


async def get_machine_telemetry(db: AsyncSession, machine_id: uuid.UUID, hours: int = 24) -> list:
    """Get recent telemetry for all sensor nodes attached to a machine."""
    since = utcnow() - timedelta(hours=hours)
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
