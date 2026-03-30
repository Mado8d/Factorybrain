"""Tenant schemas."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class TenantCreate(BaseModel):
    name: str
    slug: str
    plan: str = "starter"
    timezone: str = "Europe/Brussels"
    locale: str = "nl-BE"


class TenantUpdate(BaseModel):
    name: str | None = None
    plan: str | None = None
    timezone: str | None = None
    locale: str | None = None
    settings: dict | None = None


class TenantResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    plan: str
    timezone: str
    locale: str
    settings: dict
    created_at: datetime

    class Config:
        from_attributes = True
