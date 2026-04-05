"""Production data routes — logs, OEE summary, CSV import, demo seeding."""

import csv
import io
import uuid
from datetime import date

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.models.machine import Machine
from core.schemas.production import (
    ExcelImportResponse,
    ProductionLogCreate,
    ProductionLogResponse,
    ProductionLogUpdate,
    ProductionSummary,
)
from core.services import production_service

router = APIRouter()


def _log_to_response(log) -> dict:
    """Convert a ProductionLog ORM object to response dict."""
    d = {c.key: getattr(log, c.key) for c in log.__table__.columns}
    d["machine_name"] = log.machine.name if log.machine else None
    return d


@router.get("", response_model=list[ProductionLogResponse])
async def list_logs(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    machine_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = 100,
    offset: int = 0,
):
    """List production logs with optional filters."""
    await set_tenant_context(db, str(user.tenant_id))
    logs = await production_service.list_logs(
        db, machine_id, date_from=date_from, date_to=date_to, limit=limit, offset=offset
    )
    return [ProductionLogResponse(**_log_to_response(log)) for log in logs]


@router.get("/summary", response_model=ProductionSummary)
async def get_summary(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    machine_id: uuid.UUID | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
):
    """Get aggregated OEE metrics for a date range."""
    await set_tenant_context(db, str(user.tenant_id))
    return await production_service.get_summary(db, machine_id, date_from, date_to)


@router.get("/oee-trend")
async def get_oee_trend(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
    machine_id: uuid.UUID | None = None,
    days: int = Query(30, ge=1, le=365),
):
    """Get daily OEE trend data."""
    await set_tenant_context(db, str(user.tenant_id))
    return await production_service.get_oee_trend(db, machine_id, days)


@router.get("/{log_id}", response_model=ProductionLogResponse)
async def get_log(
    log_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    log = await production_service.get_log(db, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Production log not found")
    return ProductionLogResponse(**_log_to_response(log))


@router.post("", response_model=ProductionLogResponse, status_code=201)
async def create_log(
    data: ProductionLogCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a manual production log entry."""
    await set_tenant_context(db, str(user.tenant_id))
    log = await production_service.create_log(db, user.tenant_id, data)
    return ProductionLogResponse(**_log_to_response(log))


@router.patch("/{log_id}", response_model=ProductionLogResponse)
async def update_log(
    log_id: uuid.UUID,
    data: ProductionLogUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    log = await production_service.get_log(db, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Production log not found")
    log = await production_service.update_log(db, log, data)
    return ProductionLogResponse(**_log_to_response(log))


@router.delete("/{log_id}", status_code=204)
async def delete_log(
    log_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    log = await production_service.get_log(db, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Production log not found")
    await production_service.delete_log(db, log)


@router.post("/import-csv", response_model=ExcelImportResponse)
async def import_csv(
    user: CurrentUser,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """Bulk import production data from CSV file."""
    await set_tenant_context(db, str(user.tenant_id))

    if not file.filename or not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Build machine name -> id lookup
    machines_result = await db.execute(select(Machine).where(Machine.tenant_id == user.tenant_id))
    machines_map = {m.name.lower(): m.id for m in machines_result.scalars().all()}

    logs: list[ProductionLogCreate] = []
    errors: list[dict] = []
    row_num = 0

    for row in reader:
        row_num += 1
        try:
            machine_name = row.get("machine_name", "").strip()
            machine_id = machines_map.get(machine_name.lower()) if machine_name else None

            log_data = ProductionLogCreate(
                machine_id=machine_id,
                shift_date=date.fromisoformat(row["shift_date"].strip()),
                shift_type=row.get("shift_type", "").strip() or None,
                planned_units=int(row.get("planned_units", 0) or 0),
                actual_units=int(row.get("actual_units", 0) or 0),
                defect_units=int(row.get("defect_units", 0) or 0),
                planned_runtime_minutes=int(row.get("planned_runtime_minutes", 480) or 480),
                actual_runtime_minutes=int(row["actual_runtime_minutes"])
                if row.get("actual_runtime_minutes")
                else None,
                downtime_minutes=int(row.get("downtime_minutes", 0) or 0),
                product_type=row.get("product_type", "").strip() or None,
                batch_number=row.get("batch_number", "").strip() or None,
                source="csv",
            )
            logs.append(log_data)
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})

    if logs:
        imported, import_errors = await production_service.bulk_import(
            db, user.tenant_id, logs, source="csv", user_id=user.id
        )
        errors.extend(import_errors)
    else:
        imported = 0

    return ExcelImportResponse(imported=imported, errors=errors, total_rows=row_num)


@router.post("/seed-demo", status_code=201)
async def seed_demo_data(
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Seed 30 days of demo production data. Admin only."""
    if user.role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin access required")
    await set_tenant_context(db, str(user.tenant_id))
    count = await production_service.seed_demo_data(db, user.tenant_id)
    return {"message": f"Seeded {count} production logs", "count": count}
