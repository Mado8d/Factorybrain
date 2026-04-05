"""Shift handover routes."""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.services import shift_service

router = APIRouter()


# --- Schemas ---


class HandoverCreate(BaseModel):
    plant_id: uuid.UUID | None = None
    shift_date: date
    shift_type: str  # morning, afternoon, night


class HandoverUpdate(BaseModel):
    events: list[dict] | None = None
    open_items: list[dict] | None = None
    safety_notes: str | None = None
    production_notes: str | None = None


class HandoverResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    plant_id: uuid.UUID | None = None
    shift_date: date
    shift_type: str
    machine_statuses: list = []
    active_work_orders: list = []
    active_alerts: list = []
    sensor_anomalies: list = []
    shift_activity: dict = {}
    events: list = []
    open_items: list = []
    safety_notes: str | None = None
    production_notes: str | None = None
    ai_summary: str | None = None
    outgoing_user_id: uuid.UUID | None = None
    outgoing_signed_at: str | None = None
    incoming_user_id: uuid.UUID | None = None
    incoming_acknowledged_at: str | None = None
    is_locked: bool = False
    created_at: str

    model_config = {"from_attributes": True}


# --- Routes ---


@router.get("/", response_model=list[HandoverResponse])
async def list_handovers(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    plant_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
):
    await set_tenant_context(db, str(user.tenant_id))
    return await shift_service.list_handovers(db, plant_id, limit, offset)


@router.get("/{handover_id}", response_model=HandoverResponse)
async def get_handover(
    handover_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    handover = await shift_service.get_handover(db, handover_id)
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    return handover


@router.post("/", response_model=HandoverResponse, status_code=201)
async def create_handover(
    data: HandoverCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await shift_service.create_handover(
        db, user.tenant_id, data.plant_id, data.shift_date, data.shift_type, user.id
    )


@router.patch("/{handover_id}", response_model=HandoverResponse)
async def update_handover(
    handover_id: uuid.UUID,
    data: HandoverUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    handover = await shift_service.get_handover(db, handover_id)
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    if handover.is_locked:
        raise HTTPException(status_code=400, detail="Handover is locked")
    return await shift_service.update_handover(db, handover, data.model_dump(exclude_unset=True))


@router.post("/{handover_id}/sign-outgoing", response_model=HandoverResponse)
async def sign_outgoing(
    handover_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    handover = await shift_service.get_handover(db, handover_id)
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    if handover.outgoing_signed_at:
        raise HTTPException(status_code=400, detail="Already signed by outgoing user")
    return await shift_service.sign_outgoing(db, handover, user.id)


@router.post("/{handover_id}/acknowledge-incoming", response_model=HandoverResponse)
async def acknowledge_incoming(
    handover_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    handover = await shift_service.get_handover(db, handover_id)
    if not handover:
        raise HTTPException(status_code=404, detail="Handover not found")
    if not handover.outgoing_signed_at:
        raise HTTPException(status_code=400, detail="Outgoing user must sign first")
    if handover.incoming_acknowledged_at:
        raise HTTPException(status_code=400, detail="Already acknowledged")
    return await shift_service.acknowledge_incoming(db, handover, user.id)
