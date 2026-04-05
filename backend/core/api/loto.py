"""LOTO (Lock-Out/Tag-Out) safety routes."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.services import loto_service

router = APIRouter()

AdminOrManager = Annotated[User, Depends(require_role("admin", "manager"))]


# --- Schemas ---

class ProcedureCreate(BaseModel):
    machine_id: uuid.UUID
    name: str
    energy_sources: list[dict]  # [{type, location, isolation_method, verification_method, photo_url?}]
    ppe_required: list[str] | None = None
    special_instructions: str | None = None


class ProcedureUpdate(BaseModel):
    name: str | None = None
    energy_sources: list[dict] | None = None
    ppe_required: list[str] | None = None
    special_instructions: str | None = None
    is_active: bool | None = None
    version: int | None = None


class ProcedureResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    machine_id: uuid.UUID
    name: str
    version: int
    energy_sources: list
    ppe_required: list[str] | None = None
    special_instructions: str | None = None
    is_active: bool
    approved_by: uuid.UUID | None = None
    approved_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class PermitCreate(BaseModel):
    work_order_id: uuid.UUID
    procedure_id: uuid.UUID


class LockStepRequest(BaseModel):
    step_idx: int
    lock_id: str


class UnlockStepRequest(BaseModel):
    step_idx: int


class PermitResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    work_order_id: uuid.UUID
    procedure_id: uuid.UUID
    status: str
    requested_by: uuid.UUID
    authorized_by: uuid.UUID | None = None
    authorized_at: str | None = None
    isolation_steps: list
    all_locked_at: str | None = None
    work_started_at: str | None = None
    work_completed_at: str | None = None
    all_unlocked_at: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class LOTOClearanceResponse(BaseModel):
    work_order_id: uuid.UUID
    cleared: bool


# --- Procedure Routes ---

@router.get("/loto-procedures", response_model=list[ProcedureResponse])
async def list_procedures(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    machine_id: uuid.UUID | None = None,
):
    await set_tenant_context(db, str(user.tenant_id))
    return await loto_service.list_procedures(db, machine_id)


@router.post("/loto-procedures", response_model=ProcedureResponse, status_code=201)
async def create_procedure(
    data: ProcedureCreate,
    user: AdminOrManager,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await loto_service.create_procedure(
        db, user.tenant_id, data.model_dump(exclude_unset=True)
    )


@router.patch("/loto-procedures/{procedure_id}", response_model=ProcedureResponse)
async def update_procedure(
    procedure_id: uuid.UUID,
    data: ProcedureUpdate,
    user: AdminOrManager,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    procedure = await loto_service.get_procedure(db, procedure_id)
    if not procedure:
        raise HTTPException(status_code=404, detail="Procedure not found")
    return await loto_service.update_procedure(
        db, procedure, data.model_dump(exclude_unset=True)
    )


@router.get("/loto-procedures/machine/{machine_id}", response_model=list[ProcedureResponse])
async def get_procedures_for_machine(
    machine_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await loto_service.list_procedures(db, machine_id)


# --- Permit Routes ---

@router.post("/loto-permits", response_model=PermitResponse, status_code=201)
async def create_permit(
    data: PermitCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    try:
        return await loto_service.create_permit(
            db, user.tenant_id, data.work_order_id, data.procedure_id, user.id
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/loto-permits/{permit_id}/authorize", response_model=PermitResponse)
async def authorize_permit(
    permit_id: uuid.UUID,
    user: AdminOrManager,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    permit = await loto_service.get_permit(db, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    if permit.status != "draft":
        raise HTTPException(status_code=400, detail="Permit already authorized or completed")
    return await loto_service.authorize_permit(db, permit, user.id)


@router.post("/loto-permits/{permit_id}/lock-step", response_model=PermitResponse)
async def lock_step(
    permit_id: uuid.UUID,
    data: LockStepRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    permit = await loto_service.get_permit(db, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    if permit.status not in ("active", "work_in_progress"):
        raise HTTPException(status_code=400, detail="Permit must be active to lock steps")
    try:
        return await loto_service.lock_step(db, permit, data.step_idx, user.id, data.lock_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/loto-permits/{permit_id}/unlock-step", response_model=PermitResponse)
async def unlock_step(
    permit_id: uuid.UUID,
    data: UnlockStepRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    permit = await loto_service.get_permit(db, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    if permit.status != "work_in_progress":
        raise HTTPException(status_code=400, detail="Permit must be in work_in_progress to unlock")
    try:
        return await loto_service.unlock_step(db, permit, data.step_idx, user.id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/loto-permits/{permit_id}/complete", response_model=PermitResponse)
async def complete_permit(
    permit_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    permit = await loto_service.get_permit(db, permit_id)
    if not permit:
        raise HTTPException(status_code=404, detail="Permit not found")
    if permit.status != "work_in_progress":
        raise HTTPException(status_code=400, detail="Permit must be in work_in_progress to complete")
    try:
        return await loto_service.complete_permit(db, permit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/loto-permits/work-order/{wo_id}", response_model=PermitResponse | None)
async def get_permit_for_wo(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    permit = await loto_service.get_permit_for_wo(db, wo_id)
    if not permit:
        return None
    return permit
