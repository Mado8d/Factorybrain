"""Shift handover service — 90% auto-populated from system data."""

import uuid
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.models.base import utcnow
from core.models.machine import Machine
from core.models.maintenance import MaintenanceAlert, MaintenanceWorkOrder
from core.models.shift_handover import ShiftHandover
from core.models.time_entry import TimeEntry
from core.models.user import User
from core.models.work_order_event import WorkOrderEvent

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

SHIFT_WINDOWS = {
    "morning": (time(6, 0), time(14, 0)),
    "evening": (time(14, 0), time(22, 0)),
    "night": (time(22, 0), time(6, 0)),  # crosses midnight
    "day": (time(6, 0), time(18, 0)),    # 2-shift companies
    "afternoon": (time(14, 0), time(22, 0)),  # legacy alias
}


def _get_shift_window(shift_date: date, shift_type: str) -> tuple[datetime, datetime]:
    """Return (start, end) datetimes for a shift based on date + type."""
    key = shift_type.lower()
    start_time, end_time = SHIFT_WINDOWS.get(key, (time(6, 0), time(14, 0)))

    start_dt = datetime.combine(shift_date, start_time)

    if key == "night":
        # Night shift ends the next day at 06:00
        end_dt = datetime.combine(shift_date + timedelta(days=1), end_time)
    else:
        end_dt = datetime.combine(shift_date, end_time)

    return start_dt, end_dt


def _format_duration(seconds: int | None) -> str:
    """Format seconds into a human-readable duration string."""
    if not seconds or seconds <= 0:
        return "0m"
    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    if hours > 0:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


# ---------------------------------------------------------------------------
# Queries — read only
# ---------------------------------------------------------------------------


async def list_handovers(
    db: AsyncSession,
    plant_id: uuid.UUID | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[ShiftHandover]:
    query = select(ShiftHandover).order_by(ShiftHandover.created_at.desc())
    if plant_id:
        query = query.where(ShiftHandover.plant_id == plant_id)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_handover(db: AsyncSession, handover_id: uuid.UUID) -> ShiftHandover | None:
    result = await db.execute(select(ShiftHandover).where(ShiftHandover.id == handover_id))
    return result.scalar_one_or_none()


# ---------------------------------------------------------------------------
# Auto-populate — pulls everything from the shift window
# ---------------------------------------------------------------------------


async def auto_populate(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    shift_date: date,
    shift_type: str,
) -> dict:
    """Query all activity from the shift window to build a 90% auto snapshot."""

    shift_start, shift_end = _get_shift_window(shift_date, shift_type)

    # Build a user id -> name lookup for the tenant
    user_result = await db.execute(select(User).where(User.tenant_id == tenant_id))
    user_map: dict[uuid.UUID, str] = {u.id: u.name for u in user_result.scalars().all()}

    # Build a machine id -> name lookup
    machine_result = await db.execute(select(Machine).where(Machine.tenant_id == tenant_id))
    machine_map: dict[uuid.UUID, str] = {m.id: m.name for m in machine_result.scalars().all()}

    # ----- 1. Work Orders touched during this shift -----
    wo_result = await db.execute(
        select(MaintenanceWorkOrder).where(
            or_(
                and_(
                    MaintenanceWorkOrder.created_at >= shift_start,
                    MaintenanceWorkOrder.created_at < shift_end,
                ),
                and_(
                    MaintenanceWorkOrder.updated_at >= shift_start,
                    MaintenanceWorkOrder.updated_at < shift_end,
                ),
                and_(
                    MaintenanceWorkOrder.completed_at >= shift_start,
                    MaintenanceWorkOrder.completed_at < shift_end,
                ),
            )
        )
    )
    work_orders_raw = wo_result.scalars().all()

    wo_snapshot = []
    parts_used_snapshot = []
    for wo in work_orders_raw:
        # Determine the action
        if wo.completed_at and shift_start <= wo.completed_at < shift_end:
            action = "completed"
        elif wo.created_at and shift_start <= wo.created_at < shift_end:
            action = "created"
        else:
            action = "updated"

        wo_snapshot.append(
            {
                "wo_number": wo.wo_number,
                "title": wo.title,
                "machine_name": machine_map.get(wo.machine_id, "Unknown"),
                "status": wo.status,
                "action": action,
                "priority": wo.priority,
                "user_name": user_map.get(wo.assigned_by) if wo.assigned_by else None,
            }
        )

        # ----- 5. Parts used from completed WOs -----
        if action == "completed" and wo.parts_used:
            parts_list = wo.parts_used if isinstance(wo.parts_used, list) else wo.parts_used.get("items", [])
            for part in parts_list:
                if isinstance(part, dict):
                    parts_used_snapshot.append(
                        {
                            "wo_number": wo.wo_number,
                            "machine_name": machine_map.get(wo.machine_id, "Unknown"),
                            "part_name": part.get("name", part.get("part_name", "Unknown")),
                            "quantity": part.get("quantity", part.get("qty", 1)),
                        }
                    )

    # ----- 2. Work Order Events during the shift -----
    event_result = await db.execute(
        select(WorkOrderEvent)
        .options(selectinload(WorkOrderEvent.work_order))
        .where(
            and_(
                WorkOrderEvent.created_at >= shift_start,
                WorkOrderEvent.created_at < shift_end,
            )
        )
        .order_by(WorkOrderEvent.created_at)
    )
    events_raw = event_result.scalars().all()

    events_snapshot = []
    for evt in events_raw:
        wo_num = evt.work_order.wo_number if evt.work_order else "N/A"
        events_snapshot.append(
            {
                "wo_number": wo_num,
                "event_type": evt.event_type,
                "content": evt.content,
                "user_name": user_map.get(evt.user_id) if evt.user_id else "System",
                "created_at": evt.created_at.isoformat() if evt.created_at else None,
            }
        )

    # ----- 3. Alerts triggered / resolved during the shift -----
    alert_result = await db.execute(
        select(MaintenanceAlert)
        .options(selectinload(MaintenanceAlert.machine))
        .where(
            or_(
                and_(
                    MaintenanceAlert.created_at >= shift_start,
                    MaintenanceAlert.created_at < shift_end,
                ),
                and_(
                    MaintenanceAlert.resolved_at >= shift_start,
                    MaintenanceAlert.resolved_at < shift_end,
                ),
            )
        )
    )
    alerts_raw = alert_result.scalars().all()

    alert_snapshot = []
    for alert in alerts_raw:
        if alert.resolved_at and shift_start <= alert.resolved_at < shift_end:
            alert_action = "resolved"
        else:
            alert_action = "triggered"

        alert_snapshot.append(
            {
                "severity": alert.severity,
                "alert_type": alert.alert_type,
                "machine_name": alert.machine.name if alert.machine else machine_map.get(alert.machine_id, "Unknown"),
                "status": alert.status,
                "action": alert_action,
                "message": alert.message if hasattr(alert, "message") else None,
            }
        )

    # ----- 4. Time tracked during the shift -----
    time_result = await db.execute(
        select(TimeEntry)
        .options(selectinload(TimeEntry.work_order))
        .where(
            and_(
                TimeEntry.started_at >= shift_start,
                TimeEntry.started_at < shift_end,
            )
        )
    )
    time_entries_raw = time_result.scalars().all()

    time_entries_snapshot = []
    total_seconds = 0
    wrench_seconds = 0
    for te in time_entries_raw:
        dur = te.duration_seconds or 0
        total_seconds += dur
        if te.category == "wrench":
            wrench_seconds += dur

        wo_num = te.work_order.wo_number if te.work_order else "N/A"
        time_entries_snapshot.append(
            {
                "user_name": user_map.get(te.user_id, "Unknown"),
                "wo_number": wo_num,
                "duration_formatted": _format_duration(dur),
                "duration_seconds": dur,
                "category": te.category or "wrench",
            }
        )

    wrench_pct = round((wrench_seconds / total_seconds) * 100) if total_seconds > 0 else 0
    time_tracked_summary = {
        "entries": time_entries_snapshot,
        "total_hours": round(total_seconds / 3600, 1),
        "total_formatted": _format_duration(total_seconds),
        "wrench_time_pct": wrench_pct,
    }

    # ----- 6. Machine statuses -----
    all_machines_result = await db.execute(select(Machine).where(Machine.tenant_id == tenant_id))
    all_machines = all_machines_result.scalars().all()
    machine_statuses = [
        {
            "machine_id": str(m.id),
            "machine_name": m.name,
            "status": m.status,
            "machine_type": m.machine_type,
        }
        for m in all_machines
    ]

    # ----- Build the shift_activity aggregate -----
    shift_activity = {
        "work_orders": wo_snapshot,
        "events": events_snapshot,
        "alerts": alert_snapshot,
        "time_tracked": time_tracked_summary,
        "parts_used": parts_used_snapshot,
        "shift_window": {
            "start": shift_start.isoformat(),
            "end": shift_end.isoformat(),
        },
    }

    # Also keep the legacy active_work_orders / active_alerts for the existing fields
    active_wo_snapshot = [
        {
            "wo_number": wo.wo_number,
            "title": wo.title,
            "status": wo.status,
            "assigned_to": str(wo.assigned_by) if wo.assigned_by else None,
            "machine_id": str(wo.machine_id) if wo.machine_id else None,
            "machine_name": machine_map.get(wo.machine_id, "Unknown"),
        }
        for wo in work_orders_raw
        if wo.status in ("open", "in_progress", "assigned")
    ]

    active_alert_snapshot = [
        {
            "severity": a.severity,
            "alert_type": a.alert_type,
            "machine_id": str(a.machine_id) if a.machine_id else None,
            "machine_name": a.machine.name if a.machine else machine_map.get(a.machine_id, "Unknown"),
            "message": a.message if hasattr(a, "message") else None,
        }
        for a in alerts_raw
        if a.status == "open"
    ]

    # Auto-generated event entries
    auto_events = []
    for wo_item in wo_snapshot:
        if wo_item["action"] == "completed":
            auto_events.append(
                {
                    "description": f"WO {wo_item['wo_number']} completed: {wo_item['title']}",
                    "severity": "info",
                    "source": "auto",
                }
            )
        elif wo_item["action"] == "created":
            auto_events.append(
                {
                    "description": f"WO {wo_item['wo_number']} created: {wo_item['title']}",
                    "severity": "info",
                    "source": "auto",
                }
            )
    for a_item in alert_snapshot:
        sev = "critical" if a_item["severity"] in ("critical", "high") else "warning"
        auto_events.append(
            {
                "description": f"Alert {a_item['action']}: {a_item['alert_type']} on {a_item['machine_name']}",
                "severity": sev,
                "source": "auto",
            }
        )

    return {
        "active_work_orders": active_wo_snapshot,
        "active_alerts": active_alert_snapshot,
        "machine_statuses": machine_statuses,
        "sensor_anomalies": [],
        "shift_activity": shift_activity,
        "events": auto_events,
    }


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------


async def create_handover(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plant_id: uuid.UUID | None,
    shift_date: date,
    shift_type: str,
    user_id: uuid.UUID,
) -> ShiftHandover:
    snapshots = await auto_populate(db, tenant_id, shift_date, shift_type)
    handover = ShiftHandover(
        tenant_id=tenant_id,
        plant_id=plant_id,
        shift_date=shift_date,
        shift_type=shift_type,
        outgoing_user_id=user_id,
        **snapshots,
    )
    db.add(handover)
    await db.flush()
    await db.refresh(handover)
    return handover


async def update_handover(db: AsyncSession, handover: ShiftHandover, data: dict) -> ShiftHandover:
    allowed = {"events", "open_items", "safety_notes", "production_notes"}
    for field, value in data.items():
        if field in allowed:
            setattr(handover, field, value)
    await db.flush()
    await db.refresh(handover)
    return handover


async def sign_outgoing(db: AsyncSession, handover: ShiftHandover, user_id: uuid.UUID) -> ShiftHandover:
    handover.outgoing_user_id = user_id
    handover.outgoing_signed_at = utcnow()
    await db.flush()
    await db.refresh(handover)
    return handover


async def acknowledge_incoming(db: AsyncSession, handover: ShiftHandover, user_id: uuid.UUID) -> ShiftHandover:
    handover.incoming_user_id = user_id
    handover.incoming_acknowledged_at = utcnow()
    handover.is_locked = True
    await db.flush()
    await db.refresh(handover)
    return handover
