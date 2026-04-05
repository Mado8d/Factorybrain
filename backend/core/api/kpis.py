"""KPI routes — maintenance metrics dashboard."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.services import kpi_service

router = APIRouter()


@router.get("/dashboard")
async def get_kpi_dashboard(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
):
    """Get all maintenance KPIs in one call."""
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_full_kpi_dashboard(db, days)


@router.get("/mttr")
async def get_mttr(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
    machine_id: str | None = None,
):
    await set_tenant_context(db, str(user.tenant_id))
    mid = None
    if machine_id:
        import uuid
        mid = uuid.UUID(machine_id)
    return await kpi_service.get_mttr(db, days, mid)


@router.get("/mtbf")
async def get_mtbf(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(90, ge=1, le=730),
    machine_id: str | None = None,
):
    await set_tenant_context(db, str(user.tenant_id))
    mid = None
    if machine_id:
        import uuid
        mid = uuid.UUID(machine_id)
    return await kpi_service.get_mtbf(db, days, mid)


@router.get("/oee")
async def get_oee(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    hours: int = Query(24, ge=1, le=168),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_oee_full(db, hours)


@router.get("/pm-compliance")
async def get_pm_compliance(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_pm_compliance(db, days)


@router.get("/planned-vs-unplanned")
async def get_planned_unplanned(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_planned_vs_unplanned(db, days)


@router.get("/backlog")
async def get_backlog(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_wo_backlog(db)


@router.get("/cost")
async def get_cost(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
    machine_id: str | None = None,
):
    await set_tenant_context(db, str(user.tenant_id))
    mid = None
    if machine_id:
        import uuid
        mid = uuid.UUID(machine_id)
    return await kpi_service.get_maintenance_cost(db, days, mid)


@router.get("/wrench-time")
async def get_wrench_time(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    days: int = Query(30, ge=1, le=365),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await kpi_service.get_wrench_time(db, days)
