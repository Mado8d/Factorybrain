"""Failure code schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FailureCodeCreate(BaseModel):
    code: str
    name: str
    description: str | None = None
    level: str  # 'problem', 'cause', 'action'
    parent_id: UUID | None = None
    sort_order: int = 0


class FailureCodeUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class FailureCodeResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    parent_id: UUID | None
    code: str
    name: str
    description: str | None
    level: str
    sort_order: int
    is_active: bool
    created_at: datetime
    children: list["FailureCodeResponse"] = []

    class Config:
        from_attributes = True


class WOCloseOut(BaseModel):
    """Data captured when closing a work order — failure codes + root cause."""

    failure_problem_id: UUID | None = None
    failure_cause_id: UUID | None = None
    failure_action_id: UUID | None = None
    root_cause: str | None = None
    work_performed: str | None = None
    downtime_minutes: int | None = None
    parts_used: list[dict] | None = None  # [{part_id, quantity}]
