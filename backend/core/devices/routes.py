"""Sensor node management routes."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.models.sensor_node import SensorNode

router = APIRouter()


@router.get("/")
async def list_nodes(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all sensor nodes for the current tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    result = await db.execute(
        select(SensorNode).order_by(SensorNode.id)
    )
    return result.scalars().all()


@router.get("/{node_id}")
async def get_node(node_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get details for a specific sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    result = await db.execute(
        select(SensorNode).where(SensorNode.id == node_id)
    )
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node
