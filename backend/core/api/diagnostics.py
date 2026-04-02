"""AI Diagnostics API — plain-language machine health insights."""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context
from core.services import machine_service
from core.services.diagnostics_service import analyze_machine

router = APIRouter()


@router.get("/machines/{machine_id}/diagnostics")
async def get_diagnostics(
    machine_id: uuid.UUID,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Get AI-generated diagnostic insights for a machine.

    Analyzes recent telemetry to detect trends, anomalies, and predict failures.
    Returns plain-language recommendations.
    """
    await set_tenant_context(db, str(user.tenant_id))
    machine = await machine_service.get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")

    # Get tenant settings for thresholds
    tenant_settings = {}
    if user.tenant and user.tenant.settings:
        tenant_settings = user.tenant.settings

    # Check for machine-specific threshold overrides
    machine_thresholds = (machine.specifications or {}).get("thresholds", {})
    if machine_thresholds:
        merged = {**tenant_settings.get("thresholds", {}), **machine_thresholds}
        tenant_settings = {**tenant_settings, "thresholds": merged}

    insights = await analyze_machine(db, str(machine_id), tenant_settings)
    return insights
