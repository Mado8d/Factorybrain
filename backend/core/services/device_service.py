"""Sensor node CRUD service."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.sensor_node import SensorNode
from core.schemas.sensor_node import SensorNodeCreate, SensorNodeUpdate


async def list_nodes(db: AsyncSession) -> list[SensorNode]:
    result = await db.execute(select(SensorNode).order_by(SensorNode.id))
    return list(result.scalars().all())


async def get_node(db: AsyncSession, node_id: str) -> SensorNode | None:
    result = await db.execute(select(SensorNode).where(SensorNode.id == node_id))
    return result.scalar_one_or_none()


async def create_node(
    db: AsyncSession, tenant_id: uuid.UUID, data: SensorNodeCreate
) -> SensorNode:
    node = SensorNode(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(node)
    await db.flush()
    await db.refresh(node)
    return node


async def update_node(
    db: AsyncSession, node: SensorNode, data: SensorNodeUpdate
) -> SensorNode:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(node, field, value)
    await db.flush()
    await db.refresh(node)
    return node


async def delete_node(db: AsyncSession, node: SensorNode) -> None:
    await db.delete(node)
    await db.flush()


async def assign_to_machine(
    db: AsyncSession, node: SensorNode, machine_id: uuid.UUID | None
) -> SensorNode:
    node.machine_id = machine_id
    await db.flush()
    await db.refresh(node)
    return node
