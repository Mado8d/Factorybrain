"""Time entry schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, field_validator


VALID_CATEGORIES = {"wrench", "travel", "waiting", "admin"}


class TimeStartRequest(BaseModel):
    category: str = "wrench"

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")
        return v


class TimeStopRequest(BaseModel):
    notes: str | None = None


class TimeManualEntry(BaseModel):
    started_at: datetime
    stopped_at: datetime
    category: str = "wrench"
    notes: str | None = None

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in VALID_CATEGORIES:
            raise ValueError(f"Invalid category. Must be one of: {', '.join(VALID_CATEGORIES)}")
        return v


class TimeEntryResponse(BaseModel):
    id: UUID
    work_order_id: UUID
    user_id: UUID
    started_at: datetime
    paused_at: datetime | None
    stopped_at: datetime | None
    category: str
    duration_seconds: int | None
    notes: str | None
    created_at: datetime
    user_name: str | None = None

    class Config:
        from_attributes = True
