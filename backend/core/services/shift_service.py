"""Shift handover service — create, sign-off, acknowledge."""

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.maintenance import MaintenanceAlert, MaintenanceWorkOrder
from core.models.shift_handover import ShiftHandover


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


async def get_handover(
    db: AsyncSession, handover_id: uuid.UUID
) -> ShiftHandover | None:
    result = await db.execute(
        select(ShiftHandover).where(ShiftHandover.id == handover_id)
    )
    return result.scalar_one_or_none()


async def auto_populate(db: AsyncSession, tenant_id: uuid.UUID) -> dict:
    """Query active WOs and open alerts to build snapshot data."""
    # Active work orders
    wo_result = await db.execute(
        select(MaintenanceWorkOrder).where(
            MaintenanceWorkOrder.status.in_(["open", "in_progress"])
        )
    )
    work_orders = wo_result.scalars().all()
    wo_snapshot = [
        {
            "wo_number": wo.wo_number,
            "title": wo.title,
            "status": wo.status,
            "assigned_to": str(wo.assigned_to) if wo.assigned_to else None,
            "machine_id": str(wo.machine_id) if wo.machine_id else None,
        }
        for wo in work_orders
    ]

    # Open alerts
    alert_result = await db.execute(
        select(MaintenanceAlert).where(MaintenanceAlert.status == "open")
    )
    alerts = alert_result.scalars().all()
    alert_snapshot = [
        {
            "severity": alert.severity,
            "alert_type": alert.alert_type,
            "machine_id": str(alert.machine_id) if alert.machine_id else None,
            "message": alert.message,
        }
        for alert in alerts
    ]

    return {
        "active_work_orders": wo_snapshot,
        "active_alerts": alert_snapshot,
        "machine_statuses": [],
        "sensor_anomalies": [],
    }


async def create_handover(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    plant_id: uuid.UUID | None,
    shift_date: date,
    shift_type: str,
    user_id: uuid.UUID,
) -> ShiftHandover:
    snapshots = await auto_populate(db, tenant_id)
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


async def update_handover(
    db: AsyncSession, handover: ShiftHandover, data: dict
) -> ShiftHandover:
    allowed = {"events", "open_items", "safety_notes", "production_notes"}
    for field, value in data.items():
        if field in allowed:
            setattr(handover, field, value)
    await db.flush()
    await db.refresh(handover)
    return handover


async def sign_outgoing(
    db: AsyncSession, handover: ShiftHandover, user_id: uuid.UUID
) -> ShiftHandover:
    handover.outgoing_user_id = user_id
    handover.outgoing_signed_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(handover)
    return handover


async def acknowledge_incoming(
    db: AsyncSession, handover: ShiftHandover, user_id: uuid.UUID
) -> ShiftHandover:
    handover.incoming_user_id = user_id
    handover.incoming_acknowledged_at = datetime.now(timezone.utc)
    handover.is_locked = True
    await db.flush()
    await db.refresh(handover)
    return handover
