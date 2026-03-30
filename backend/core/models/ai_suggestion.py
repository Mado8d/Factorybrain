"""AISuggestion model — human-in-the-loop logging."""

import uuid
from datetime import datetime

from sqlalchemy import Float, ForeignKey, Integer, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base


class AISuggestion(Base):
    __tablename__ = "ai_suggestions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    suggestion_type: Mapped[str] = mapped_column(String, nullable=False)
    context: Mapped[dict] = mapped_column(JSONB, nullable=False)
    options: Mapped[dict] = mapped_column(JSONB, nullable=False)
    model_version: Mapped[str | None] = mapped_column(String, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, server_default="pending")
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    applied_option: Mapped[int | None] = mapped_column(Integer, nullable=True)
    modification: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    outcome_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
