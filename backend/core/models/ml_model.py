"""ML model registry — tracks trained anomaly detection models."""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, ForeignKey, String, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base


class MLModel(Base):
    """Registry entry for a trained ML model stored in MinIO."""
    __tablename__ = "ml_models"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    machine_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("machines.id"), nullable=False, index=True
    )
    model_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'isolation_forest', 'lstm_autoencoder', 'weibull'
    model_path: Mapped[str] = mapped_column(String, nullable=False)  # MinIO path
    features: Mapped[list] = mapped_column(JSONB, server_default="[]")
    metrics: Mapped[dict] = mapped_column(JSONB, server_default="{}")
    # {auc, contamination, training_samples, etc.}
    trained_at: Mapped[datetime | None] = mapped_column(nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, server_default="true")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
