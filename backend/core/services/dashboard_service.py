"""Dashboard KPI aggregation service."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.machine import Machine
from core.models.maintenance import MaintenanceAlert
from core.models.sensor_reading import SensorReading
from core.schemas.telemetry import DashboardKPIs


async def get_dashboard_kpis(db: AsyncSession) -> DashboardKPIs:
    """Compute dashboard KPI summary."""
    # Machine counts
    total = await db.execute(select(func.count()).select_from(Machine))
    total_machines = total.scalar_one()

    active = await db.execute(select(func.count()).select_from(Machine).where(Machine.status == "active"))
    active_machines = active.scalar_one()

    # Alert counts
    open_alerts = await db.execute(
        select(func.count()).select_from(MaintenanceAlert).where(MaintenanceAlert.status == "open")
    )
    open_count = open_alerts.scalar_one()

    critical = await db.execute(
        select(func.count())
        .select_from(MaintenanceAlert)
        .where(MaintenanceAlert.status == "open")
        .where(MaintenanceAlert.severity == "critical")
    )
    critical_count = critical.scalar_one()

    # Latest power readings (sum across all nodes)
    power_subq = (
        select(
            SensorReading.node_id,
            func.max(SensorReading.time).label("latest"),
        )
        .where(SensorReading.node_type == "energysense")
        .group_by(SensorReading.node_id)
        .subquery()
    )
    power_result = await db.execute(
        select(
            func.sum(SensorReading.grid_power_w).label("total_grid"),
            func.sum(SensorReading.solar_power_w).label("total_solar"),
        ).join(
            power_subq,
            (SensorReading.node_id == power_subq.c.node_id) & (SensorReading.time == power_subq.c.latest),
        )
    )
    power_row = power_result.first()
    total_power = (power_row.total_grid or 0) / 1000 if power_row else None
    solar_power = (power_row.total_solar or 0) / 1000 if power_row else None

    return DashboardKPIs(
        active_machines=active_machines,
        total_machines=total_machines,
        open_alerts=open_count,
        critical_alerts=critical_count,
        total_power_kw=total_power,
        solar_power_kw=solar_power,
    )
