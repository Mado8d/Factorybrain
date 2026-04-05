"""Work order event service — create events and auto-log system actions."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.work_order_event import WorkOrderEvent
from core.schemas.work_order_event import EventCreate


async def list_events(
    db: AsyncSession,
    work_order_id: uuid.UUID,
    event_types: list[str] | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[WorkOrderEvent]:
    query = (
        select(WorkOrderEvent)
        .where(WorkOrderEvent.work_order_id == work_order_id)
        .order_by(WorkOrderEvent.created_at.desc())
    )
    if event_types:
        query = query.where(WorkOrderEvent.event_type.in_(event_types))
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def create_event(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    work_order_id: uuid.UUID,
    user_id: uuid.UUID | None,
    data: EventCreate,
) -> WorkOrderEvent:
    event = WorkOrderEvent(
        tenant_id=tenant_id,
        work_order_id=work_order_id,
        user_id=user_id,
        event_type=data.event_type,
        content=data.content,
        metadata_=data.metadata,
        mentions=data.mentions or None,
        attachments=data.attachments,
    )
    db.add(event)
    await db.flush()
    await db.refresh(event)
    return event


async def create_system_event(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    work_order_id: uuid.UUID,
    event_type: str,
    content: str,
    metadata: dict | None = None,
    user_id: uuid.UUID | None = None,
) -> WorkOrderEvent:
    """Create a system-generated event (status change, assignment, etc.)."""
    event = WorkOrderEvent(
        tenant_id=tenant_id,
        work_order_id=work_order_id,
        user_id=user_id,
        event_type=event_type,
        content=content,
        metadata_=metadata or {},
    )
    db.add(event)
    await db.flush()
    return event
