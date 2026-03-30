"""Machine management routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.schemas.machine import MachineCreate, MachineResponse, MachineUpdate
from core.services import machine_service

router = APIRouter()


@router.get("/", response_model=list[MachineResponse])
async def list_machines(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """List all machines for the current tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    return await machine_service.list_machines(db)


@router.get("/{machine_id}", response_model=MachineResponse)
async def get_machine(
    machine_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    """Get a specific machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return machine


@router.post("/", response_model=MachineResponse, status_code=201)
async def create_machine(
    data: MachineCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    """Create a new machine."""
    await set_tenant_context(db, str(user.tenant_id))
    return await machine_service.create_machine(db, user.tenant_id, data)


@router.patch("/{machine_id}", response_model=MachineResponse)
async def update_machine(
    machine_id: uuid.UUID,
    data: MachineUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Update a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return await machine_service.update_machine(db, machine, data)


@router.delete("/{machine_id}", status_code=204)
async def delete_machine(
    machine_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    """Delete a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    await machine_service.delete_machine(db, machine)


@router.get("/{machine_id}/telemetry")
async def get_machine_telemetry(
    machine_id: uuid.UUID,
    hours: int = 24,
    user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    """Get recent telemetry data for a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return await machine_service.get_machine_telemetry(db, machine_id, hours)
