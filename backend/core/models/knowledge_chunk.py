"""Knowledge chunk model — document embeddings for RAG (AI infrastructure)."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from core.models.base import Base


class KnowledgeChunk(Base):
    """Chunked document with vector embedding for AI retrieval.

    Used by the RAG pipeline: upload manual → chunk → embed → search.
    Requires pgvector extension enabled in PostgreSQL.
    """

    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    source_type: Mapped[str] = mapped_column(String, nullable=False)
    # 'manual', 'work_order', 'procedure', 'specification'
    source_id: Mapped[str | None] = mapped_column(String, nullable=True)
    source_name: Mapped[str | None] = mapped_column(String, nullable=True)
    machine_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("machines.id"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # Note: embedding column is vector(1024) — added via raw SQL migration
    # since SQLAlchemy doesn't natively support pgvector column type
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(server_default=text("NOW()"))
