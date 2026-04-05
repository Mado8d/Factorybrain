"""Audit log schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AuditLogResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    user_id: UUID | None
    action: str
    resource_type: str
    resource_id: str
    changes: dict
    ip_address: str | None
    created_at: datetime
    user_name: str | None = None

    class Config:
        from_attributes = True
