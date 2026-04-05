"""FastAPI router for AI endpoints — /api/ai.

All endpoints require authentication and gracefully handle missing AI
configuration by returning 503 with a helpful message.
"""

import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth.routes import CurrentUser
from core.database import get_db, set_tenant_context

from . import embeddings
from . import service as ai_service

logger = logging.getLogger(__name__)

router = APIRouter()


# ---------------------------------------------------------------------------
# Request / response schemas
# ---------------------------------------------------------------------------


class GenerateDescriptionRequest(BaseModel):
    machine_id: uuid.UUID
    alert_id: uuid.UUID | None = None


class AnalyzeAnomalyRequest(BaseModel):
    machine_id: uuid.UUID
    node_id: uuid.UUID | None = None


class SuggestRootCausesRequest(BaseModel):
    work_order_id: uuid.UUID


class ChatRequest(BaseModel):
    message: str
    conversation_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None


class ChatStreamRequest(BaseModel):
    message: str
    conversation_id: uuid.UUID | None = None
    machine_id: uuid.UUID | None = None


class IngestDocumentRequest(BaseModel):
    source_type: str = Field(..., description="Type: manual, procedure, specification, work_order")
    source_name: str = Field(..., description="Human-readable document name")
    content_text: str = Field(..., description="Full text content to index")
    machine_id: uuid.UUID | None = None
    source_id: str | None = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_ai():
    """Raise 503 if AI is not configured."""
    if not ai_service._is_available():
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AI features not configured",
                "hint": "Set ANTHROPIC_API_KEY environment variable to enable AI features.",
            },
        )


async def _get_machine_dict(db: AsyncSession, machine_id: uuid.UUID) -> dict:
    """Load machine as dict for AI context."""
    from core.services.machine_service import get_machine

    machine = await get_machine(db, machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail="Machine not found")
    return {
        "id": str(machine.id),
        "name": machine.name,
        "type": getattr(machine, "machine_type", None),
        "location": getattr(machine, "location", None),
        "status": getattr(machine, "status", None),
        "metadata": getattr(machine, "metadata_", None),
    }


async def _get_recent_wos(db: AsyncSession, machine_id: uuid.UUID, limit: int = 5) -> list[dict]:
    """Load recent work orders for a machine as list of dicts."""
    from core.models.maintenance import MaintenanceWorkOrder

    result = await db.execute(
        select(MaintenanceWorkOrder)
        .where(MaintenanceWorkOrder.machine_id == machine_id)
        .order_by(MaintenanceWorkOrder.created_at.desc())
        .limit(limit)
    )
    wos = result.scalars().all()
    return [
        {
            "wo_number": wo.wo_number,
            "title": wo.title,
            "status": wo.status,
            "priority": getattr(wo, "priority", None),
            "description": getattr(wo, "description", None),
            "created_at": str(wo.created_at),
        }
        for wo in wos
    ]


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.get("/status")
async def ai_status(user: CurrentUser):
    """Check if AI is configured and available."""
    return await ai_service.check_status()


@router.post("/generate-description")
async def generate_description(
    body: GenerateDescriptionRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Generate work order description from machine context."""
    _require_ai()
    await set_tenant_context(db, str(user.tenant_id))

    machine = await _get_machine_dict(db, body.machine_id)
    recent_wos = await _get_recent_wos(db, body.machine_id)

    alert = None
    if body.alert_id:
        from core.services.maintenance_service import get_alert

        alert_obj = await get_alert(db, body.alert_id)
        if alert_obj:
            alert = {
                "id": str(alert_obj.id),
                "type": getattr(alert_obj, "alert_type", None),
                "message": getattr(alert_obj, "message", None),
                "severity": getattr(alert_obj, "severity", None),
                "created_at": str(alert_obj.created_at),
            }

    result = await ai_service.generate_wo_description(machine, alert, recent_wos)
    return result


@router.post("/analyze-anomaly")
async def analyze_anomaly(
    body: AnalyzeAnomalyRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Analyze a sensor anomaly for a machine."""
    _require_ai()
    await set_tenant_context(db, str(user.tenant_id))

    machine = await _get_machine_dict(db, body.machine_id)
    recent_wos = await _get_recent_wos(db, body.machine_id)

    # Fetch recent sensor data and thresholds
    # For now, pass machine metadata thresholds and empty sensor data
    # (real sensor data integration comes with the MQTT/TimescaleDB pipeline)
    thresholds = (machine.get("metadata") or {}).get("thresholds", {})
    sensor_data: list[dict] = []

    result = await ai_service.analyze_anomaly(machine, sensor_data, recent_wos, thresholds)
    return result


@router.post("/suggest-root-causes")
async def suggest_root_causes(
    body: SuggestRootCausesRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Suggest root causes for a work order's failure."""
    _require_ai()
    await set_tenant_context(db, str(user.tenant_id))

    from core.services.maintenance_service import get_work_order

    wo = await get_work_order(db, body.work_order_id)
    if not wo:
        raise HTTPException(status_code=404, detail="Work order not found")

    machine = await _get_machine_dict(db, wo.machine_id) if wo.machine_id else {}
    wo_history = await _get_recent_wos(db, wo.machine_id, limit=10) if wo.machine_id else []

    # Gather failure codes used on this machine
    failure_codes: list[dict] = []
    if wo.machine_id:
        from core.models.maintenance import MaintenanceWorkOrder

        result = await db.execute(
            select(MaintenanceWorkOrder.failure_code)
            .where(
                MaintenanceWorkOrder.machine_id == wo.machine_id,
                MaintenanceWorkOrder.failure_code.isnot(None),
            )
            .distinct()
        )
        codes = result.scalars().all()
        failure_codes = [{"code": c} for c in codes if c]

    causes = await ai_service.suggest_root_causes(machine, failure_codes, wo_history)
    return {"causes": causes}


@router.post("/chat")
async def chat(
    body: ChatRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Non-streaming RAG chat."""
    _require_ai()
    await set_tenant_context(db, str(user.tenant_id))

    # Search for relevant context
    context_chunks = await embeddings.search_similar(db, user.tenant_id, body.message, machine_id=body.machine_id)

    # Build machine context if specified
    machine = None
    if body.machine_id:
        machine = await _get_machine_dict(db, body.machine_id)

    # Build messages (single turn for now; conversation history can be added later)
    messages = [{"role": "user", "content": body.message}]

    response_text = await ai_service.chat(messages, context_chunks, machine)
    return {
        "response": response_text,
        "sources": [{"source_name": c.get("source_name"), "similarity": c.get("similarity")} for c in context_chunks],
    }


@router.post("/chat/stream")
async def chat_stream(
    body: ChatStreamRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Streaming RAG chat via Server-Sent Events."""
    _require_ai()
    await set_tenant_context(db, str(user.tenant_id))

    context_chunks = await embeddings.search_similar(db, user.tenant_id, body.message, machine_id=body.machine_id)

    machine = None
    if body.machine_id:
        machine = await _get_machine_dict(db, body.machine_id)

    messages = [{"role": "user", "content": body.message}]

    async def event_generator():
        async for token in ai_service.chat_stream(messages, context_chunks, machine):
            # SSE format
            yield f"data: {json.dumps({'token': token})}\n\n"
        # Send sources at the end
        sources = [{"source_name": c.get("source_name"), "similarity": c.get("similarity")} for c in context_chunks]
        yield f"data: {json.dumps({'done': True, 'sources': sources})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/ingest-document")
async def ingest_document(
    body: IngestDocumentRequest,
    user: CurrentUser,
    db: AsyncSession = Depends(get_db),
):
    """Upload and index a document for RAG retrieval."""
    await set_tenant_context(db, str(user.tenant_id))

    chunk_ids = await embeddings.ingest_document(
        db=db,
        tenant_id=user.tenant_id,
        source_type=body.source_type,
        source_name=body.source_name,
        content_text=body.content_text,
        machine_id=body.machine_id,
        source_id=body.source_id,
    )

    return {
        "chunks_created": len(chunk_ids),
        "chunk_ids": [str(cid) for cid in chunk_ids],
    }
