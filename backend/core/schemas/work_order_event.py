"""Work order event schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class EventCreate(BaseModel):
    event_type: str = "comment"
    content: str | None = None
    metadata: dict = {}
    mentions: list[UUID] = []
    attachments: list[dict] = []


class EventResponse(BaseModel):
    id: UUID
    work_order_id: UUID
    user_id: UUID | None
    event_type: str
    content: str | None
    metadata: dict
    mentions: list[UUID] | None
    attachments: list
    created_at: datetime
    user_name: str | None = None
    user_role: str | None = None

    class Config:
        from_attributes = True
