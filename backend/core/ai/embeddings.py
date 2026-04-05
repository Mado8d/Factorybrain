"""Document embedding and retrieval for the RAG pipeline.

Handles chunking, embedding storage, and similarity search.
All vector operations are optional — falls back to text search (ILIKE)
when pgvector is not available.
"""

import logging
import uuid
from typing import Any

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.knowledge_chunk import KnowledgeChunk

logger = logging.getLogger(__name__)

# Approximate tokens per chunk (split target)
CHUNK_TOKEN_TARGET = 500
# Rough chars-per-token estimate for English text
CHARS_PER_TOKEN = 4
CHUNK_CHAR_TARGET = CHUNK_TOKEN_TARGET * CHARS_PER_TOKEN  # ~2000 chars


# ---------------------------------------------------------------------------
# Text chunking
# ---------------------------------------------------------------------------


def _chunk_text(content: str) -> list[str]:
    """Split text into ~500-token chunks.

    Strategy: split by double-newline (paragraphs) first, then merge small
    paragraphs and split large ones by sentence/char count.
    """
    paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]

    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        # If adding this paragraph would exceed target, flush current
        if current and len(current) + len(para) + 2 > CHUNK_CHAR_TARGET:
            chunks.append(current.strip())
            current = ""

        # If a single paragraph exceeds target, split it further
        if len(para) > CHUNK_CHAR_TARGET:
            if current:
                chunks.append(current.strip())
                current = ""
            # Split by sentences (period + space)
            sentences = para.replace(". ", ".\n").split("\n")
            buf = ""
            for sentence in sentences:
                if buf and len(buf) + len(sentence) + 1 > CHUNK_CHAR_TARGET:
                    chunks.append(buf.strip())
                    buf = ""
                buf += " " + sentence if buf else sentence
            if buf.strip():
                chunks.append(buf.strip())
        else:
            current += "\n\n" + para if current else para

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [content.strip()] if content.strip() else []


# ---------------------------------------------------------------------------
# Embedding (optional — skips if no API key)
# ---------------------------------------------------------------------------


async def _embed_texts(texts: list[str]) -> list[list[float] | None]:
    """Embed a list of texts using Voyage or similar API.

    Returns None for each text if embedding is not configured.
    For now, embedding is a placeholder — returns None to store chunks
    without vectors. A future migration will add a real embedding provider.
    """
    # TODO: integrate Voyage AI or another embedding provider
    # For now, skip embedding — chunks are stored without vectors
    # and search falls back to ILIKE text search
    return [None] * len(texts)


# ---------------------------------------------------------------------------
# pgvector availability check
# ---------------------------------------------------------------------------

_pgvector_available: bool | None = None


async def _check_pgvector(db: AsyncSession) -> bool:
    """Check if the pgvector extension is available in this database."""
    global _pgvector_available
    if _pgvector_available is not None:
        return _pgvector_available
    try:
        result = await db.execute(text("SELECT 1 FROM pg_extension WHERE extname = 'vector'"))
        _pgvector_available = result.scalar_one_or_none() is not None
    except Exception:
        _pgvector_available = False
    return _pgvector_available


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def ingest_document(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    source_type: str,
    source_name: str,
    content_text: str,
    machine_id: uuid.UUID | None = None,
    source_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> list[uuid.UUID]:
    """Chunk text, optionally embed, and store in knowledge_chunks.

    Returns list of created chunk IDs.
    """
    chunks = _chunk_text(content_text)
    if not chunks:
        return []

    embeddings = await _embed_texts(chunks)

    chunk_ids: list[uuid.UUID] = []
    has_pgvector = await _check_pgvector(db)

    for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings, strict=False)):
        chunk = KnowledgeChunk(
            tenant_id=tenant_id,
            source_type=source_type,
            source_id=source_id,
            source_name=source_name,
            machine_id=machine_id,
            content=chunk_text,
            metadata_=metadata or {"chunk_index": i, "total_chunks": len(chunks)},
        )
        db.add(chunk)
        await db.flush()
        await db.refresh(chunk)

        # Store embedding if available and pgvector is enabled
        if embedding and has_pgvector:
            try:
                await db.execute(
                    text("UPDATE knowledge_chunks SET embedding = :vec WHERE id = :id"),
                    {"vec": str(embedding), "id": str(chunk.id)},
                )
            except Exception as e:
                logger.warning("Failed to store embedding for chunk %s: %s", chunk.id, e)

        chunk_ids.append(chunk.id)

    return chunk_ids


async def search_similar(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    query: str,
    machine_id: uuid.UUID | None = None,
    limit: int = 5,
) -> list[dict]:
    """Search for similar knowledge chunks.

    Uses pgvector cosine similarity if available, otherwise falls back
    to simple ILIKE text search.
    """
    has_pgvector = await _check_pgvector(db)

    # Try vector search first
    if has_pgvector:
        try:
            return await _vector_search(db, tenant_id, query, machine_id, limit)
        except Exception as e:
            logger.warning("Vector search failed, falling back to text: %s", e)

    # Fallback: text search
    return await _text_search(db, tenant_id, query, machine_id, limit)


async def _vector_search(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    query: str,
    machine_id: uuid.UUID | None,
    limit: int,
) -> list[dict]:
    """Vector similarity search using pgvector.

    NOTE: This requires embeddings to actually be stored. Since we currently
    skip embedding, this will return empty results and the caller falls back
    to text search. When an embedding provider is configured, this will work.
    """
    # First embed the query
    query_embeddings = await _embed_texts([query])
    query_vec = query_embeddings[0]
    if query_vec is None:
        # No embedding available — fall back to text search
        return await _text_search(db, tenant_id, query, machine_id, limit)

    sql = """
        SELECT id, content, source_name, source_type,
               1 - (embedding <=> :query_vec::vector) AS similarity
        FROM knowledge_chunks
        WHERE tenant_id = :tenant_id
          AND embedding IS NOT NULL
    """
    params: dict[str, Any] = {
        "tenant_id": str(tenant_id),
        "query_vec": str(query_vec),
    }
    if machine_id:
        sql += " AND (machine_id = :machine_id OR machine_id IS NULL)"
        params["machine_id"] = str(machine_id)

    sql += " ORDER BY embedding <=> :query_vec::vector LIMIT :limit"
    params["limit"] = limit

    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "content": row.content,
            "source_name": row.source_name,
            "source_type": row.source_type,
            "similarity": round(float(row.similarity), 4),
        }
        for row in rows
    ]


async def _text_search(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    query: str,
    machine_id: uuid.UUID | None,
    limit: int,
) -> list[dict]:
    """Fallback text search using ILIKE with word matching."""
    # Split query into keywords for broader matching
    keywords = [w.strip() for w in query.split() if len(w.strip()) > 2]
    if not keywords:
        keywords = [query.strip()]

    # Build OR conditions for each keyword
    conditions = []
    params: dict[str, Any] = {"tenant_id": str(tenant_id), "limit": limit}
    for i, kw in enumerate(keywords[:5]):  # Max 5 keywords
        conditions.append(f"content ILIKE :kw{i}")
        params[f"kw{i}"] = f"%{kw}%"

    where_keywords = " OR ".join(conditions)

    sql = f"""
        SELECT id, content, source_name, source_type
        FROM knowledge_chunks
        WHERE tenant_id = :tenant_id
          AND ({where_keywords})
    """
    if machine_id:
        sql += " AND (machine_id = :machine_id OR machine_id IS NULL)"
        params["machine_id"] = str(machine_id)

    sql += " ORDER BY created_at DESC LIMIT :limit"

    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    return [
        {
            "id": str(row.id),
            "content": row.content,
            "source_name": row.source_name,
            "source_type": row.source_type,
            "similarity": None,  # Text search has no similarity score
        }
        for row in rows
    ]


async def delete_source(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    source_id: str,
) -> int:
    """Remove all chunks for a given source.

    Returns the number of deleted chunks.
    """
    result = await db.execute(
        delete(KnowledgeChunk).where(
            KnowledgeChunk.tenant_id == tenant_id,
            KnowledgeChunk.source_id == source_id,
        )
    )
    return result.rowcount
