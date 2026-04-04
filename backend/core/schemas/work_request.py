"""Work request schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator


VALID_URGENCIES = {"low", "medium", "high", "critical"}


class WorkRequestCreate(BaseModel):
    """Public request submission — minimal fields."""
    title: str
    description: str | None = None
    machine_id: UUID | None = None
    urgency: str = "medium"
    requester_name: str | None = None
    requester_contact: str | None = None
    location: str | None = None
    photos: list[dict] = []

    @field_validator("urgency")
    @classmethod
    def validate_urgency(cls, v: str) -> str:
        if v not in VALID_URGENCIES:
            raise ValueError(f"Invalid urgency. Must be one of: {', '.join(VALID_URGENCIES)}")
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v


class WorkRequestResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    machine_id: UUID | None
    status: str
    title: str
    description: str | None
    urgency: str
    requester_name: str | None
    requester_contact: str | None
    photos: list
    location: str | None
    reviewed_by: UUID | None
    reviewed_at: datetime | None
    review_notes: str | None
    work_order_id: UUID | None
    created_at: datetime
    machine_name: str | None = None

    class Config:
        from_attributes = True


class WorkRequestStatusResponse(BaseModel):
    """Public-facing status check — limited info."""
    id: UUID
    status: str
    title: str
    urgency: str
    created_at: datetime
    reviewed_at: datetime | None


class RequestRejectBody(BaseModel):
    reason: str


class RequestDuplicateBody(BaseModel):
    existing_work_order_id: UUID
