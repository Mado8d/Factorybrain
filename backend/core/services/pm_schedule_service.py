"""Preventive Maintenance Schedule service — CRUD + scheduling logic."""

import uuid
from datetime import date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import timedelta, utcnow
from core.models.maintenance import (
    MaintenanceWorkOrder,
    PMOccurrence,
    PreventiveMaintenanceSchedule,
)
from core.schemas.maintenance import PMScheduleCreate, PMScheduleUpdate, WorkOrderCreate
from core.services.pm_templates import get_template

# --- CRUD ---


async def list_pm_schedules(
    db: AsyncSession,
    machine_id: uuid.UUID | None = None,
    is_active: bool | None = None,
    trigger_type: str | None = None,
) -> list[PreventiveMaintenanceSchedule]:
    query = select(PreventiveMaintenanceSchedule).order_by(
        PreventiveMaintenanceSchedule.next_due_date.asc().nulls_last()
    )
    if machine_id:
        query = query.where(PreventiveMaintenanceSchedule.machine_id == machine_id)
    if is_active is not None:
        query = query.where(PreventiveMaintenanceSchedule.is_active == is_active)
    if trigger_type:
        query = query.where(PreventiveMaintenanceSchedule.trigger_type == trigger_type)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_pm_schedule(db: AsyncSession, schedule_id: uuid.UUID) -> PreventiveMaintenanceSchedule | None:
    result = await db.execute(
        select(PreventiveMaintenanceSchedule).where(PreventiveMaintenanceSchedule.id == schedule_id)
    )
    return result.scalar_one_or_none()


async def create_pm_schedule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    data: PMScheduleCreate,
    created_by: uuid.UUID | None = None,
) -> PreventiveMaintenanceSchedule:
    schedule = PreventiveMaintenanceSchedule(
        tenant_id=tenant_id,
        created_by=created_by,
        **data.model_dump(exclude_unset=True, exclude={"start_date"}),
    )

    # Calculate first due date
    start = data.start_date or date.today()
    if data.trigger_type in ("calendar", "hybrid"):
        schedule.next_due_date = _calculate_next_due(start, data.calendar_interval_days or 30, data.allowed_weekdays)
    if data.trigger_type in ("meter", "hybrid"):
        schedule.next_meter_due = data.meter_interval_hours
        schedule.last_meter_reading = 0.0

    db.add(schedule)
    await db.flush()
    await db.refresh(schedule)

    # Create first occurrence
    if schedule.next_due_date:
        occ = PMOccurrence(
            tenant_id=tenant_id,
            schedule_id=schedule.id,
            due_date=schedule.next_due_date,
            status="upcoming",
        )
        db.add(occ)
        await db.flush()

    return schedule


async def update_pm_schedule(
    db: AsyncSession,
    schedule: PreventiveMaintenanceSchedule,
    data: PMScheduleUpdate,
) -> PreventiveMaintenanceSchedule:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(schedule, field, value)
    schedule.updated_at = utcnow()

    # Recalculate next due if interval changed
    if data.calendar_interval_days is not None and schedule.trigger_type in ("calendar", "hybrid"):
        schedule.next_due_date = _calculate_next_due(
            date.today(),
            data.calendar_interval_days,
            schedule.allowed_weekdays,
        )

    await db.flush()
    await db.refresh(schedule)
    return schedule


async def delete_pm_schedule(db: AsyncSession, schedule: PreventiveMaintenanceSchedule) -> None:
    """Soft delete — deactivate the schedule."""
    schedule.is_active = False
    schedule.updated_at = utcnow()
    await db.flush()


# --- Due Date Calculation ---


def _calculate_next_due(
    from_date: date,
    interval_days: int,
    allowed_weekdays: list[int] | None = None,
) -> date:
    """Calculate next due date from a reference date + interval, respecting weekday filters."""
    next_date = from_date + timedelta(days=interval_days)

    if allowed_weekdays:
        # Advance to next allowed weekday (0=Mon, 6=Sun)
        for _ in range(7):
            if next_date.weekday() in allowed_weekdays:
                break
            next_date += timedelta(days=1)

    return next_date


# --- Work Order Generation ---


async def generate_wo_from_schedule(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    schedule: PreventiveMaintenanceSchedule,
    occurrence: PMOccurrence,
) -> MaintenanceWorkOrder:
    """Create a work order from a PM schedule."""
    from core.services.maintenance_service import create_work_order

    wo_data = WorkOrderCreate(
        machine_id=schedule.machine_id,
        title=schedule.name,
        trigger_type="pm-scheduled",
        description=schedule.instructions or schedule.description,
        priority=schedule.priority,
        category=schedule.category,
        requested_date=occurrence.due_date,
    )

    wo = await create_work_order(db, tenant_id, wo_data)

    # Link PM fields
    wo.pm_schedule_id = schedule.id
    wo.pm_occurrence_id = occurrence.id
    wo.scheduled_date = occurrence.due_date

    # Auto-assign if configured
    if schedule.default_assigned_provider:
        wo.assigned_to_provider = schedule.default_assigned_provider
    if schedule.default_assigned_tech:
        wo.assigned_to_tech = schedule.default_assigned_tech

    # Update occurrence
    occurrence.work_order_id = wo.id
    occurrence.status = "due"

    await db.flush()
    await db.refresh(wo)
    return wo


# --- Occurrence Management ---


async def complete_occurrence(
    db: AsyncSession,
    occurrence: PMOccurrence,
    completed_at: datetime,
) -> PMOccurrence:
    """Mark an occurrence as complete and create the next one."""
    schedule = await get_pm_schedule(db, occurrence.schedule_id)
    if not schedule:
        return occurrence

    # Determine compliance
    window_end = occurrence.due_date + timedelta(days=schedule.window_after_days)
    if completed_at.date() <= window_end:
        occurrence.compliance_status = "on_time"
        occurrence.status = "completed_on_time"
    else:
        occurrence.compliance_status = "late"
        occurrence.status = "completed_late"

    occurrence.completed_at = completed_at

    # Calculate next due date
    if schedule.trigger_type in ("calendar", "hybrid") and schedule.calendar_interval_days:
        if schedule.is_floating:
            # Floating: from completion date
            from_date = completed_at.date()
        else:
            # Fixed: from original due date
            from_date = occurrence.due_date

        schedule.next_due_date = _calculate_next_due(
            from_date, schedule.calendar_interval_days, schedule.allowed_weekdays
        )

        # Create next occurrence
        next_occ = PMOccurrence(
            tenant_id=schedule.tenant_id,
            schedule_id=schedule.id,
            due_date=schedule.next_due_date,
            status="upcoming",
        )
        db.add(next_occ)

    schedule.updated_at = utcnow()
    await db.flush()
    return occurrence


async def skip_occurrence(
    db: AsyncSession,
    occurrence: PMOccurrence,
    reason: str,
) -> PMOccurrence:
    """Skip a PM occurrence with a reason."""
    occurrence.status = "skipped"
    occurrence.skip_reason = reason
    occurrence.compliance_status = "skipped"

    # Create next occurrence
    schedule = await get_pm_schedule(db, occurrence.schedule_id)
    if schedule and schedule.trigger_type in ("calendar", "hybrid") and schedule.calendar_interval_days:
        schedule.next_due_date = _calculate_next_due(
            occurrence.due_date, schedule.calendar_interval_days, schedule.allowed_weekdays
        )
        next_occ = PMOccurrence(
            tenant_id=schedule.tenant_id,
            schedule_id=schedule.id,
            due_date=schedule.next_due_date,
            status="upcoming",
        )
        db.add(next_occ)
        schedule.updated_at = utcnow()

    await db.flush()
    return occurrence


# --- Queries ---


async def get_due_today(db: AsyncSession) -> list[PreventiveMaintenanceSchedule]:
    """Get schedules that are due today (within window)."""
    today = date.today()
    result = await db.execute(
        select(PreventiveMaintenanceSchedule)
        .where(
            PreventiveMaintenanceSchedule.is_active,
            PreventiveMaintenanceSchedule.next_due_date <= today,
        )
        .order_by(PreventiveMaintenanceSchedule.next_due_date.asc())
    )
    return list(result.scalars().all())


async def get_occurrences(db: AsyncSession, schedule_id: uuid.UUID) -> list[PMOccurrence]:
    result = await db.execute(
        select(PMOccurrence).where(PMOccurrence.schedule_id == schedule_id).order_by(PMOccurrence.due_date.desc())
    )
    return list(result.scalars().all())


async def get_occurrence(db: AsyncSession, occurrence_id: uuid.UUID) -> PMOccurrence | None:
    result = await db.execute(select(PMOccurrence).where(PMOccurrence.id == occurrence_id))
    return result.scalar_one_or_none()


async def get_upcoming_occurrence(db: AsyncSession, schedule_id: uuid.UUID) -> PMOccurrence | None:
    """Get the most recent upcoming/due occurrence for a schedule."""
    result = await db.execute(
        select(PMOccurrence)
        .where(
            PMOccurrence.schedule_id == schedule_id,
            PMOccurrence.status.in_(["upcoming", "due"]),
        )
        .order_by(PMOccurrence.due_date.asc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def get_compliance_stats(
    db: AsyncSession,
    period_start: date | None = None,
    period_end: date | None = None,
) -> dict:
    """Calculate PM compliance statistics."""
    if not period_start:
        period_start = date.today() - timedelta(days=30)
    if not period_end:
        period_end = date.today()

    result = await db.execute(
        select(
            PMOccurrence.compliance_status,
            func.count().label("count"),
        )
        .where(
            PMOccurrence.due_date >= period_start,
            PMOccurrence.due_date <= period_end,
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
        "on_time": stats["on_time"],
        "late": stats["late"],
        "skipped": stats["skipped"],
        "compliance_rate": round(compliance_rate, 1),
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
    }


# --- Template Helpers ---


async def create_from_template(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    template_id: str,
    machine_id: uuid.UUID,
    created_by: uuid.UUID | None = None,
) -> PreventiveMaintenanceSchedule:
    """Create a PM schedule from a pre-built template."""
    template = get_template(template_id)
    if not template:
        raise ValueError(f"Template '{template_id}' not found")

    data = PMScheduleCreate(
        name=template["name"],
        machine_id=machine_id,
        description=template["description"],
        category=template["category"],
        priority="medium",
        trigger_type=template["trigger_type"],
        calendar_interval_days=template.get("calendar_interval_days"),
        calendar_unit=template.get("calendar_unit"),
        calendar_unit_value=template.get("calendar_unit_value"),
        meter_interval_hours=template.get("meter_interval_hours"),
        condition_sensor_field=template.get("condition_sensor_field"),
        condition_operator=template.get("condition_operator"),
        condition_threshold=template.get("condition_threshold"),
        estimated_duration_minutes=template.get("estimated_duration_minutes"),
        checklist=template.get("checklist"),
        parts_required=template.get("parts_required"),
        instructions=template.get("instructions"),
        template_id=template_id,
    )

    return await create_pm_schedule(db, tenant_id, data, created_by)
