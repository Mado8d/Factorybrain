"""Maintenance CRUD service — alerts, work orders."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.maintenance import (
    MaintenanceAlert,
    MaintenanceWorkOrder,
    ServiceProvider,
    SparePart,
)
from core.schemas.maintenance import (
    AlertCreate,
    AlertUpdate,
    ServiceProviderCreate,
    WorkOrderCreate,
    WorkOrderUpdate,
)


# --- Alerts ---

async def list_alerts(
    db: AsyncSession, status: str | None = None, limit: int = 100, offset: int = 0
) -> list[MaintenanceAlert]:
    query = select(MaintenanceAlert).order_by(MaintenanceAlert.created_at.desc())
    if status:
        query = query.where(MaintenanceAlert.status == status)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_alert(db: AsyncSession, alert_id: uuid.UUID) -> MaintenanceAlert | None:
    result = await db.execute(
        select(MaintenanceAlert).where(MaintenanceAlert.id == alert_id)
    )
    return result.scalar_one_or_none()


async def create_alert(
    db: AsyncSession, tenant_id: uuid.UUID, data: AlertCreate
) -> MaintenanceAlert:
    alert = MaintenanceAlert(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(alert)
    await db.flush()
    await db.refresh(alert)
    return alert


async def update_alert(
    db: AsyncSession, alert: MaintenanceAlert, data: AlertUpdate
) -> MaintenanceAlert:
    updates = data.model_dump(exclude_unset=True)
    if updates.get("status") == "acknowledged" and alert.status == "open":
        alert.acknowledged_at = datetime.now(timezone.utc)
    if updates.get("status") == "resolved":
        alert.resolved_at = datetime.now(timezone.utc)
    for field, value in updates.items():
        setattr(alert, field, value)
    await db.flush()
    await db.refresh(alert)
    return alert


async def count_alerts(db: AsyncSession, status: str | None = None) -> int:
    query = select(func.count()).select_from(MaintenanceAlert)
    if status:
        query = query.where(MaintenanceAlert.status == status)
    result = await db.execute(query)
    return result.scalar_one()


# --- Work Orders ---

async def list_work_orders(
    db: AsyncSession, status: str | None = None, limit: int = 100, offset: int = 0
) -> list[MaintenanceWorkOrder]:
    query = select(MaintenanceWorkOrder).order_by(
        MaintenanceWorkOrder.created_at.desc()
    )
    if status:
        query = query.where(MaintenanceWorkOrder.status == status)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_work_order(
    db: AsyncSession, wo_id: uuid.UUID
) -> MaintenanceWorkOrder | None:
    result = await db.execute(
        select(MaintenanceWorkOrder).where(MaintenanceWorkOrder.id == wo_id)
    )
    return result.scalar_one_or_none()


async def create_work_order(
    db: AsyncSession, tenant_id: uuid.UUID, data: WorkOrderCreate
) -> MaintenanceWorkOrder:
    # Generate WO number
    count = await db.execute(
        select(func.count()).select_from(MaintenanceWorkOrder)
    )
    next_num = count.scalar_one() + 1
    wo_number = f"WO-{next_num:05d}"

    wo = MaintenanceWorkOrder(
        tenant_id=tenant_id,
        wo_number=wo_number,
        **data.model_dump(exclude_unset=True),
    )
    db.add(wo)
    await db.flush()
    await db.refresh(wo)
    return wo


async def update_work_order(
    db: AsyncSession, wo: MaintenanceWorkOrder, data: WorkOrderUpdate
) -> MaintenanceWorkOrder:
    updates = data.model_dump(exclude_unset=True)
    now = datetime.now(timezone.utc)
    if updates.get("status") == "in_progress" and wo.status != "in_progress":
        wo.started_at = now
    if updates.get("status") == "completed" and wo.status != "completed":
        wo.completed_at = now
    for field, value in updates.items():
        setattr(wo, field, value)
    wo.updated_at = now
    await db.flush()
    await db.refresh(wo)

    # If this WO was generated from a PM schedule, complete the occurrence
    if wo.pm_occurrence_id and wo.status == "completed" and wo.completed_at:
        from core.services.pm_schedule_service import complete_occurrence, get_occurrence
        occurrence = await get_occurrence(db, wo.pm_occurrence_id)
        if occurrence:
            await complete_occurrence(db, occurrence, wo.completed_at)

    return wo


# --- Service Providers ---

async def list_service_providers(db: AsyncSession, limit: int = 100, offset: int = 0) -> list[ServiceProvider]:
    result = await db.execute(
        select(ServiceProvider).where(ServiceProvider.is_active).order_by(
            ServiceProvider.company_name
        ).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


async def create_service_provider(
    db: AsyncSession, tenant_id: uuid.UUID, data: ServiceProviderCreate
) -> ServiceProvider:
    provider = ServiceProvider(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(provider)
    await db.flush()
    await db.refresh(provider)
    return provider


# --- Spare Parts ---

async def list_spare_parts(db: AsyncSession, limit: int = 100, offset: int = 0) -> list[SparePart]:
    result = await db.execute(
        select(SparePart).where(SparePart.is_active).order_by(SparePart.name).limit(limit).offset(offset)
    )
    return list(result.scalars().all())


async def get_spare_part(db: AsyncSession, part_id: uuid.UUID) -> SparePart | None:
    result = await db.execute(select(SparePart).where(SparePart.id == part_id))
    return result.scalar_one_or_none()


async def create_spare_part(
    db: AsyncSession, tenant_id: uuid.UUID, data
) -> SparePart:
    part = SparePart(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(part)
    await db.flush()
    await db.refresh(part)
    return part


async def update_spare_part(db: AsyncSession, part: SparePart, data) -> SparePart:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(part, field, value)
    part.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(part)
    return part


async def delete_spare_part(db: AsyncSession, part: SparePart) -> None:
    part.is_active = False
    part.updated_at = datetime.now(timezone.utc)
    await db.flush()
