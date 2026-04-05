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


# --- Seed Demo Spare Parts ---


@router.post("/parts/seed-demo", status_code=201)
async def seed_demo_parts(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Seed ~30 realistic demo spare parts. Admin only."""
    if user.role not in ("admin", "manager"):
        raise HTTPException(status_code=403, detail="Admin access required")
    await set_tenant_context(db, str(user.tenant_id))

    from decimal import Decimal

    from core.models.maintenance import SparePart

    demo_parts = [
        # Bearings
        {
            "name": "Deep Groove Ball Bearing 6205-2RS",
            "part_number": "SKF-6205-2RS",
            "category": "Bearings",
            "supplier": "SKF",
            "unit_cost": Decimal("18.50"),
            "quantity_in_stock": 24,
            "min_stock_level": 4,
            "location": "Shelf A1",
        },
        {
            "name": "Deep Groove Ball Bearing 6305-2Z",
            "part_number": "SKF-6305-2Z",
            "category": "Bearings",
            "supplier": "SKF",
            "unit_cost": Decimal("22.80"),
            "quantity_in_stock": 12,
            "min_stock_level": 3,
            "location": "Shelf A1",
        },
        {
            "name": "Deep Groove Ball Bearing 6206-C",
            "part_number": "FAG-6206-C",
            "category": "Bearings",
            "supplier": "FAG (Schaeffler)",
            "unit_cost": Decimal("24.90"),
            "quantity_in_stock": 8,
            "min_stock_level": 3,
            "location": "Shelf A2",
        },
        {
            "name": "Deep Groove Ball Bearing 6207-DDU",
            "part_number": "NSK-6207-DDU",
            "category": "Bearings",
            "supplier": "NSK",
            "unit_cost": Decimal("27.40"),
            "quantity_in_stock": 6,
            "min_stock_level": 2,
            "location": "Shelf A2",
        },
        {
            "name": "Tapered Roller Bearing 32208",
            "part_number": "TIM-32208",
            "category": "Bearings",
            "supplier": "Timken",
            "unit_cost": Decimal("45.60"),
            "quantity_in_stock": 4,
            "min_stock_level": 2,
            "location": "Shelf A3",
        },
        # Belts
        {
            "name": "PowerGrip GT3 Timing Belt 8MGT-1200",
            "part_number": "GATES-8MGT-1200",
            "category": "Belts",
            "supplier": "Gates",
            "unit_cost": Decimal("89.00"),
            "quantity_in_stock": 3,
            "min_stock_level": 1,
            "location": "Shelf B1",
        },
        {
            "name": "V-Belt 5V-1060",
            "part_number": "CONTI-5V-1060",
            "category": "Belts",
            "supplier": "Continental Contitech",
            "unit_cost": Decimal("34.50"),
            "quantity_in_stock": 5,
            "min_stock_level": 2,
            "location": "Shelf B1",
        },
        {
            "name": "Wedge Belt SK S=C Plus 2120",
            "part_number": "OPTI-SCS-2120",
            "category": "Belts",
            "supplier": "Optibelt",
            "unit_cost": Decimal("42.30"),
            "quantity_in_stock": 2,
            "min_stock_level": 2,
            "location": "Shelf B2",
        },
        # Filters
        {
            "name": "Air Filter Element C 30 810",
            "part_number": "MH-C30810",
            "category": "Filters",
            "supplier": "Mann+Hummel",
            "unit_cost": Decimal("56.20"),
            "quantity_in_stock": 6,
            "min_stock_level": 2,
            "location": "Cabinet C1",
        },
        {
            "name": "Air Filter P181099",
            "part_number": "DON-P181099",
            "category": "Filters",
            "supplier": "Donaldson",
            "unit_cost": Decimal("48.90"),
            "quantity_in_stock": 4,
            "min_stock_level": 2,
            "location": "Cabinet C1",
        },
        {
            "name": "Hydraulic Filter 926841Q",
            "part_number": "PAR-926841Q",
            "category": "Filters",
            "supplier": "Parker",
            "unit_cost": Decimal("112.00"),
            "quantity_in_stock": 3,
            "min_stock_level": 1,
            "location": "Cabinet C2",
        },
        {
            "name": "Hydraulic Filter 0060 D 010 BN4HC",
            "part_number": "HYD-0060D010",
            "category": "Filters",
            "supplier": "Hydac",
            "unit_cost": Decimal("134.50"),
            "quantity_in_stock": 2,
            "min_stock_level": 1,
            "location": "Cabinet C2",
        },
        # Seals
        {
            "name": "Radial Shaft Seal BAUM3SLX7 40x62x7",
            "part_number": "FRE-BAUM3-40627",
            "category": "Seals",
            "supplier": "Freudenberg Simrit",
            "unit_cost": Decimal("12.80"),
            "quantity_in_stock": 15,
            "min_stock_level": 5,
            "location": "Drawer D1",
        },
        {
            "name": "Radial Shaft Seal CR 25x42x7 HMS5",
            "part_number": "SKF-CR-254207",
            "category": "Seals",
            "supplier": "SKF",
            "unit_cost": Decimal("9.60"),
            "quantity_in_stock": 20,
            "min_stock_level": 5,
            "location": "Drawer D1",
        },
        {
            "name": "O-Ring 2-212 NBR 70",
            "part_number": "PAR-2-212-NBR",
            "category": "Seals",
            "supplier": "Parker",
            "unit_cost": Decimal("2.40"),
            "quantity_in_stock": 50,
            "min_stock_level": 10,
            "location": "Drawer D2",
        },
        # Electrical
        {
            "name": "Motor Starter 3RV2011-1JA10",
            "part_number": "SIE-3RV2011-1JA10",
            "category": "Electrical",
            "supplier": "Siemens",
            "unit_cost": Decimal("78.50"),
            "quantity_in_stock": 3,
            "min_stock_level": 1,
            "location": "Cabinet E1",
        },
        {
            "name": "Contactor LC1D09",
            "part_number": "SCH-LC1D09",
            "category": "Electrical",
            "supplier": "Schneider Electric",
            "unit_cost": Decimal("45.20"),
            "quantity_in_stock": 5,
            "min_stock_level": 2,
            "location": "Cabinet E1",
        },
        {
            "name": "DIN Rail Terminal 1011000000",
            "part_number": "WEI-1011000000",
            "category": "Electrical",
            "supplier": "Weidmuller",
            "unit_cost": Decimal("3.80"),
            "quantity_in_stock": 40,
            "min_stock_level": 10,
            "location": "Cabinet E2",
        },
        {
            "name": "Relay Module 2866776",
            "part_number": "PHX-2866776",
            "category": "Electrical",
            "supplier": "Phoenix Contact",
            "unit_cost": Decimal("32.90"),
            "quantity_in_stock": 6,
            "min_stock_level": 2,
            "location": "Cabinet E2",
        },
        # Lubrication
        {
            "name": "Grease Alvania RL3 400g Cartridge",
            "part_number": "SHELL-RL3-400",
            "category": "Lubrication",
            "supplier": "Shell",
            "unit_cost": Decimal("14.50"),
            "quantity_in_stock": 12,
            "min_stock_level": 4,
            "location": "Shelf F1",
        },
        {
            "name": "Synthetic Gear Oil SHC 630 1L",
            "part_number": "MOBIL-SHC630-1L",
            "category": "Lubrication",
            "supplier": "Mobil",
            "unit_cost": Decimal("38.90"),
            "quantity_in_stock": 4,
            "min_stock_level": 2,
            "location": "Shelf F1",
        },
        {
            "name": "Bearing Grease LGMT 2 420ml",
            "part_number": "SKF-LGMT2-420",
            "category": "Lubrication",
            "supplier": "SKF",
            "unit_cost": Decimal("16.80"),
            "quantity_in_stock": 8,
            "min_stock_level": 3,
            "location": "Shelf F2",
        },
        # Fasteners
        {
            "name": "Hex Bolt M10x40 DIN 933 Grade 8.8 (Box/100)",
            "part_number": "FAST-M10X40-88",
            "category": "Fasteners",
            "supplier": "Wurth",
            "unit_cost": Decimal("28.50"),
            "quantity_in_stock": 5,
            "min_stock_level": 2,
            "location": "Shelf G1",
        },
        {
            "name": "Nord-Lock Washer M8 (Box/200)",
            "part_number": "NL-M8-200",
            "category": "Fasteners",
            "supplier": "Nord-Lock",
            "unit_cost": Decimal("62.00"),
            "quantity_in_stock": 3,
            "min_stock_level": 1,
            "location": "Shelf G1",
        },
        # Sensors
        {
            "name": "Inductive Proximity Sensor IME12-04BPSZW2S",
            "part_number": "SICK-IME12-04BP",
            "category": "Sensors",
            "supplier": "SICK",
            "unit_cost": Decimal("89.00"),
            "quantity_in_stock": 4,
            "min_stock_level": 2,
            "location": "Cabinet H1",
        },
        {
            "name": "Flow Sensor SI5010",
            "part_number": "IFM-SI5010",
            "category": "Sensors",
            "supplier": "IFM Electronic",
            "unit_cost": Decimal("385.00"),
            "quantity_in_stock": 1,
            "min_stock_level": 1,
            "location": "Cabinet H1",
        },
        {
            "name": "Inductive Sensor BES M18MI-PSC80B",
            "part_number": "BAL-BESM18MI",
            "category": "Sensors",
            "supplier": "Balluff",
            "unit_cost": Decimal("124.50"),
            "quantity_in_stock": 3,
            "min_stock_level": 1,
            "location": "Cabinet H2",
        },
        # Extra parts for variety
        {
            "name": "Coupling Spider GS 28 98ShA",
            "part_number": "KTR-GS28-98",
            "category": "Bearings",
            "supplier": "KTR",
            "unit_cost": Decimal("15.30"),
            "quantity_in_stock": 6,
            "min_stock_level": 2,
            "location": "Shelf A3",
        },
        {
            "name": "Fuse 10A gG 10x38mm (Box/10)",
            "part_number": "SIE-FUSE-10A",
            "category": "Electrical",
            "supplier": "Siemens",
            "unit_cost": Decimal("8.90"),
            "quantity_in_stock": 3,
            "min_stock_level": 2,
            "location": "Cabinet E3",
        },
        {
            "name": "Pneumatic Quick Coupler DN7.2",
            "part_number": "FEST-QC-DN72",
            "category": "Fasteners",
            "supplier": "Festo",
            "unit_cost": Decimal("7.20"),
            "quantity_in_stock": 15,
            "min_stock_level": 5,
            "location": "Shelf G2",
        },
    ]

    created = []
    for part_data in demo_parts:
        part = SparePart(tenant_id=user.tenant_id, **part_data)
        db.add(part)
        created.append(part)

    await db.flush()
    for p in created:
        await db.refresh(p)

    return {"message": f"Seeded {len(created)} demo spare parts", "count": len(created)}
