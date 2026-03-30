"""Tenant management routes."""

import copy
import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser, require_role
from core.database import get_db
from core.models.tenant import Tenant
from core.models.user import User
from core.schemas.tenant import (
    DEFAULT_TENANT_SETTINGS,
    TenantCreate,
    TenantResponse,
    TenantSettingsResponse,
    TenantSettingsUpdate,
    TenantUpdate,
)

router = APIRouter()

AdminUser = Depends(require_role("admin"))


def _merge_settings(stored: dict | None) -> dict:
    """Deep-merge stored settings with defaults so missing keys get filled."""
    result = copy.deepcopy(DEFAULT_TENANT_SETTINGS)
    if not stored:
        return result
    for key, value in stored.items():
        if isinstance(value, dict) and isinstance(result.get(key), dict):
            result[key].update(value)
        else:
            result[key] = value
    return result


# --- Tenant settings (any authenticated user can read their own tenant) ---

@router.get("/settings", response_model=TenantSettingsResponse)
async def get_tenant_settings(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    """Get settings for the current user's tenant (merged with defaults)."""
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return TenantSettingsResponse(settings=_merge_settings(tenant.settings))


@router.put("/settings", response_model=TenantSettingsResponse)
async def update_tenant_settings(
    data: TenantSettingsUpdate,
    user: User = Depends(require_role("admin", "manager")),
    db: AsyncSession = Depends(get_db),
):
    """Update settings for the current user's tenant. Admin/manager only."""
    result = await db.execute(select(Tenant).where(Tenant.id == user.tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    # Deep-merge incoming updates with existing settings
    current = tenant.settings or {}
    updates = data.model_dump(exclude_unset=True)

    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(current.get(key), dict):
            current[key].update(value)
        else:
            current[key] = value

    tenant.settings = current
    await db.flush()
    await db.refresh(tenant)
    return TenantSettingsResponse(settings=_merge_settings(tenant.settings))


# --- Admin CRUD ---

@router.get("/", response_model=list[TenantResponse])
async def list_tenants(user: User = AdminUser, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Tenant).order_by(Tenant.name))
    return result.scalars().all()


@router.get("/{tenant_id}", response_model=TenantResponse)
async def get_tenant(
    tenant_id: uuid.UUID, user: User = AdminUser, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    return tenant


@router.post("/", response_model=TenantResponse, status_code=201)
async def create_tenant(
    data: TenantCreate, user: User = AdminUser, db: AsyncSession = Depends(get_db)
):
    tenant = Tenant(**data.model_dump())
    db.add(tenant)
    await db.flush()
    await db.refresh(tenant)
    return tenant


@router.patch("/{tenant_id}", response_model=TenantResponse)
async def update_tenant(
    tenant_id: uuid.UUID,
    data: TenantUpdate,
    user: User = AdminUser,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(tenant, field, value)
    await db.flush()
    await db.refresh(tenant)
    return tenant
