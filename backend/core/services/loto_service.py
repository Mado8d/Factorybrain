"""LOTO service — procedures, permits, lock/unlock steps."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.base import utcnow
from core.models.loto import LOTOPermit, LOTOProcedure
from core.services import audit_service

# --- Procedures ---


async def list_procedures(db: AsyncSession, machine_id: uuid.UUID | None = None) -> list[LOTOProcedure]:
    query = select(LOTOProcedure).where(LOTOProcedure.is_active).order_by(LOTOProcedure.created_at.desc())
    if machine_id:
        query = query.where(LOTOProcedure.machine_id == machine_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_procedure(db: AsyncSession, procedure_id: uuid.UUID) -> LOTOProcedure | None:
    result = await db.execute(select(LOTOProcedure).where(LOTOProcedure.id == procedure_id))
    return result.scalar_one_or_none()


async def create_procedure(db: AsyncSession, tenant_id: uuid.UUID, data: dict) -> LOTOProcedure:
    procedure = LOTOProcedure(tenant_id=tenant_id, **data)
    db.add(procedure)
    await db.flush()
    await db.refresh(procedure)
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="create",
        resource_type="loto_procedure",
        resource_id=str(procedure.id),
        changes={"name": procedure.name},
    )
    return procedure


async def update_procedure(db: AsyncSession, procedure: LOTOProcedure, data: dict) -> LOTOProcedure:
    allowed = {
        "name",
        "energy_sources",
        "ppe_required",
        "special_instructions",
        "is_active",
        "version",
    }
    for field, value in data.items():
        if field in allowed:
            setattr(procedure, field, value)
    await db.flush()
    await db.refresh(procedure)
    return procedure


# --- Permits ---


async def create_permit(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    work_order_id: uuid.UUID,
    procedure_id: uuid.UUID,
    user_id: uuid.UUID,
) -> LOTOPermit:
    # Copy isolation steps from procedure as empty tracking entries
    procedure = await get_procedure(db, procedure_id)
    if not procedure:
        raise ValueError("Procedure not found")
    isolation_steps = [
        {
            "step_idx": idx,
            "source": src,
            "locked_by": None,
            "locked_at": None,
            "lock_id": None,
            "verified": False,
            "unlocked_by": None,
            "unlocked_at": None,
        }
        for idx, src in enumerate(procedure.energy_sources)
    ]
    permit = LOTOPermit(
        tenant_id=tenant_id,
        work_order_id=work_order_id,
        procedure_id=procedure_id,
        requested_by=user_id,
        isolation_steps=isolation_steps,
    )
    db.add(permit)
    await db.flush()
    await db.refresh(permit)
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=user_id,
        action="create",
        resource_type="loto_permit",
        resource_id=str(permit.id),
        changes={"work_order_id": str(work_order_id), "status": "draft"},
    )
    return permit


async def get_permit(db: AsyncSession, permit_id: uuid.UUID) -> LOTOPermit | None:
    result = await db.execute(select(LOTOPermit).where(LOTOPermit.id == permit_id))
    return result.scalar_one_or_none()


async def get_permit_for_wo(db: AsyncSession, work_order_id: uuid.UUID) -> LOTOPermit | None:
    result = await db.execute(
        select(LOTOPermit).where(LOTOPermit.work_order_id == work_order_id).order_by(LOTOPermit.created_at.desc())
    )
    return result.scalars().first()


async def authorize_permit(db: AsyncSession, permit: LOTOPermit, authorizer_id: uuid.UUID) -> LOTOPermit:
    permit.authorized_by = authorizer_id
    permit.authorized_at = utcnow()
    permit.status = "active"
    await db.flush()
    await db.refresh(permit)
    await audit_service.log_action(
        db,
        permit.tenant_id,
        user_id=authorizer_id,
        action="update",
        resource_type="loto_permit",
        resource_id=str(permit.id),
        changes={"status": "active", "authorized_by": str(authorizer_id)},
    )
    return permit


async def lock_step(
    db: AsyncSession,
    permit: LOTOPermit,
    step_idx: int,
    user_id: uuid.UUID,
    lock_id: str,
) -> LOTOPermit:
    steps = list(permit.isolation_steps)  # make mutable copy
    if step_idx < 0 or step_idx >= len(steps):
        raise ValueError("Invalid step index")
    now = utcnow().isoformat()
    steps[step_idx]["locked_by"] = str(user_id)
    steps[step_idx]["locked_at"] = now
    steps[step_idx]["lock_id"] = lock_id
    steps[step_idx]["verified"] = True
    permit.isolation_steps = steps

    # Check if all locked
    if all(s.get("locked_by") for s in steps):
        permit.all_locked_at = utcnow()
        permit.status = "work_in_progress"
        permit.work_started_at = utcnow()

    await db.flush()
    await db.refresh(permit)
    return permit


async def unlock_step(
    db: AsyncSession,
    permit: LOTOPermit,
    step_idx: int,
    user_id: uuid.UUID,
) -> LOTOPermit:
    steps = list(permit.isolation_steps)
    if step_idx < 0 or step_idx >= len(steps):
        raise ValueError("Invalid step index")
    now = utcnow().isoformat()
    steps[step_idx]["unlocked_by"] = str(user_id)
    steps[step_idx]["unlocked_at"] = now
    steps[step_idx]["lock_id"] = None
    permit.isolation_steps = steps
    await db.flush()
    await db.refresh(permit)
    return permit


async def check_all_locked(db: AsyncSession, permit: LOTOPermit) -> bool:
    return all(s.get("locked_by") for s in permit.isolation_steps)


async def complete_permit(db: AsyncSession, permit: LOTOPermit) -> LOTOPermit:
    # Verify all steps are unlocked
    all_unlocked = all(s.get("unlocked_by") for s in permit.isolation_steps)
    if not all_unlocked:
        raise ValueError("All isolation steps must be unlocked before completing")
    permit.status = "completed"
    permit.all_unlocked_at = utcnow()
    permit.work_completed_at = utcnow()
    await db.flush()
    await db.refresh(permit)
    return permit


async def check_wo_loto_clearance(db: AsyncSession, work_order_id: uuid.UUID) -> bool:
    """Check if a work order has LOTO clearance to start work.

    Returns True if no LOTO permit exists (not required) or if a permit
    is active with all steps locked (work_in_progress).
    """
    permit = await get_permit_for_wo(db, work_order_id)
    if not permit:
        return True  # No LOTO required
    return permit.status in ("work_in_progress", "completed")
