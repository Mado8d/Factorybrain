"""Failure code model — configurable taxonomy for root cause analysis."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class FailureCode(Base):
    """Hierarchical failure code for structured root cause analysis.

    Three levels: Problem → Cause → Action (ISO 14224 inspired).
    Each tenant can configure their own failure taxonomy.
    """
    __tablename__ = "failure_codes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("failure_codes.id"), nullable=True, index=True
    )
    code: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    level: Mapped[str] = mapped_column(
        String, nullable=False
    )  # 'problem', 'cause', 'action'
    sort_order: Mapped[int] = mapped_column(Integer, server_default="0")
    is_active: Mapped[bool] = mapped_column(server_default=text("true"))
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    children = relationship("FailureCode", back_populates="parent", lazy="selectin")
    parent = relationship("FailureCode", back_populates="children", remote_side=[id])
