"""Failure code service — CRUD + hierarchy management."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.failure_code import FailureCode
from core.schemas.failure_code import FailureCodeCreate, FailureCodeUpdate


async def list_failure_codes(
    db: AsyncSession, level: str | None = None, parent_id: uuid.UUID | None = None
) -> list[FailureCode]:
    query = select(FailureCode).where(FailureCode.is_active == True).order_by(FailureCode.sort_order)
    if level:
        query = query.where(FailureCode.level == level)
    if parent_id:
        query = query.where(FailureCode.parent_id == parent_id)
    elif level is None:
        # Top-level only (problems)
        query = query.where(FailureCode.parent_id.is_(None))
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_failure_code(db: AsyncSession, code_id: uuid.UUID) -> FailureCode | None:
    result = await db.execute(select(FailureCode).where(FailureCode.id == code_id))
    return result.scalar_one_or_none()


async def create_failure_code(
    db: AsyncSession, tenant_id: uuid.UUID, data: FailureCodeCreate
) -> FailureCode:
    code = FailureCode(tenant_id=tenant_id, **data.model_dump())
    db.add(code)
    await db.flush()
    await db.refresh(code)
    return code


async def update_failure_code(
    db: AsyncSession, code: FailureCode, data: FailureCodeUpdate
) -> FailureCode:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(code, field, value)
    await db.flush()
    await db.refresh(code)
    return code


async def get_full_taxonomy(db: AsyncSession) -> list[FailureCode]:
    """Get the full failure code tree (problems with nested causes and actions)."""
    result = await db.execute(
        select(FailureCode)
        .where(FailureCode.is_active == True, FailureCode.parent_id.is_(None))
        .order_by(FailureCode.sort_order)
    )
    return list(result.scalars().all())


async def seed_default_codes(db: AsyncSession, tenant_id: uuid.UUID) -> None:
    """Seed a tenant with standard failure codes (ISO 14224 inspired)."""
    defaults = [
        ("MECH", "Mechanical Failure", "problem", [
            ("BEAR", "Bearing Failure", "cause", [("REPL", "Replace Bearing", "action"), ("LUBR", "Relubricate", "action")]),
            ("SEAL", "Seal/Gasket Leak", "cause", [("REPL-S", "Replace Seal", "action")]),
            ("WEAR", "Wear/Erosion", "cause", [("REPL-P", "Replace Part", "action"), ("RECOND", "Recondition", "action")]),
            ("ALIG", "Misalignment", "cause", [("ALIGN", "Realign", "action")]),
            ("VIBR", "Excessive Vibration", "cause", [("BALN", "Balance", "action"), ("TIGHTN", "Tighten", "action")]),
        ]),
        ("ELEC", "Electrical Failure", "problem", [
            ("MOTOR", "Motor Failure", "cause", [("REWIND", "Rewind Motor", "action"), ("REPL-M", "Replace Motor", "action")]),
            ("WIRING", "Wiring/Connection", "cause", [("REPAIR-W", "Repair Wiring", "action")]),
            ("SENSOR", "Sensor Malfunction", "cause", [("CALIB", "Recalibrate", "action"), ("REPL-SEN", "Replace Sensor", "action")]),
            ("CTRL", "Control System", "cause", [("RESET", "Reset/Reprogram", "action"), ("REPL-CTRL", "Replace Controller", "action")]),
        ]),
        ("PROC", "Process Issue", "problem", [
            ("PARAM", "Parameter Drift", "cause", [("ADJUST", "Adjust Parameters", "action")]),
            ("CONTAM", "Contamination", "cause", [("CLEAN", "Clean/Flush", "action")]),
            ("OVERLOAD", "Overload", "cause", [("REDUCE", "Reduce Load", "action"), ("UPGRADE", "Upgrade Capacity", "action")]),
        ]),
        ("INSTR", "Instrumentation", "problem", [
            ("CALIB-I", "Out of Calibration", "cause", [("RECALIB", "Recalibrate", "action")]),
            ("PLUGGED", "Plugged/Blocked", "cause", [("UNBLOCK", "Unblock/Clean", "action")]),
        ]),
        ("OTHER", "Other", "problem", [
            ("UNKNOWN", "Unknown Root Cause", "cause", [("INVEST", "Investigate Further", "action")]),
            ("EXTERN", "External Factor", "cause", [("MITIGATE", "Mitigate", "action")]),
        ]),
    ]

    for pcode, pname, plevel, causes in defaults:
        problem = FailureCode(tenant_id=tenant_id, code=pcode, name=pname, level=plevel)
        db.add(problem)
        await db.flush()
        for ccode, cname, clevel, actions in causes:
            cause = FailureCode(
                tenant_id=tenant_id, parent_id=problem.id,
                code=ccode, name=cname, level=clevel,
            )
            db.add(cause)
            await db.flush()
            for acode, aname, alevel in actions:
                action = FailureCode(
                    tenant_id=tenant_id, parent_id=cause.id,
                    code=acode, name=aname, level=alevel,
                )
                db.add(action)
        await db.flush()
