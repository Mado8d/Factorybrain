"""Work order event model — unified activity timeline."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.models.base import Base


class WorkOrderEvent(Base):
    """Single event in a work order's activity timeline.

    Captures both user actions (comments, photos) and system events
    (status changes, assignments, timer logs) in one chronological feed.
    """
    __tablename__ = "work_order_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    work_order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("maintenance_work_orders.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(
        String, nullable=False
    )  # comment, status_change, assignment, time_start, time_stop,
       # part_used, photo, checklist_update, request_note
    content: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    mentions: Mapped[list | None] = mapped_column(ARRAY(UUID(as_uuid=True)), nullable=True)
    attachments: Mapped[list] = mapped_column(JSONB, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))

    # Relationships
    user = relationship("User", lazy="selectin")
    work_order = relationship("MaintenanceWorkOrder")
