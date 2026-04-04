"""Public work request API — no authentication required.

Allows operators and anonymous users to submit maintenance requests
via QR scan or direct link.
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.schemas.work_request import (
    WorkRequestCreate,
    WorkRequestResponse,
    WorkRequestStatusResponse,
)
from core.services import request_service

router = APIRouter()


@router.post("/{tenant_slug}", response_model=WorkRequestResponse, status_code=201)
async def submit_request(
    tenant_slug: str,
    data: WorkRequestCreate,
    db: AsyncSession = Depends(get_db),
):
    """Submit a maintenance request (public — no login required)."""
    tenant = await request_service.get_tenant_by_slug(db, tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Organization not found")

    # Validate machine belongs to tenant if provided
    if data.machine_id:
        from core.services.machine_service import get_machine
        from core.database import set_tenant_context
        await set_tenant_context(db, str(tenant.id))
        machine = await get_machine(db, data.machine_id)
        if not machine:
            raise HTTPException(status_code=404, detail="Machine not found")

    req = await request_service.create_request(db, tenant.id, data)
    return WorkRequestResponse(
        **{c.key: getattr(req, c.key) for c in req.__table__.columns},
        machine_name=req.machine.name if req.machine else None,
    )


@router.get("/{tenant_slug}/{request_id}/status", response_model=WorkRequestStatusResponse)
async def check_request_status(
    tenant_slug: str,
    request_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """Check the status of a submitted request (public)."""
    tenant = await request_service.get_tenant_by_slug(db, tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Organization not found")

    req = await request_service.get_request(db, request_id)
    if not req or req.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Request not found")

    return WorkRequestStatusResponse(
        id=req.id,
        status=req.status,
        title=req.title,
        urgency=req.urgency,
        created_at=req.created_at,
        reviewed_at=req.reviewed_at,
    )


@router.get("/{tenant_slug}/machines")
async def list_tenant_machines_public(
    tenant_slug: str,
    db: AsyncSession = Depends(get_db),
):
    """List machines for a tenant (public — for request form dropdown)."""
    tenant = await request_service.get_tenant_by_slug(db, tenant_slug)
    if not tenant:
        raise HTTPException(status_code=404, detail="Organization not found")

    from core.database import set_tenant_context
    from core.services.machine_service import list_machines
    await set_tenant_context(db, str(tenant.id))
    machines = await list_machines(db, limit=500)
    return [{"id": str(m.id), "name": m.name, "asset_tag": m.asset_tag} for m in machines]
