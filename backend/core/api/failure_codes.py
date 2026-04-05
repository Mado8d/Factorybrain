"""Failure code routes — taxonomy CRUD + seeding."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.failure_code import FailureCodeCreate, FailureCodeResponse, FailureCodeUpdate
from core.services import failure_code_service

router = APIRouter()
AdminUser = Annotated[User, Depends(require_role("admin", "manager", "superadmin"))]


@router.get("/", response_model=list[FailureCodeResponse])
async def list_codes(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    level: str | None = None,
    parent_id: str | None = None,
):
    """List failure codes. Without params, returns top-level (problems) with children."""
    await set_tenant_context(db, str(user.tenant_id))
    if parent_id:
        return await failure_code_service.list_failure_codes(db, level, uuid.UUID(parent_id))
    if level:
        return await failure_code_service.list_failure_codes(db, level)
    # Full taxonomy tree
    return await failure_code_service.get_full_taxonomy(db)


@router.post("/", response_model=FailureCodeResponse, status_code=201)
async def create_code(
    data: FailureCodeCreate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await failure_code_service.create_failure_code(db, user.tenant_id, data)


@router.patch("/{code_id}", response_model=FailureCodeResponse)
async def update_code(
    code_id: uuid.UUID,
    data: FailureCodeUpdate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    code = await failure_code_service.get_failure_code(db, code_id)
    if not code:
        raise HTTPException(status_code=404, detail="Failure code not found")
    return await failure_code_service.update_failure_code(db, code, data)


@router.post("/seed-defaults")
async def seed_defaults(
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Seed default ISO 14224-inspired failure codes for this tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    existing = await failure_code_service.get_full_taxonomy(db)
    if existing:
        raise HTTPException(status_code=400, detail="Failure codes already exist. Delete existing codes first.")
    await failure_code_service.seed_default_codes(db, user.tenant_id)
    return {"message": "Default failure codes created"}
