"""Technician scheduling routes — skills, availability, smart assignment."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.services import scheduling_service, maintenance_service

router = APIRouter()

AdminUser = Annotated[User, Depends(require_role("admin", "manager", "superadmin"))]


# --- Schemas ---

class SkillSet(BaseModel):
    user_id: uuid.UUID
    skill_type: str
    level: int = 1
    is_certified: bool = False
    certification_expiry: date | None = None


class SkillResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    skill_type: str
    level: int
    is_certified: bool
    certification_name: str | None
    certification_expiry: date | None
    created_at: object  # datetime

    model_config = {"from_attributes": True}


class MachineRequirementSet(BaseModel):
    skill_type: str
    min_level: int = 1


class MachineRequirementResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    machine_id: uuid.UUID
    skill_type: str
    min_level: int
    created_at: object  # datetime

    model_config = {"from_attributes": True}


class AvailabilitySet(BaseModel):
    user_id: uuid.UUID
    date: date
    shift_type: str | None = None
    status: str
    notes: str | None = None


class AvailabilityResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    user_id: uuid.UUID
    date: date
    shift_type: str | None
    status: str
    notes: str | None
    created_at: object  # datetime

    model_config = {"from_attributes": True}


# --- Skills ---

@router.get("/skills", response_model=list[SkillResponse])
async def list_skills(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    user_id: uuid.UUID | None = None,
):
    """List technician skills, optionally filtered by user_id."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.list_skills(db, user_id)


@router.post("/skills", response_model=SkillResponse, status_code=201)
async def set_skill(
    data: SkillSet,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create or update a technician skill."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.set_skill(
        db,
        user.tenant_id,
        data.user_id,
        data.skill_type,
        data.level,
        data.is_certified,
        data.certification_expiry,
    )


@router.delete("/skills/{skill_id}", status_code=204)
async def delete_skill(
    skill_id: uuid.UUID,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Remove a technician skill."""
    await set_tenant_context(db, str(user.tenant_id))
    skill = await scheduling_service.get_skill(db, skill_id)
    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")
    await scheduling_service.delete_skill(db, skill)


# --- Machine Requirements ---

@router.get("/machines/{machine_id}/requirements", response_model=list[MachineRequirementResponse])
async def list_machine_requirements(
    machine_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get skill requirements for a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.list_machine_requirements(db, machine_id)


@router.post("/machines/{machine_id}/requirements", response_model=MachineRequirementResponse, status_code=201)
async def set_machine_requirement(
    machine_id: uuid.UUID,
    data: MachineRequirementSet,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Set or update a skill requirement for a machine."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.set_machine_requirement(
        db, user.tenant_id, machine_id, data.skill_type, data.min_level
    )


# --- Availability ---

@router.get("/availability", response_model=list[AvailabilityResponse])
async def list_availability(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    date_from: date = Query(...),
    date_to: date = Query(...),
    user_id: uuid.UUID | None = None,
):
    """List technician availability for a date range."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.list_availability(db, date_from, date_to, user_id)


@router.post("/availability", response_model=AvailabilityResponse, status_code=201)
async def set_availability(
    data: AvailabilitySet,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Set or update technician availability."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.set_availability(
        db, user.tenant_id, data.user_id, data.date, data.shift_type, data.status, data.notes
    )


# --- Smart Assignment ---

@router.get("/suggest-assignment/{wo_id}")
async def suggest_assignment(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get ranked technician suggestions for a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return await scheduling_service.suggest_assignment(db, user.tenant_id, wo)


# --- Team Workload ---

@router.get("/team-workload")
async def get_team_workload(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    date_from: date = Query(...),
    date_to: date = Query(...),
):
    """Get workload overview — active work orders per technician."""
    await set_tenant_context(db, str(user.tenant_id))
    return await scheduling_service.get_team_workload(db, user.tenant_id, date_from, date_to)
