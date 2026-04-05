"""Plant and ProductionLine CRUD service."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.plant import Plant, ProductionLine
from core.schemas.plant import (
    PlantCreate,
    PlantUpdate,
    ProductionLineCreate,
    ProductionLineUpdate,
)
from core.services import audit_service

# --- Plants ---


async def list_plants(db: AsyncSession) -> list[Plant]:
    result = await db.execute(select(Plant).order_by(Plant.name))
    return list(result.scalars().all())


async def get_plant(db: AsyncSession, plant_id: uuid.UUID) -> Plant | None:
    result = await db.execute(select(Plant).where(Plant.id == plant_id))
    return result.scalar_one_or_none()


async def create_plant(db: AsyncSession, tenant_id: uuid.UUID, data: PlantCreate) -> Plant:
    plant = Plant(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(plant)
    await db.flush()
    await db.refresh(plant)
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="create",
        resource_type="plant",
        resource_id=str(plant.id),
        changes={"name": plant.name},
    )
    return plant


async def update_plant(db: AsyncSession, plant: Plant, data: PlantUpdate) -> Plant:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(plant, field, value)
    await db.flush()
    await db.refresh(plant)
    await audit_service.log_action(
        db,
        plant.tenant_id,
        user_id=None,
        action="update",
        resource_type="plant",
        resource_id=str(plant.id),
        changes=updates,
    )
    return plant


async def delete_plant(db: AsyncSession, plant: Plant) -> None:
    tenant_id = plant.tenant_id
    plant_id = str(plant.id)
    plant_name = plant.name
    await db.delete(plant)
    await db.flush()
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="delete",
        resource_type="plant",
        resource_id=plant_id,
        changes={"name": plant_name},
    )


# --- Production Lines ---


async def list_production_lines(db: AsyncSession, plant_id: uuid.UUID) -> list[ProductionLine]:
    result = await db.execute(
        select(ProductionLine).where(ProductionLine.plant_id == plant_id).order_by(ProductionLine.sort_order)
    )
    return list(result.scalars().all())


async def create_production_line(db: AsyncSession, tenant_id: uuid.UUID, data: ProductionLineCreate) -> ProductionLine:
    line = ProductionLine(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(line)
    await db.flush()
    await db.refresh(line)
    await audit_service.log_action(
        db,
        tenant_id,
        user_id=None,
        action="create",
        resource_type="production_line",
        resource_id=str(line.id),
        changes={"name": line.name},
    )
    return line


async def update_production_line(db: AsyncSession, line: ProductionLine, data: ProductionLineUpdate) -> ProductionLine:
    updates = data.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(line, field, value)
    await db.flush()
    await db.refresh(line)
    await audit_service.log_action(
        db,
        line.tenant_id,
        user_id=None,
        action="update",
        resource_type="production_line",
        resource_id=str(line.id),
        changes=updates,
    )
    return line
