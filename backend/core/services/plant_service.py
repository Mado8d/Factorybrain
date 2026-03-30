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
    return plant


async def update_plant(db: AsyncSession, plant: Plant, data: PlantUpdate) -> Plant:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(plant, field, value)
    await db.flush()
    await db.refresh(plant)
    return plant


async def delete_plant(db: AsyncSession, plant: Plant) -> None:
    await db.delete(plant)
    await db.flush()


# --- Production Lines ---

async def list_production_lines(db: AsyncSession, plant_id: uuid.UUID) -> list[ProductionLine]:
    result = await db.execute(
        select(ProductionLine)
        .where(ProductionLine.plant_id == plant_id)
        .order_by(ProductionLine.sort_order)
    )
    return list(result.scalars().all())


async def create_production_line(
    db: AsyncSession, tenant_id: uuid.UUID, data: ProductionLineCreate
) -> ProductionLine:
    line = ProductionLine(tenant_id=tenant_id, **data.model_dump(exclude_unset=True))
    db.add(line)
    await db.flush()
    await db.refresh(line)
    return line


async def update_production_line(
    db: AsyncSession, line: ProductionLine, data: ProductionLineUpdate
) -> ProductionLine:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(line, field, value)
    await db.flush()
    await db.refresh(line)
    return line
