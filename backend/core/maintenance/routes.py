"""Maintenance routes — alerts, work orders, service providers, events, time tracking, requests."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.schemas.maintenance import (
    AlertCreate,
    AlertResponse,
    AlertUpdate,
    ServiceProviderCreate,
    ServiceProviderResponse,
    SparePartCreate,
    SparePartResponse,
    SparePartUpdate,
    WorkOrderCreate,
    WorkOrderResponse,
    WorkOrderUpdate,
)
from core.schemas.time_entry import (
    TimeEntryResponse,
    TimeManualEntry,
    TimeStartRequest,
    TimeStopRequest,
)
from core.schemas.work_order_event import EventCreate, EventResponse
from core.schemas.work_request import WorkRequestResponse
from core.services import event_service, maintenance_service, request_service, time_service


def _event_to_dict(e) -> dict:
    """Convert WorkOrderEvent to dict, remapping metadata_ → metadata."""
    d = {c.key: getattr(e, c.key) for c in e.__table__.columns}
    if "metadata_" in d:
        d["metadata"] = d.pop("metadata_")
    return d


router = APIRouter()


# --- Alerts ---


@router.get("/alerts", response_model=list[AlertResponse])
async def list_alerts(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_alerts(db, status, limit=limit, offset=offset)


@router.get("/alerts/{alert_id}", response_model=AlertResponse)
async def get_alert(alert_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    alert = await maintenance_service.get_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


@router.post("/alerts", response_model=AlertResponse, status_code=201)
async def create_alert(data: AlertCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_alert(db, user.tenant_id, data)


@router.patch("/alerts/{alert_id}", response_model=AlertResponse)
async def update_alert(
    alert_id: uuid.UUID,
    data: AlertUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    alert = await maintenance_service.get_alert(db, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return await maintenance_service.update_alert(db, alert, data)


# --- Work Orders ---


@router.get("/work-orders", response_model=list[WorkOrderResponse])
async def list_work_orders(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_work_orders(db, status, limit=limit, offset=offset)


@router.get("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def get_work_order(wo_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return wo


@router.post("/work-orders", response_model=WorkOrderResponse, status_code=201)
async def create_work_order(data: WorkOrderCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_work_order(db, user.tenant_id, data)


@router.patch("/work-orders/{wo_id}", response_model=WorkOrderResponse)
async def update_work_order(
    wo_id: uuid.UUID,
    data: WorkOrderUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    return await maintenance_service.update_work_order(db, wo, data)


# --- Service Providers ---


@router.get("/providers", response_model=list[ServiceProviderResponse])
async def list_providers(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_service_providers(db)


@router.post("/providers", response_model=ServiceProviderResponse, status_code=201)
async def create_provider(
    data: ServiceProviderCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_service_provider(db, user.tenant_id, data)


# --- Spare Parts ---


@router.get("/parts", response_model=list[SparePartResponse])
async def list_parts(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.list_spare_parts(db)


@router.post("/parts", response_model=SparePartResponse, status_code=201)
async def create_part(data: SparePartCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await maintenance_service.create_spare_part(db, user.tenant_id, data)


@router.patch("/parts/{part_id}", response_model=SparePartResponse)
async def update_part(part_id: uuid.UUID, data: SparePartUpdate, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    part = await maintenance_service.get_spare_part(db, part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    return await maintenance_service.update_spare_part(db, part, data)


@router.delete("/parts/{part_id}", status_code=204)
async def delete_part(part_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    part = await maintenance_service.get_spare_part(db, part_id)
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await maintenance_service.delete_spare_part(db, part)


# --- Work Order Events (Activity Feed) ---


@router.get("/work-orders/{wo_id}/events", response_model=list[EventResponse])
async def list_wo_events(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    types: str | None = Query(None, description="Comma-separated event types"),
    limit: int = 100,
    offset: int = 0,
):
    """Get activity feed for a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    event_types = types.split(",") if types else None
    events = await event_service.list_events(db, wo_id, event_types, limit, offset)
    return [
        EventResponse(
            **_event_to_dict(e),
            user_name=e.user.name if e.user else None,
            user_role=e.user.role if e.user else None,
        )
        for e in events
    ]


@router.post("/work-orders/{wo_id}/events", response_model=EventResponse, status_code=201)
async def create_wo_event(
    wo_id: uuid.UUID,
    data: EventCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Add a comment or event to a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    event = await event_service.create_event(db, user.tenant_id, wo_id, user.id, data)
    return EventResponse(
        **_event_to_dict(event),
        user_name=user.name,
        user_role=user.role,
    )


# --- Time Tracking ---


@router.get("/work-orders/{wo_id}/time", response_model=list[TimeEntryResponse])
async def list_wo_time(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get all time entries for a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    entries = await time_service.list_entries(db, wo_id)
    return [
        TimeEntryResponse(
            **{c.key: getattr(e, c.key) for c in e.__table__.columns},
            user_name=e.user.name if e.user else None,
        )
        for e in entries
    ]


@router.get("/work-orders/{wo_id}/time/summary")
async def get_wo_time_summary(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get total time breakdown for a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    return await time_service.get_wo_total_time(db, wo_id)


@router.post("/work-orders/{wo_id}/time/start", response_model=TimeEntryResponse)
async def start_wo_timer(
    wo_id: uuid.UUID,
    data: TimeStartRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Start time tracking on a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    wo = await maintenance_service.get_work_order(db, wo_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")
    entry = await time_service.start_timer(db, user.tenant_id, wo_id, user.id, data.category)
    return TimeEntryResponse(
        **{c.key: getattr(entry, c.key) for c in entry.__table__.columns},
        user_name=user.name,
    )


@router.post("/work-orders/{wo_id}/time/pause")
async def pause_wo_timer(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Pause the active timer."""
    active = await time_service.get_active_timer(db, user.id)
    if not active or str(active.work_order_id) != str(wo_id):
        raise HTTPException(status_code=404, detail="No active timer for this work order")
    await time_service.pause_timer(db, user.tenant_id, active)
    return {"message": "Timer paused"}


@router.post("/work-orders/{wo_id}/time/resume")
async def resume_wo_timer(
    wo_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused timer."""
    active = await time_service.get_active_timer(db, user.id)
    if not active or str(active.work_order_id) != str(wo_id):
        raise HTTPException(status_code=404, detail="No active timer for this work order")
    await time_service.resume_timer(db, user.tenant_id, active)
    return {"message": "Timer resumed"}


@router.post("/work-orders/{wo_id}/time/stop")
async def stop_wo_timer(
    wo_id: uuid.UUID,
    data: TimeStopRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Stop the active timer and log the time."""
    active = await time_service.get_active_timer(db, user.id)
    if not active or str(active.work_order_id) != str(wo_id):
        raise HTTPException(status_code=404, detail="No active timer for this work order")
    entry = await time_service.stop_timer(db, user.tenant_id, active, data.notes)
    return TimeEntryResponse(
        **{c.key: getattr(entry, c.key) for c in entry.__table__.columns},
        user_name=user.name,
    )


@router.post("/work-orders/{wo_id}/time/manual", response_model=TimeEntryResponse)
async def manual_time_entry(
    wo_id: uuid.UUID,
    data: TimeManualEntry,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Manually log time for a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    entry = await time_service.create_manual_entry(
        db,
        user.tenant_id,
        wo_id,
        user.id,
        data.started_at,
        data.stopped_at,
        data.category,
        data.notes,
    )
    return TimeEntryResponse(
        **{c.key: getattr(entry, c.key) for c in entry.__table__.columns},
        user_name=user.name,
    )


@router.get("/my-timer")
async def get_my_active_timer(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get the current user's active timer (if any)."""
    active = await time_service.get_active_timer(db, user.id)
    if not active:
        return None
    return TimeEntryResponse(
        **{c.key: getattr(active, c.key) for c in active.__table__.columns},
        user_name=user.name,
    )


# --- Work Requests (admin review) ---


@router.get("/requests", response_model=list[WorkRequestResponse])
async def list_requests(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
):
    """List work requests for this tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    requests = await request_service.list_requests(db, status, limit, offset)
    return [
        WorkRequestResponse(
            **{c.key: getattr(r, c.key) for c in r.__table__.columns},
            machine_name=r.machine.name if r.machine else None,
        )
        for r in requests
    ]


@router.get("/requests/count")
async def count_requests(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    status: str | None = "new",
):
    """Count requests (default: new only)."""
    await set_tenant_context(db, str(user.tenant_id))
    return {"count": await request_service.count_requests(db, status)}


@router.post("/requests/{request_id}/approve", response_model=WorkRequestResponse)
async def approve_request(
    request_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Approve a request and create a work order."""
    await set_tenant_context(db, str(user.tenant_id))
    req = await request_service.get_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.status != "new":
        raise HTTPException(status_code=400, detail="Request already reviewed")
    req = await request_service.approve_request(db, req, user.id)
    return WorkRequestResponse(
        **{c.key: getattr(req, c.key) for c in req.__table__.columns},
        machine_name=req.machine.name if req.machine else None,
    )


@router.post("/requests/{request_id}/reject", response_model=WorkRequestResponse)
async def reject_request(
    request_id: uuid.UUID,
    data: dict,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Reject a request with reason."""
    await set_tenant_context(db, str(user.tenant_id))
    req = await request_service.get_request(db, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    reason = data.get("reason", "")
    req = await request_service.reject_request(db, req, user.id, reason)
    return WorkRequestResponse(
        **{c.key: getattr(req, c.key) for c in req.__table__.columns},
        machine_name=req.machine.name if req.machine else None,
    )
