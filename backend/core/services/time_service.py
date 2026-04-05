"""Time tracking service — start, pause, stop, manual entry."""

import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import utcnow
from core.models.time_entry import TimeEntry
from core.services.event_service import create_system_event


async def get_active_timer(db: AsyncSession, user_id: uuid.UUID) -> TimeEntry | None:
    """Get the currently running timer for a user (if any)."""
    result = await db.execute(
        select(TimeEntry)
        .where(
            TimeEntry.user_id == user_id,
            TimeEntry.stopped_at.is_(None),
        )
        .order_by(TimeEntry.started_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def list_entries(
    db: AsyncSession,
    work_order_id: uuid.UUID,
    limit: int = 50,
    offset: int = 0,
) -> list[TimeEntry]:
    result = await db.execute(
        select(TimeEntry)
        .where(TimeEntry.work_order_id == work_order_id)
        .order_by(TimeEntry.started_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def start_timer(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    work_order_id: uuid.UUID,
    user_id: uuid.UUID,
    category: str = "wrench",
) -> TimeEntry:
    # Auto-pause any existing timer for this user
    active = await get_active_timer(db, user_id)
    if active:
        await pause_timer(db, tenant_id, active)

    now = utcnow()
    entry = TimeEntry(
        tenant_id=tenant_id,
        work_order_id=work_order_id,
        user_id=user_id,
        started_at=now,
        category=category,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    # Log event
    await create_system_event(
        db,
        tenant_id,
        work_order_id,
        "time_start",
        f"Started time tracking ({category})",
        {"category": category, "time_entry_id": str(entry.id)},
        user_id=user_id,
    )

    return entry


async def pause_timer(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    entry: TimeEntry,
) -> TimeEntry:
    if entry.paused_at or entry.stopped_at:
        return entry
    entry.paused_at = utcnow()
    await db.flush()
    await db.refresh(entry)
    return entry


async def resume_timer(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    entry: TimeEntry,
) -> TimeEntry:
    if not entry.paused_at or entry.stopped_at:
        return entry
    # Adjust started_at to account for pause duration
    pause_duration = utcnow() - entry.paused_at
    entry.started_at = entry.started_at + pause_duration
    entry.paused_at = None
    await db.flush()
    await db.refresh(entry)
    return entry


async def stop_timer(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    entry: TimeEntry,
    notes: str | None = None,
) -> TimeEntry:
    if entry.stopped_at:
        return entry

    now = utcnow()
    effective_end = entry.paused_at if entry.paused_at else now
    entry.stopped_at = now
    entry.duration_seconds = int((effective_end - entry.started_at).total_seconds())
    if notes:
        entry.notes = notes
    await db.flush()
    await db.refresh(entry)

    # Log event
    duration_str = _format_duration(entry.duration_seconds)
    await create_system_event(
        db,
        tenant_id,
        entry.work_order_id,
        "time_stop",
        f"Logged {duration_str} ({entry.category})",
        {
            "category": entry.category,
            "duration_seconds": entry.duration_seconds,
            "time_entry_id": str(entry.id),
        },
        user_id=entry.user_id,
    )

    return entry


async def create_manual_entry(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    work_order_id: uuid.UUID,
    user_id: uuid.UUID,
    started_at: datetime,
    stopped_at: datetime,
    category: str = "wrench",
    notes: str | None = None,
) -> TimeEntry:
    duration = int((stopped_at - started_at).total_seconds())
    entry = TimeEntry(
        tenant_id=tenant_id,
        work_order_id=work_order_id,
        user_id=user_id,
        started_at=started_at,
        stopped_at=stopped_at,
        category=category,
        duration_seconds=duration,
        notes=notes,
    )
    db.add(entry)
    await db.flush()
    await db.refresh(entry)

    duration_str = _format_duration(duration)
    await create_system_event(
        db,
        tenant_id,
        work_order_id,
        "time_stop",
        f"Manually logged {duration_str} ({category})",
        {"category": category, "duration_seconds": duration},
        user_id=user_id,
    )

    return entry


async def get_wo_total_time(db: AsyncSession, work_order_id: uuid.UUID) -> dict:
    """Get total time breakdown for a work order."""
    entries = await list_entries(db, work_order_id, limit=500)
    total = 0
    by_category: dict[str, int] = {}
    by_user: dict[str, int] = {}

    for e in entries:
        if e.duration_seconds:
            total += e.duration_seconds
            by_category[e.category] = by_category.get(e.category, 0) + e.duration_seconds
            user_name = e.user.name if e.user else "Unknown"
            by_user[user_name] = by_user.get(user_name, 0) + e.duration_seconds

    return {
        "total_seconds": total,
        "total_formatted": _format_duration(total),
        "by_category": {k: {"seconds": v, "formatted": _format_duration(v)} for k, v in by_category.items()},
        "by_user": {k: {"seconds": v, "formatted": _format_duration(v)} for k, v in by_user.items()},
    }


def _format_duration(seconds: int) -> str:
    h, remainder = divmod(seconds, 3600)
    m, s = divmod(remainder, 60)
    if h > 0:
        return f"{h}h {m}m"
    return f"{m}m {s}s"
