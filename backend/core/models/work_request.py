"""Work request model — self-service maintenance request portal."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class WorkRequest(Base):
    """A maintenance request submitted by operators or anonymous users.

    Requests flow through: new → approved/rejected/duplicate.
    Approved requests are converted into work orders.
    """
    __tablename__ = "work_requests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(String, server_default="new", index=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    urgency: Mapped[str] = mapped_column(String, server_default="medium")
    requester_name: Mapped[str | None] = mapped_column(String, nullable=True)
    requester_contact: Mapped[str | None] = mapped_column(String, nullable=True)
    photos: Mapped[list] = mapped_column(JSONB, server_default="[]")
    location: Mapped[str | None] = mapped_column(String, nullable=True)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    reviewed_at: Mapped[datetime | None] = mapped_column(nullable=True)
    review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    work_order_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_work_orders.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    machine = relationship("Machine")
    reviewer = relationship("User", foreign_keys=[reviewed_by])
    work_order = relationship("MaintenanceWorkOrder")
