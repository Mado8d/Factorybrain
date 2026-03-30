"""Tenant model — multi-tenant foundation."""

import uuid
from datetime import datetime

from sqlalchemy import String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String, server_default="starter")
    timezone: Mapped[str] = mapped_column(String, server_default="Europe/Brussels")
    locale: Mapped[str] = mapped_column(String, server_default="nl-BE")
    settings: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
    updated_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    users = relationship("User", back_populates="tenant", lazy="selectin")
    plants = relationship("Plant", back_populates="tenant", lazy="selectin")
    machines = relationship("Machine", back_populates="tenant", lazy="selectin")
