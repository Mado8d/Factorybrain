"""Audit log model — tracks all changes for compliance."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class AuditLog(Base):
    """Immutable audit trail entry. Records who did what, when, and what changed."""

    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action: Mapped[str] = mapped_column(String, nullable=False)  # create, update, delete
    resource_type: Mapped[str] = mapped_column(String, nullable=False)  # work_order, machine, etc.
    resource_id: Mapped[str] = mapped_column(String, nullable=False)
    changes: Mapped[dict] = mapped_column(JSONB, server_default="{}")  # {field: {old, new}}
    ip_address: Mapped[str | None] = mapped_column(String, nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"), index=True)

    # Relationships
    user = relationship("User", lazy="selectin")
