"""Sensor node management routes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.sensor_node import SensorNodeCreate, SensorNodeResponse, SensorNodeUpdate
from core.services import device_service

router = APIRouter()

AdminUser = Annotated[User, Depends(require_role("admin", "manager"))]


class AssignRequest(BaseModel):
    machine_id: uuid.UUID | None = None


@router.get("/", response_model=list[SensorNodeResponse])
async def list_nodes(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all sensor nodes for the current tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    return await device_service.list_nodes(db)


@router.get("/{node_id}", response_model=SensorNodeResponse)
async def get_node(node_id: str, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get details for a specific sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    node = await device_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return node


@router.post("/", response_model=SensorNodeResponse, status_code=201)
async def create_node(
    data: SensorNodeCreate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    return await device_service.create_node(db, user.tenant_id, data)


@router.patch("/{node_id}", response_model=SensorNodeResponse)
async def update_node(
    node_id: str,
    data: SensorNodeUpdate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Update a sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    node = await device_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return await device_service.update_node(db, node, data)


@router.delete("/{node_id}", status_code=204)
async def delete_node(
    node_id: str,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a sensor node."""
    await set_tenant_context(db, str(user.tenant_id))
    node = await device_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    await device_service.delete_node(db, node)


@router.patch("/{node_id}/assign", response_model=SensorNodeResponse)
async def assign_node(
    node_id: str,
    data: AssignRequest,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Assign or unassign a sensor node to/from a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    node = await device_service.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="Node not found")
    return await device_service.assign_to_machine(db, node, data.machine_id)
