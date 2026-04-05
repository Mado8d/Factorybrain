"""KPI calculation service — MTBF, MTTR, OEE, PM compliance, planned vs unplanned."""

import uuid
from datetime import date

from sqlalchemy import case, func, select
from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import timedelta, utcnow
from core.models.machine import Machine
from core.models.maintenance import MaintenanceAlert, MaintenanceWorkOrder, PMOccurrence
from core.models.time_entry import TimeEntry


async def get_mttr(db: AsyncSession, days: int = 30, machine_id: uuid.UUID | None = None) -> dict:
    """Mean Time To Repair — average duration from WO start to completion."""
    since = utcnow() - timedelta(days=days)
    query = select(
        func.avg(
            func.extract("epoch", MaintenanceWorkOrder.completed_at)
            - func.extract("epoch", MaintenanceWorkOrder.started_at)
        ).label("avg_seconds"),
        func.count().label("count"),
    ).where(
        MaintenanceWorkOrder.completed_at.isnot(None),
        MaintenanceWorkOrder.started_at.isnot(None),
        MaintenanceWorkOrder.completed_at >= since,
    )
    if machine_id:
        query = query.where(MaintenanceWorkOrder.machine_id == machine_id)

    result = await db.execute(query)
    row = result.first()
    avg_sec = float(row.avg_seconds) if row and row.avg_seconds else 0
    return {
        "mttr_seconds": round(avg_sec),
        "mttr_formatted": _fmt(avg_sec),
        "completed_wos": row.count if row else 0,
        "period_days": days,
    }


async def get_mtbf(db: AsyncSession, days: int = 90, machine_id: uuid.UUID | None = None) -> dict:
    """Mean Time Between Failures — average time between failure alerts per machine."""
    since = utcnow() - timedelta(days=days)
    query = (
        select(
            MaintenanceAlert.machine_id,
            func.array_agg(MaintenanceAlert.created_at).label("failure_times"),
        )
        .where(
            MaintenanceAlert.severity.in_(["critical", "high"]),
            MaintenanceAlert.created_at >= since,
        )
        .group_by(MaintenanceAlert.machine_id)
    )
    if machine_id:
        query = query.where(MaintenanceAlert.machine_id == machine_id)

    result = await db.execute(query)
    rows = result.all()

    intervals = []
    for row in rows:
        times = sorted(row.failure_times)
        for i in range(1, len(times)):
            delta = (times[i] - times[i - 1]).total_seconds()
            if delta > 300:  # Ignore alerts < 5 min apart (duplicates)
                intervals.append(delta)

    avg_sec = sum(intervals) / len(intervals) if intervals else 0
    return {
        "mtbf_seconds": round(avg_sec),
        "mtbf_formatted": _fmt(avg_sec),
        "failure_count": sum(len(r.failure_times) for r in rows),
        "machines_with_failures": len(rows),
        "period_days": days,
    }


async def get_oee_full(db: AsyncSession, hours: int = 24) -> list[dict]:
    """Full OEE calculation per machine — Availability from energy data."""
    # Reuse existing OEE logic from dashboard
    from core.models.sensor_node import SensorNode

    nodes_result = await db.execute(
        select(SensorNode.id, SensorNode.machine_id, SensorNode.node_type)
        .where(SensorNode.node_type == "energysense")
        .where(SensorNode.machine_id.isnot(None))
    )
    energy_nodes = nodes_result.all()

    machines_result = await db.execute(select(Machine))
    machines_map = {m.id: m for m in machines_result.scalars().all()}

    oee_data = []
    power_threshold = 500

    for node_id, machine_id, _ in energy_nodes:
        machine = machines_map.get(machine_id)
        if not machine:
            continue

        result = await db.execute(
            sa_text(f"""
            SELECT
                COUNT(*) AS total_buckets,
                COUNT(*) FILTER (WHERE avg_power > :threshold) AS active_buckets
            FROM (
                SELECT time_bucket(INTERVAL '5 minutes', time) AS bucket,
                       AVG(grid_power_w) AS avg_power
                FROM sensor_readings
                WHERE node_id = :node_id
                  AND time >= NOW() - INTERVAL '{hours} hours'
                GROUP BY bucket
            ) sub
        """).bindparams(node_id=node_id, threshold=power_threshold)
        )

        row = result.first()
        if not row or row.total_buckets == 0:
            continue

        availability = round(row.active_buckets / row.total_buckets * 100, 1)
        oee_data.append(
            {
                "machine_id": str(machine_id),
                "machine_name": machine.name,
                "availability": availability,
                "performance": None,  # Phase 3: requires production rate data
                "quality": None,  # Phase 3: requires defect rate data
                "oee": availability,  # For now, OEE = availability only
            }
        )

    return oee_data


async def get_pm_compliance(db: AsyncSession, days: int = 30) -> dict:
    """PM compliance — on-time vs late vs missed."""
    since = date.today() - timedelta(days=days)
    result = await db.execute(
        select(
            PMOccurrence.compliance_status,
            func.count().label("count"),
        )
        .where(
            PMOccurrence.due_date >= since,
            PMOccurrence.compliance_status.isnot(None),
        )
        .group_by(PMOccurrence.compliance_status)
    )
    rows = result.all()
    stats = {"on_time": 0, "late": 0, "skipped": 0}
    for status, count in rows:
        if status in stats:
            stats[status] = count
    total = sum(stats.values())
    compliance_rate = (stats["on_time"] / total * 100) if total > 0 else 100.0

    return {
        "total": total,
        **stats,
        "compliance_rate": round(compliance_rate, 1),
        "period_days": days,
    }


async def get_planned_vs_unplanned(db: AsyncSession, days: int = 30) -> dict:
    """Ratio of planned (PM-scheduled) vs unplanned (reactive) work orders."""
    since = utcnow() - timedelta(days=days)
    result = await db.execute(
        select(
            case(
                (MaintenanceWorkOrder.trigger_type.in_(["pm-scheduled", "preventive"]), "planned"),
                else_="unplanned",
            ).label("category"),
            func.count().label("count"),
        )
        .where(MaintenanceWorkOrder.created_at >= since)
        .group_by("category")
    )
    rows = result.all()
    data = {"planned": 0, "unplanned": 0}
    for cat, count in rows:
        data[cat] = count
    total = data["planned"] + data["unplanned"]
    planned_pct = (data["planned"] / total * 100) if total > 0 else 0

    return {
        **data,
        "total": total,
        "planned_percentage": round(planned_pct, 1),
        "period_days": days,
    }


async def get_wo_backlog(db: AsyncSession) -> dict:
    """Open work order backlog by priority and age."""
    result = await db.execute(
        select(
            MaintenanceWorkOrder.priority,
            func.count().label("count"),
            func.min(MaintenanceWorkOrder.created_at).label("oldest"),
        )
        .where(MaintenanceWorkOrder.status.in_(["draft", "open", "in_progress"]))
        .group_by(MaintenanceWorkOrder.priority)
    )
    rows = result.all()
    now = utcnow()
    backlog = {}
    total = 0
    for row in rows:
        age_days = (now - row.oldest).days if row.oldest else 0
        backlog[row.priority] = {"count": row.count, "oldest_days": age_days}
        total += row.count

    return {"total": total, "by_priority": backlog}


async def get_maintenance_cost(db: AsyncSession, days: int = 30, machine_id: uuid.UUID | None = None) -> dict:
    """Total maintenance cost from work orders (labor + parts)."""
    since = utcnow() - timedelta(days=days)
    query = select(
        func.sum(MaintenanceWorkOrder.total_cost).label("total_cost"),
        func.sum(MaintenanceWorkOrder.labor_hours).label("total_hours"),
        func.count().label("wo_count"),
    ).where(
        MaintenanceWorkOrder.completed_at.isnot(None),
        MaintenanceWorkOrder.completed_at >= since,
    )
    if machine_id:
        query = query.where(MaintenanceWorkOrder.machine_id == machine_id)
    result = await db.execute(query)
    row = result.first()

    return {
        "total_cost": float(row.total_cost) if row and row.total_cost else 0,
        "total_labor_hours": float(row.total_hours) if row and row.total_hours else 0,
        "completed_wos": row.wo_count if row else 0,
        "period_days": days,
    }


async def get_wrench_time(db: AsyncSession, days: int = 30) -> dict:
    """Wrench time percentage — actual repair time vs total logged time."""
    since = utcnow() - timedelta(days=days)
    result = await db.execute(
        select(
            TimeEntry.category,
            func.sum(TimeEntry.duration_seconds).label("total"),
        )
        .where(
            TimeEntry.stopped_at.isnot(None),
            TimeEntry.created_at >= since,
        )
        .group_by(TimeEntry.category)
    )
    rows = result.all()
    by_cat = {}
    total = 0
    for cat, seconds in rows:
        by_cat[cat] = int(seconds) if seconds else 0
        total += by_cat[cat]

    wrench = by_cat.get("wrench", 0)
    wrench_pct = (wrench / total * 100) if total > 0 else 0

    return {
        "wrench_time_percentage": round(wrench_pct, 1),
        "total_seconds": total,
        "by_category": {k: {"seconds": v, "formatted": _fmt(v)} for k, v in by_cat.items()},
        "period_days": days,
    }


async def get_full_kpi_dashboard(db: AsyncSession, days: int = 30) -> dict:
    """Aggregate all KPIs into one response."""
    mttr = await get_mttr(db, days)
    mtbf = await get_mtbf(db, days * 3)  # MTBF needs longer window
    pm = await get_pm_compliance(db, days)
    pvu = await get_planned_vs_unplanned(db, days)
    backlog = await get_wo_backlog(db)
    cost = await get_maintenance_cost(db, days)
    wrench = await get_wrench_time(db, days)

    return {
        "mttr": mttr,
        "mtbf": mtbf,
        "pm_compliance": pm,
        "planned_vs_unplanned": pvu,
        "backlog": backlog,
        "cost": cost,
        "wrench_time": wrench,
        "period_days": days,
    }


def _fmt(seconds: float) -> str:
    s = int(seconds)
    if s < 3600:
        return f"{s // 60}m"
    h, m = divmod(s, 3600)
    return f"{h}h {m // 60}m"
