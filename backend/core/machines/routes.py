"""Machine management routes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.machine import MachineCreate, MachineResponse, MachineUpdate
from core.services import machine_service

router = APIRouter()

AdminUser = Annotated[User, Depends(require_role("admin", "manager"))]


class ThresholdOverrides(BaseModel):
    vibration_warning: float | None = None
    vibration_critical: float | None = None
    anomaly_warning: float | None = None
    anomaly_critical: float | None = None
    temperature_warning: float | None = None
    temperature_critical: float | None = None
    current_warning: float | None = None
    current_critical: float | None = None


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


@router.get("/{machine_id}/thresholds")
async def get_machine_thresholds(
    machine_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    """Get effective thresholds for a machine (tenant defaults merged with machine overrides)."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    # Get tenant defaults
    from core.schemas.tenant import DEFAULT_TENANT_SETTINGS
    tenant_thresholds = DEFAULT_TENANT_SETTINGS["thresholds"].copy()
    if user.tenant and user.tenant.settings:
        tenant_thresholds.update(user.tenant.settings.get("thresholds", {}))

    # Get machine overrides
    machine_overrides = (machine.specifications or {}).get("thresholds", {})

    # Build response: effective = tenant defaults + machine overrides
    effective = {}
    for key in tenant_thresholds:
        override = machine_overrides.get(key)
        effective[key] = {
            "value": override if override is not None else tenant_thresholds[key],
            "is_custom": override is not None,
            "default": tenant_thresholds[key],
        }

    return effective


@router.put("/{machine_id}/thresholds")
async def update_machine_thresholds(
    machine_id: uuid.UUID,
    data: ThresholdOverrides,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Set per-machine threshold overrides. Pass null to reset to tenant default."""
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    specs = machine.specifications or {}
    overrides = specs.get("thresholds", {})

    for field, value in data.model_dump(exclude_unset=True).items():
        if value is None:
            overrides.pop(field, None)
        else:
            overrides[field] = value

    specs["thresholds"] = overrides
    from core.schemas.machine import MachineUpdate as MU
    await machine_service.update_machine(db, machine, MU(specifications=specs))

    # Return effective thresholds
    from core.schemas.tenant import DEFAULT_TENANT_SETTINGS
    tenant_thresholds = DEFAULT_TENANT_SETTINGS["thresholds"].copy()
    if user.tenant and user.tenant.settings:
        tenant_thresholds.update(user.tenant.settings.get("thresholds", {}))

    effective = {}
    for key in tenant_thresholds:
        override = overrides.get(key)
        effective[key] = {
            "value": override if override is not None else tenant_thresholds[key],
            "is_custom": override is not None,
            "default": tenant_thresholds[key],
        }
    return effective


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
