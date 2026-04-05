"""Technician scheduling service — skills, availability, smart assignment."""

import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.maintenance import MaintenanceWorkOrder
from core.models.technician import (
    MachineSkillRequirement,
    TechnicianAvailability,
    TechnicianSkill,
)
from core.models.user import User

# --- Skills ---


async def list_skills(db: AsyncSession, user_id: uuid.UUID | None = None) -> list[TechnicianSkill]:
    query = select(TechnicianSkill).order_by(TechnicianSkill.created_at.desc())
    if user_id:
        query = query.where(TechnicianSkill.user_id == user_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def get_skill(db: AsyncSession, skill_id: uuid.UUID) -> TechnicianSkill | None:
    result = await db.execute(select(TechnicianSkill).where(TechnicianSkill.id == skill_id))
    return result.scalar_one_or_none()


async def set_skill(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    skill_type: str,
    level: int,
    is_certified: bool = False,
    certification_expiry: date | None = None,
) -> TechnicianSkill:
    """Upsert a technician skill — update if exists, create if not."""
    result = await db.execute(
        select(TechnicianSkill).where(
            TechnicianSkill.user_id == user_id,
            TechnicianSkill.skill_type == skill_type,
        )
    )
    skill = result.scalar_one_or_none()

    if skill:
        skill.level = level
        skill.is_certified = is_certified
        skill.certification_expiry = certification_expiry
    else:
        skill = TechnicianSkill(
            tenant_id=tenant_id,
            user_id=user_id,
            skill_type=skill_type,
            level=level,
            is_certified=is_certified,
            certification_expiry=certification_expiry,
        )
        db.add(skill)

    await db.flush()
    await db.refresh(skill)
    return skill


async def delete_skill(db: AsyncSession, skill: TechnicianSkill) -> None:
    await db.delete(skill)
    await db.flush()


# --- Machine Requirements ---


async def list_machine_requirements(db: AsyncSession, machine_id: uuid.UUID) -> list[MachineSkillRequirement]:
    result = await db.execute(
        select(MachineSkillRequirement)
        .where(MachineSkillRequirement.machine_id == machine_id)
        .order_by(MachineSkillRequirement.skill_type)
    )
    return list(result.scalars().all())


async def set_machine_requirement(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    machine_id: uuid.UUID,
    skill_type: str,
    min_level: int,
) -> MachineSkillRequirement:
    """Upsert a skill requirement for a machine."""
    result = await db.execute(
        select(MachineSkillRequirement).where(
            MachineSkillRequirement.machine_id == machine_id,
            MachineSkillRequirement.skill_type == skill_type,
        )
    )
    req = result.scalar_one_or_none()

    if req:
        req.min_level = min_level
    else:
        req = MachineSkillRequirement(
            tenant_id=tenant_id,
            machine_id=machine_id,
            skill_type=skill_type,
            min_level=min_level,
        )
        db.add(req)

    await db.flush()
    await db.refresh(req)
    return req


# --- Availability ---


async def list_availability(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    user_id: uuid.UUID | None = None,
) -> list[TechnicianAvailability]:
    query = (
        select(TechnicianAvailability)
        .where(
            TechnicianAvailability.date >= date_from,
            TechnicianAvailability.date <= date_to,
        )
        .order_by(TechnicianAvailability.date, TechnicianAvailability.user_id)
    )
    if user_id:
        query = query.where(TechnicianAvailability.user_id == user_id)
    result = await db.execute(query)
    return list(result.scalars().all())


async def set_availability(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID,
    avail_date: date,
    shift_type: str | None,
    status: str,
    notes: str | None = None,
) -> TechnicianAvailability:
    """Upsert availability for a technician on a specific date/shift."""
    query = select(TechnicianAvailability).where(
        TechnicianAvailability.user_id == user_id,
        TechnicianAvailability.date == avail_date,
        TechnicianAvailability.shift_type == shift_type,
    )
    result = await db.execute(query)
    avail = result.scalar_one_or_none()

    if avail:
        avail.status = status
        avail.notes = notes
    else:
        avail = TechnicianAvailability(
            tenant_id=tenant_id,
            user_id=user_id,
            date=avail_date,
            shift_type=shift_type,
            status=status,
            notes=notes,
        )
        db.add(avail)

    await db.flush()
    await db.refresh(avail)
    return avail


# --- Smart assignment ---


async def suggest_assignment(db: AsyncSession, tenant_id: uuid.UUID, work_order: MaintenanceWorkOrder) -> list[dict]:
    """Return ranked list of technicians for a work order.

    Scoring weights:
        - Skill match:      40%
        - Availability:     30%
        - Current workload: 20%
        - Plant assignment: 10%
    """
    # 1. Get machine skill requirements
    requirements = await list_machine_requirements(db, work_order.machine_id)
    req_map = {r.skill_type: r.min_level for r in requirements}

    # 2. Get all active technicians in tenant
    tech_result = await db.execute(
        select(User).where(
            User.tenant_id == tenant_id,
            User.is_active.is_(True),
            User.role.in_(["technician", "admin", "manager"]),
        )
    )
    technicians = list(tech_result.scalars().all())

    if not technicians:
        return []

    # 3. Get all skills for these technicians
    tech_ids = [t.id for t in technicians]
    skills_result = await db.execute(select(TechnicianSkill).where(TechnicianSkill.user_id.in_(tech_ids)))
    all_skills = list(skills_result.scalars().all())
    skills_by_user: dict[uuid.UUID, list[TechnicianSkill]] = {}
    for s in all_skills:
        skills_by_user.setdefault(s.user_id, []).append(s)

    # 4. Get availability for scheduled date (or today)
    target_date = work_order.scheduled_date or date.today()
    avail_result = await db.execute(
        select(TechnicianAvailability).where(
            TechnicianAvailability.user_id.in_(tech_ids),
            TechnicianAvailability.date == target_date,
        )
    )
    avail_by_user: dict[uuid.UUID, str] = {}
    for a in avail_result.scalars().all():
        avail_by_user[a.user_id] = a.status

    # 5. Get current workload (active WOs per technician)
    workload = await _get_active_wo_counts(db, tenant_id, tech_ids)

    # 6. Get machine's plant for plant-match scoring
    machine_plant_id = await _get_machine_plant_id(db, work_order.machine_id)

    # 7. Score each technician
    max_workload = max(workload.values()) if workload else 1
    ranked = []
    for tech in technicians:
        user_skills = skills_by_user.get(tech.id, [])
        skill_score = _calc_skill_score(req_map, user_skills)
        avail_score = _calc_availability_score(avail_by_user.get(tech.id))
        wl = workload.get(tech.id, 0)
        workload_score = 1.0 - (wl / max(max_workload, 1))
        plant_score = 1.0 if machine_plant_id and await _tech_in_plant(db, tech.id, machine_plant_id) else 0.0

        total = skill_score * 0.4 + avail_score * 0.3 + workload_score * 0.2 + plant_score * 0.1
        ranked.append(
            {
                "user_id": str(tech.id),
                "user_name": tech.name,
                "score": round(total, 3),
                "skill_score": round(skill_score, 3),
                "availability_score": round(avail_score, 3),
                "workload_score": round(workload_score, 3),
                "plant_score": round(plant_score, 3),
                "active_work_orders": wl,
            }
        )

    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked


async def get_team_workload(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    date_from: date,
    date_to: date,
) -> list[dict]:
    """Count active work orders per technician within a date range."""
    result = await db.execute(
        select(
            MaintenanceWorkOrder.assigned_by,
            User.name,
            func.count(MaintenanceWorkOrder.id).label("wo_count"),
        )
        .join(User, User.id == MaintenanceWorkOrder.assigned_by)
        .where(
            MaintenanceWorkOrder.tenant_id == tenant_id,
            MaintenanceWorkOrder.status.in_(["open", "in_progress", "assigned"]),
            MaintenanceWorkOrder.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=UTC),
            MaintenanceWorkOrder.created_at <= datetime.combine(date_to, datetime.max.time(), tzinfo=UTC),
        )
        .group_by(MaintenanceWorkOrder.assigned_by, User.name)
    )
    return [{"user_id": str(row[0]), "user_name": row[1], "active_work_orders": row[2]} for row in result.all()]


# --- Internal helpers ---


async def _get_active_wo_counts(
    db: AsyncSession, tenant_id: uuid.UUID, tech_ids: list[uuid.UUID]
) -> dict[uuid.UUID, int]:
    """Get count of active WOs assigned to each technician."""
    result = await db.execute(
        select(
            MaintenanceWorkOrder.assigned_by,
            func.count(MaintenanceWorkOrder.id),
        )
        .where(
            MaintenanceWorkOrder.tenant_id == tenant_id,
            MaintenanceWorkOrder.assigned_by.in_(tech_ids),
            MaintenanceWorkOrder.status.in_(["open", "in_progress", "assigned"]),
        )
        .group_by(MaintenanceWorkOrder.assigned_by)
    )
    return {row[0]: row[1] for row in result.all()}


async def _get_machine_plant_id(db: AsyncSession, machine_id: uuid.UUID) -> uuid.UUID | None:
    """Get the plant_id for a machine via its production line."""
    from core.models.machine import Machine
    from core.models.plant import ProductionLine

    result = await db.execute(
        select(ProductionLine.plant_id)
        .join(Machine, Machine.line_id == ProductionLine.id)
        .where(Machine.id == machine_id)
    )
    row = result.scalar_one_or_none()
    return row


async def _tech_in_plant(db: AsyncSession, user_id: uuid.UUID, plant_id: uuid.UUID) -> bool:
    """Check if technician has any skills/availability linked to the same tenant plant.

    Simple heuristic: check if the user has a TechnicianAvailability record at all,
    meaning they are a known technician. In a fuller implementation this would check
    a plant_assignment table; for now we return True as a baseline.
    """
    # Placeholder: in production, check a user-plant assignment table
    return True


def _calc_skill_score(requirements: dict[str, int], user_skills: list[TechnicianSkill]) -> float:
    """Score 0-1 based on how well technician skills match machine requirements."""
    if not requirements:
        return 1.0  # No requirements = everyone qualifies

    skill_map = {s.skill_type: s for s in user_skills}
    matched = 0
    total = len(requirements)

    for skill_type, min_level in requirements.items():
        skill = skill_map.get(skill_type)
        if skill and skill.level >= min_level:
            matched += 1
        elif skill:
            # Partial credit for having the skill but below level
            matched += skill.level / (min_level * 2)

    return matched / total


def _calc_availability_score(status: str | None) -> float:
    """Score 0-1 based on availability status."""
    scores = {
        "available": 1.0,
        "on_call": 0.7,
        "training": 0.3,
        "off": 0.0,
        "sick": 0.0,
        "vacation": 0.0,
    }
    if status is None:
        return 0.5  # Unknown = moderate score
    return scores.get(status, 0.5)
