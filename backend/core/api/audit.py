"""Audit log routes — read-only access to audit trail."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import require_role
from core.database import get_db, set_tenant_context
from core.models.user import User
from core.schemas.audit_log import AuditLogResponse
from core.services import audit_service

router = APIRouter()
AdminUser = Annotated[User, Depends(require_role("admin", "superadmin"))]


@router.get("/", response_model=list[AuditLogResponse])
async def list_logs(
    user: AdminUser,
    db: AsyncSession = Depends(get_db),
    resource_type: str | None = None,
    resource_id: str | None = None,
    user_id: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """List audit logs (admin only). Filter by resource, user, etc."""
    await set_tenant_context(db, str(user.tenant_id))
    uid = uuid.UUID(user_id) if user_id else None
    logs = await audit_service.list_audit_logs(db, resource_type, resource_id, uid, limit, offset)
    return [
        AuditLogResponse(
            **{c.key: getattr(log, c.key) for c in log.__table__.columns},
            user_name=log.user.name if log.user else None,
        )
        for log in logs
    ]
