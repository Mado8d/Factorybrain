"""Webhook routes — endpoint management and delivery history."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Annotated

from core.auth.routes import CurrentUser, require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.services import webhook_service

router = APIRouter()

AdminUser = Annotated[User, Depends(require_role("admin", "manager", "superadmin"))]


# --- Schemas ---

class EndpointCreate(BaseModel):
    url: str
    events: list[str]
    description: str | None = None


class EndpointUpdate(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    is_active: bool | None = None
    description: str | None = None


class EndpointResponse(BaseModel):
    id: uuid.UUID
    tenant_id: uuid.UUID
    url: str
    secret: str
    events: list[str]
    is_active: bool
    description: str | None
    last_triggered_at: datetime | None
    failure_count: int
    created_at: datetime

    model_config = {"from_attributes": True}


class DeliveryResponse(BaseModel):
    id: uuid.UUID
    endpoint_id: uuid.UUID
    event_type: str
    payload: dict
    status_code: int | None
    response_body: str | None
    attempt: int
    delivered_at: datetime | None
    error: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


# --- Routes ---

@router.get("/", response_model=list[EndpointResponse])
async def list_endpoints(
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """List all webhook endpoints for this tenant."""
    await set_tenant_context(db, str(user.tenant_id))
    return await webhook_service.list_endpoints(db, user.tenant_id)


@router.post("/", response_model=EndpointResponse, status_code=201)
async def create_endpoint(
    data: EndpointCreate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Create a new webhook endpoint."""
    await set_tenant_context(db, str(user.tenant_id))
    return await webhook_service.create_endpoint(
        db, user.tenant_id, data.url, data.events, data.description
    )


@router.patch("/{endpoint_id}", response_model=EndpointResponse)
async def update_endpoint(
    endpoint_id: uuid.UUID,
    data: EndpointUpdate,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Update a webhook endpoint."""
    await set_tenant_context(db, str(user.tenant_id))
    endpoint = await webhook_service.get_endpoint(db, endpoint_id)
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    if endpoint.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    return await webhook_service.update_endpoint(db, endpoint, data.model_dump(exclude_unset=True))


@router.delete("/{endpoint_id}", status_code=204)
async def delete_endpoint(
    endpoint_id: uuid.UUID,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Delete a webhook endpoint."""
    await set_tenant_context(db, str(user.tenant_id))
    endpoint = await webhook_service.get_endpoint(db, endpoint_id)
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    if endpoint.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    await webhook_service.delete_endpoint(db, endpoint)


@router.get("/{endpoint_id}/deliveries", response_model=list[DeliveryResponse])
async def list_deliveries(
    endpoint_id: uuid.UUID,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
    limit: int = 50,
):
    """List recent deliveries for a webhook endpoint."""
    await set_tenant_context(db, str(user.tenant_id))
    endpoint = await webhook_service.get_endpoint(db, endpoint_id)
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    if endpoint.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    return await webhook_service.list_deliveries(db, endpoint_id, limit)


@router.post("/test/{endpoint_id}", response_model=DeliveryResponse)
async def test_webhook(
    endpoint_id: uuid.UUID,
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
):
    """Send a test webhook to an endpoint."""
    await set_tenant_context(db, str(user.tenant_id))
    endpoint = await webhook_service.get_endpoint(db, endpoint_id)
    if not endpoint:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")
    if endpoint.tenant_id != user.tenant_id:
        raise HTTPException(status_code=404, detail="Webhook endpoint not found")

    test_payload = {
        "event": "test.ping",
        "message": "This is a test webhook from FactoryBrain",
        "endpoint_id": str(endpoint.id),
        "tenant_id": str(user.tenant_id),
    }
    return await webhook_service.deliver_webhook(db, endpoint, "test.ping", test_payload)
