"""Production data service — CRUD, aggregation, demo seeding."""

import random
import uuid
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import timedelta, utcnow
from core.models.machine import Machine
from core.models.production_log import ProductionLog
from core.schemas.production import ProductionLogCreate, ProductionLogUpdate


async def list_logs(
    db: AsyncSession,
    machine_id: uuid.UUID | None = None,
    line_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[ProductionLog]:
    query = select(ProductionLog).order_by(ProductionLog.shift_date.desc(), ProductionLog.shift_type)
    if machine_id:
        query = query.where(ProductionLog.machine_id == machine_id)
    if line_id:
        query = query.where(ProductionLog.production_line_id == line_id)
    if date_from:
        query = query.where(ProductionLog.shift_date >= date_from)
    if date_to:
        query = query.where(ProductionLog.shift_date <= date_to)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_log(db: AsyncSession, log_id: uuid.UUID) -> ProductionLog | None:
    result = await db.execute(select(ProductionLog).where(ProductionLog.id == log_id))
    return result.scalar_one_or_none()


async def create_log(db: AsyncSession, tenant_id: uuid.UUID, data: ProductionLogCreate) -> ProductionLog:
    log = ProductionLog(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(log)
    await db.flush()
    await db.refresh(log)
    return log


async def update_log(db: AsyncSession, log: ProductionLog, data: ProductionLogUpdate) -> ProductionLog:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(log, field, value)
    log.updated_at = utcnow()
    await db.flush()
    await db.refresh(log)
    return log


async def delete_log(db: AsyncSession, log: ProductionLog) -> None:
    await db.delete(log)
    await db.flush()


async def bulk_import(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    logs: list[ProductionLogCreate],
    source: str = "csv",
    user_id: uuid.UUID | None = None,
) -> tuple[int, list[dict]]:
    """Import multiple production logs. Returns (success_count, errors)."""
    imported = 0
    errors: list[dict] = []
    now = utcnow()

    for idx, data in enumerate(logs):
        try:
            log = ProductionLog(
                tenant_id=tenant_id,
                **data.model_dump(exclude_unset=True),
                source=source,
                imported_at=now,
                imported_by=user_id,
            )
            db.add(log)
            imported += 1
        except Exception as e:
            errors.append({"row": idx + 1, "error": str(e)})

    if imported > 0:
        await db.flush()

    return imported, errors


async def get_summary(
    db: AsyncSession,
    machine_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict:
    """Aggregated OEE metrics for a date range."""
    query = select(
        func.sum(ProductionLog.planned_units).label("total_planned"),
        func.sum(ProductionLog.actual_units).label("total_actual"),
        func.sum(ProductionLog.defect_units).label("total_defects"),
        func.sum(ProductionLog.planned_runtime_minutes).label("total_planned_runtime"),
        func.sum(ProductionLog.actual_runtime_minutes).label("total_actual_runtime"),
        func.sum(ProductionLog.downtime_minutes).label("total_downtime"),
        func.count().label("log_count"),
    )
    if machine_id:
        query = query.where(ProductionLog.machine_id == machine_id)
    if date_from:
        query = query.where(ProductionLog.shift_date >= date_from)
    if date_to:
        query = query.where(ProductionLog.shift_date <= date_to)

    result = await db.execute(query)
    row = result.first()

    if not row or not row.log_count:
        return {
            "total_planned": 0,
            "total_actual": 0,
            "total_defects": 0,
            "total_planned_runtime": 0,
            "total_actual_runtime": 0,
            "total_downtime": 0,
            "avg_availability": None,
            "avg_performance": None,
            "avg_quality": None,
            "avg_oee": None,
            "log_count": 0,
        }

    total_planned_rt = int(row.total_planned_runtime or 0)
    total_actual_rt = int(row.total_actual_runtime or 0)
    total_actual = int(row.total_actual or 0)
    total_defects = int(row.total_defects or 0)
    total_planned = int(row.total_planned or 0)

    # Availability
    avg_availability = (total_actual_rt / total_planned_rt * 100) if total_planned_rt > 0 else None

    # Quality
    avg_quality = ((total_actual - total_defects) / total_actual * 100) if total_actual > 0 else None

    # Performance — need per-log calculation with cycle times
    # Fetch logs with cycle time for weighted average
    perf_query = select(
        ProductionLog.actual_units,
        ProductionLog.actual_runtime_minutes,
        ProductionLog.ideal_cycle_time_seconds,
    ).where(
        ProductionLog.ideal_cycle_time_seconds.isnot(None),
        ProductionLog.actual_runtime_minutes.isnot(None),
        ProductionLog.actual_runtime_minutes > 0,
    )
    if machine_id:
        perf_query = perf_query.where(ProductionLog.machine_id == machine_id)
    if date_from:
        perf_query = perf_query.where(ProductionLog.shift_date >= date_from)
    if date_to:
        perf_query = perf_query.where(ProductionLog.shift_date <= date_to)

    perf_result = await db.execute(perf_query)
    perf_rows = perf_result.all()

    if perf_rows:
        total_expected = 0
        total_actual_units = 0
        for pr in perf_rows:
            expected = pr.actual_runtime_minutes * 60 / pr.ideal_cycle_time_seconds
            total_expected += expected
            total_actual_units += pr.actual_units
        avg_performance = (total_actual_units / total_expected * 100) if total_expected > 0 else None
    else:
        avg_performance = None

    avg_oee = None
    if avg_availability is not None and avg_performance is not None and avg_quality is not None:
        avg_oee = round(avg_availability * avg_performance * avg_quality / 10000, 1)

    return {
        "total_planned": total_planned,
        "total_actual": total_actual,
        "total_defects": total_defects,
        "total_planned_runtime": total_planned_rt,
        "total_actual_runtime": total_actual_rt,
        "total_downtime": int(row.total_downtime or 0),
        "avg_availability": round(avg_availability, 1) if avg_availability is not None else None,
        "avg_performance": round(avg_performance, 1) if avg_performance is not None else None,
        "avg_quality": round(avg_quality, 1) if avg_quality is not None else None,
        "avg_oee": avg_oee,
        "log_count": row.log_count,
    }


async def get_oee_trend(
    db: AsyncSession,
    machine_id: uuid.UUID | None = None,
    days: int = 30,
) -> list[dict]:
    """Daily OEE trend for charts."""
    date_from = date.today() - timedelta(days=days)

    query = (
        select(
            ProductionLog.shift_date,
            func.sum(ProductionLog.planned_runtime_minutes).label("planned_rt"),
            func.sum(ProductionLog.actual_runtime_minutes).label("actual_rt"),
            func.sum(ProductionLog.actual_units).label("actual_units"),
            func.sum(ProductionLog.defect_units).label("defect_units"),
            func.sum(ProductionLog.planned_units).label("planned_units"),
        )
        .where(
            ProductionLog.shift_date >= date_from,
        )
        .group_by(
            ProductionLog.shift_date,
        )
        .order_by(
            ProductionLog.shift_date,
        )
    )

    if machine_id:
        query = query.where(ProductionLog.machine_id == machine_id)

    result = await db.execute(query)
    rows = result.all()

    # Also get per-day weighted performance from cycle times
    perf_query = (
        select(
            ProductionLog.shift_date,
            func.sum(ProductionLog.actual_units).label("actual_units"),
            func.sum(ProductionLog.actual_runtime_minutes * 60 / ProductionLog.ideal_cycle_time_seconds).label(
                "expected_units"
            ),
        )
        .where(
            ProductionLog.shift_date >= date_from,
            ProductionLog.ideal_cycle_time_seconds.isnot(None),
            ProductionLog.actual_runtime_minutes.isnot(None),
            ProductionLog.ideal_cycle_time_seconds > 0,
            ProductionLog.actual_runtime_minutes > 0,
        )
        .group_by(ProductionLog.shift_date)
    )

    if machine_id:
        perf_query = perf_query.where(ProductionLog.machine_id == machine_id)

    perf_result = await db.execute(perf_query)
    perf_map = {str(r.shift_date): r for r in perf_result.all()}

    trend = []
    for row in rows:
        day_str = str(row.shift_date)
        planned_rt = int(row.planned_rt or 0)
        actual_rt = int(row.actual_rt or 0)
        actual = int(row.actual_units or 0)
        defects = int(row.defect_units or 0)

        availability = (actual_rt / planned_rt * 100) if planned_rt > 0 else None
        quality = ((actual - defects) / actual * 100) if actual > 0 else None

        perf_row = perf_map.get(day_str)
        performance = None
        if perf_row and perf_row.expected_units and perf_row.expected_units > 0:
            performance = round(float(perf_row.actual_units) / float(perf_row.expected_units) * 100, 1)

        oee = None
        if availability is not None and performance is not None and quality is not None:
            oee = round(availability * performance * quality / 10000, 1)

        trend.append(
            {
                "date": day_str,
                "availability": round(availability, 1) if availability is not None else None,
                "performance": performance,
                "quality": round(quality, 1) if quality is not None else None,
                "oee": oee,
            }
        )

    return trend


async def seed_demo_data(db: AsyncSession, tenant_id: uuid.UUID) -> int:
    """Generate 30 days of realistic production data. Returns count of logs created."""
    # Get existing machines
    result = await db.execute(select(Machine).where(Machine.tenant_id == tenant_id))
    machines = list(result.scalars().all())

    if not machines:
        return 0

    count = 0
    today = date.today()
    product_types = ["Type A", "Type B", "Type C"]
    shifts = ["morning", "afternoon"]

    for day_offset in range(30):
        shift_date = today - timedelta(days=day_offset)

        for machine in machines:
            # Vary cycle time and planned units by machine
            base_cycle_time = random.uniform(30, 120)
            base_planned = random.randint(100, 500)

            for shift in shifts:
                planned_units = base_planned + random.randint(-20, 20)
                planned_runtime = 480  # 8 hours

                # Most days are good, some are bad
                is_bad_day = random.random() < 0.1
                if is_bad_day:
                    efficiency = random.uniform(0.60, 0.75)
                    downtime = random.randint(30, 90)
                else:
                    efficiency = random.uniform(0.85, 1.0)
                    downtime = random.randint(0, 30)

                actual_runtime = max(planned_runtime - downtime, 120)
                actual_units = int(planned_units * efficiency)
                defect_rate = random.uniform(0.01, 0.05)
                defect_units = max(1, int(actual_units * defect_rate))

                log = ProductionLog(
                    tenant_id=tenant_id,
                    machine_id=machine.id,
                    production_line_id=machine.line_id,
                    shift_date=shift_date,
                    shift_type=shift,
                    planned_units=planned_units,
                    actual_units=actual_units,
                    defect_units=defect_units,
                    planned_runtime_minutes=planned_runtime,
                    actual_runtime_minutes=actual_runtime,
                    downtime_minutes=downtime,
                    ideal_cycle_time_seconds=round(base_cycle_time + random.uniform(-5, 5), 1),
                    product_type=random.choice(product_types),
                    source="simulator",
                )
                db.add(log)
                count += 1

    await db.flush()
    return count
