"""Preventive Maintenance Schedule API routes."""

import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.maintenance import (
    PMOccurrenceResponse,
    PMScheduleCreate,
    PMScheduleResponse,
    PMScheduleUpdate,
    PMTemplateResponse,
)
from core.services import pm_schedule_service
from core.services.pm_templates import PM_TEMPLATES

router = APIRouter()

AdminUser = Annotated[User, Depends(require_role("admin", "manager"))]


class SkipRequest(BaseModel):
    reason: str


class FromTemplateRequest(BaseModel):
    template_id: str
    machine_id: uuid.UUID


@router.get("/", response_model=list[PMScheduleResponse])
async def list_schedules(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    machine_id: uuid.UUID | None = Query(None),
    is_active: bool | None = Query(None),
    trigger_type: str | None = Query(None),
):
    """List all PM schedules."""
    await set_tenant_context(db, str(user.tenant_id))
    return await pm_schedule_service.list_pm_schedules(db, machine_id, is_active, trigger_type)


@router.get("/due-today", response_model=list[PMScheduleResponse])
async def get_due_today(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get PM schedules that are due today or overdue."""
    await set_tenant_context(db, str(user.tenant_id))
    return await pm_schedule_service.get_due_today(db)


@router.get("/templates", response_model=list[PMTemplateResponse])
async def get_templates():
    """Get pre-built PM templates."""
    return PM_TEMPLATES


@router.get("/compliance")
async def get_compliance(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    period_start: date | None = Query(None),
    period_end: date | None = Query(None),
):
    """Get PM compliance statistics."""
    await set_tenant_context(db, str(user.tenant_id))
    return await pm_schedule_service.get_compliance_stats(db, period_start, period_end)


@router.post("/", response_model=PMScheduleResponse, status_code=201)
async def create_schedule(
    data: PMScheduleCreate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new PM schedule."""
    await set_tenant_context(db, str(user.tenant_id))
    return await pm_schedule_service.create_pm_schedule(db, user.tenant_id, data, user.id)


@router.post("/from-template", response_model=PMScheduleResponse, status_code=201)
async def create_from_template(
    data: FromTemplateRequest,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a PM schedule from a pre-built template."""
    await set_tenant_context(db, str(user.tenant_id))
    try:
        return await pm_schedule_service.create_from_template(
            db, user.tenant_id, data.template_id, data.machine_id, user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{schedule_id}", response_model=PMScheduleResponse)
async def get_schedule(schedule_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get a single PM schedule."""
    await set_tenant_context(db, str(user.tenant_id))
    schedule = await pm_schedule_service.get_pm_schedule(db, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="PM schedule not found")
    return schedule


@router.patch("/{schedule_id}", response_model=PMScheduleResponse)
async def update_schedule(
    schedule_id: uuid.UUID,
    data: PMScheduleUpdate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Update a PM schedule."""
    await set_tenant_context(db, str(user.tenant_id))
    schedule = await pm_schedule_service.get_pm_schedule(db, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="PM schedule not found")
    return await pm_schedule_service.update_pm_schedule(db, schedule, data)


@router.delete("/{schedule_id}", status_code=204)
async def delete_schedule(
    schedule_id: uuid.UUID,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Deactivate a PM schedule (soft delete)."""
    await set_tenant_context(db, str(user.tenant_id))
    schedule = await pm_schedule_service.get_pm_schedule(db, schedule_id)
    if not schedule:
        raise HTTPException(status_code=404, detail="PM schedule not found")
    await pm_schedule_service.delete_pm_schedule(db, schedule)


@router.get("/{schedule_id}/occurrences", response_model=list[PMOccurrenceResponse])
async def get_occurrences(schedule_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get occurrence history for a PM schedule."""
    await set_tenant_context(db, str(user.tenant_id))
    return await pm_schedule_service.get_occurrences(db, schedule_id)


@router.post("/{schedule_id}/occurrences/{occurrence_id}/skip")
async def skip_occurrence(
    schedule_id: uuid.UUID,
    occurrence_id: uuid.UUID,
    data: SkipRequest,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Skip a PM occurrence with a reason."""
    await set_tenant_context(db, str(user.tenant_id))
    occurrence = await pm_schedule_service.get_occurrence(db, occurrence_id)
    if not occurrence or occurrence.schedule_id != schedule_id:
        raise HTTPException(status_code=404, detail="Occurrence not found")
    if occurrence.status not in ("upcoming", "due"):
        raise HTTPException(status_code=400, detail="Cannot skip a completed/already skipped occurrence")
    result = await pm_schedule_service.skip_occurrence(db, occurrence, data.reason)
    return {
        "status": "skipped",
        "reason": data.reason,
        "next_due_date": str(result.schedule.next_due_date) if result.schedule else None,
    }
