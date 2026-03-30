"""Plant and production line management routes."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.schemas.plant import (
    PlantCreate,
    PlantResponse,
    PlantUpdate,
    ProductionLineCreate,
    ProductionLineResponse,
    ProductionLineUpdate,
)
from core.services import plant_service

router = APIRouter()


# --- Plants ---

@router.get("/", response_model=list[PlantResponse])
async def list_plants(user: CurrentUser, db: AsyncSession = Depends(get_db)):
    await set_tenant_context(db, str(user.tenant_id))
    return await plant_service.list_plants(db)


@router.get("/{plant_id}", response_model=PlantResponse)
async def get_plant(
    plant_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    plant = await plant_service.get_plant(db, plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return plant


@router.post("/", response_model=PlantResponse, status_code=201)
async def create_plant(
    data: PlantCreate, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    return await plant_service.create_plant(db, user.tenant_id, data)


@router.patch("/{plant_id}", response_model=PlantResponse)
async def update_plant(
    plant_id: uuid.UUID,
    data: PlantUpdate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    plant = await plant_service.get_plant(db, plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    return await plant_service.update_plant(db, plant, data)


@router.delete("/{plant_id}", status_code=204)
async def delete_plant(
    plant_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    plant = await plant_service.get_plant(db, plant_id)
    if not plant:
        raise HTTPException(status_code=404, detail="Plant not found")
    await plant_service.delete_plant(db, plant)


# --- Production Lines ---

@router.get("/{plant_id}/lines", response_model=list[ProductionLineResponse])
async def list_lines(
    plant_id: uuid.UUID, user: CurrentUser, db: AsyncSession = Depends(get_db)
):
    await set_tenant_context(db, str(user.tenant_id))
    return await plant_service.list_production_lines(db, plant_id)


@router.post("/{plant_id}/lines", response_model=ProductionLineResponse, status_code=201)
async def create_line(
    plant_id: uuid.UUID,
    data: ProductionLineCreate,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    await set_tenant_context(db, str(user.tenant_id))
    data.plant_id = plant_id
    return await plant_service.create_production_line(db, user.tenant_id, data)
