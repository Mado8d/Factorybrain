"""Work request service — submit, review, approve/reject requests."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.work_request import WorkRequest
from core.models.tenant import Tenant
from core.schemas.work_request import WorkRequestCreate
from core.services.event_service import create_system_event


async def get_tenant_by_slug(db: AsyncSession, slug: str) -> Tenant | None:
    result = await db.execute(select(Tenant).where(Tenant.slug == slug))
    return result.scalar_one_or_none()


async def list_requests(
    db: AsyncSession,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[WorkRequest]:
    query = select(WorkRequest).order_by(WorkRequest.created_at.desc())
    if status:
        query = query.where(WorkRequest.status == status)
    query = query.limit(limit).offset(offset)
    result = await db.execute(query)
    return list(result.scalars().all())


async def count_requests(db: AsyncSession, status: str | None = None) -> int:
    query = select(func.count()).select_from(WorkRequest)
    if status:
        query = query.where(WorkRequest.status == status)
    result = await db.execute(query)
    return result.scalar_one()


async def get_request(db: AsyncSession, request_id: uuid.UUID) -> WorkRequest | None:
    result = await db.execute(select(WorkRequest).where(WorkRequest.id == request_id))
    return result.scalar_one_or_none()


async def create_request(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    data: WorkRequestCreate,
) -> WorkRequest:
    req = WorkRequest(
        tenant_id=tenant_id,
        **data.model_dump(),
    )
    db.add(req)
    await db.flush()
    await db.refresh(req)
    return req


async def approve_request(
    db: AsyncSession,
    request: WorkRequest,
    reviewer_id: uuid.UUID,
) -> WorkRequest:
    """Approve a request and create a work order from it."""
    from core.services.maintenance_service import create_work_order
    from core.schemas.maintenance import WorkOrderCreate

    # Create work order from request
    wo_data = WorkOrderCreate(
        machine_id=request.machine_id,
        title=request.title,
        trigger_type="request",
        description=request.description,
        priority=_urgency_to_priority(request.urgency),
    )
    wo = await create_work_order(db, request.tenant_id, wo_data)

    # Update request
    request.status = "approved"
    request.reviewed_by = reviewer_id
    request.reviewed_at = datetime.now(timezone.utc)
    request.work_order_id = wo.id
    await db.flush()
    await db.refresh(request)

    # Log event on the new work order
    await create_system_event(
        db, request.tenant_id, wo.id, "request_note",
        f"Created from request by {request.requester_name or 'anonymous'}",
        {"request_id": str(request.id), "requester": request.requester_name},
        user_id=reviewer_id,
    )

    return request


async def reject_request(
    db: AsyncSession,
    request: WorkRequest,
    reviewer_id: uuid.UUID,
    reason: str,
) -> WorkRequest:
    request.status = "rejected"
    request.reviewed_by = reviewer_id
    request.reviewed_at = datetime.now(timezone.utc)
    request.review_notes = reason
    await db.flush()
    await db.refresh(request)
    return request


async def mark_duplicate(
    db: AsyncSession,
    request: WorkRequest,
    reviewer_id: uuid.UUID,
    existing_wo_id: uuid.UUID,
) -> WorkRequest:
    request.status = "duplicate"
    request.reviewed_by = reviewer_id
    request.reviewed_at = datetime.now(timezone.utc)
    request.work_order_id = existing_wo_id
    await db.flush()
    await db.refresh(request)
    return request


def _urgency_to_priority(urgency: str) -> str:
    return {
        "low": "low",
        "medium": "medium",
        "high": "high",
        "critical": "critical",
    }.get(urgency, "medium")
