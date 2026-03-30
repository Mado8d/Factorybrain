"""Maintenance routes — alerts, work orders, service providers."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.schemas.maintenance import (
    AlertCreate,
    AlertResponse,
    AlertUpdate,
    ServiceProviderCreate,
    ServiceProviderResponse,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from core.services import maintenance_service

router = APIRouter()


# --- Alerts ---

@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    status: str | None = None,
    user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_alerts(db, status)


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def get_alert(
    alert_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    alert = await maintenance_service.get_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/alerts", response_model=AlertResponse, status_code=201)
async def create_alert(
    data: AlertCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_alert(db, user.tenant_id, data)


@router.patch("/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: uuid.UUID,
    data: AlertUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    alert = await maintenance_service.get_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await maintenance_service.update_alert(db, alert, data)


# --- Work Orders ---

@router.get("/work-orders", response_model=list[WorkOrderResponse])
async def list_work_orders(
    status: str | None = None,
    user: CurrentUser = None,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_work_orders(db, status)


@router.get("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def get_work_order(
    wo_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@router.post("/work-orders", response_model=WorkOrderResponse, status_code=201)
async def create_work_order(
    data: WorkOrderCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_work_order(db, user.tenant_id, data)


@router.patch("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def update_work_order(
    wo_id: uuid.UUID,
    data: WorkOrderUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return await maintenance_service.update_work_order(db, wo, data)


# --- Service Providers ---

@router.get("/providers", response_model=list[ServiceProviderResponse])
async def list_providers(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_service_providers(db)


@router.post("/providers", response_model=ServiceProviderResponse, status_code=201)
async def create_provider(
    data: ServiceProviderCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_service_provider(db, user.tenant_id, data)
