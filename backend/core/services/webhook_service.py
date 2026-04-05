"""Webhook service — endpoint management and event delivery."""

import fnmatch
import hashlib
import hmac
import json
import logging
import secrets
import uuid
from datetime import UTC, datetime

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.models.webhook import WebhookDelivery, WebhookEndpoint

logger = logging.getLogger(__name__)


# --- Endpoints ---


async def list_endpoints(db: AsyncSession, tenant_id: uuid.UUID) -> list[WebhookEndpoint]:
    result = await db.execute(
        select(WebhookEndpoint)
        .where(WebhookEndpoint.tenant_id == tenant_id)
        .order_by(WebhookEndpoint.created_at.desc())
    )
    return list(result.scalars().all())


async def get_endpoint(db: AsyncSession, endpoint_id: uuid.UUID) -> WebhookEndpoint | None:
    result = await db.execute(select(WebhookEndpoint).where(WebhookEndpoint.id == endpoint_id))
    return result.scalar_one_or_none()


async def create_endpoint(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    url: str,
    events: list[str],
    description: str | None = None,
) -> WebhookEndpoint:
    endpoint = WebhookEndpoint(
        tenant_id=tenant_id,
        url=url,
        secret=secrets.token_urlsafe(32),
        events=events,
        description=description,
    )
    db.add(endpoint)
    await db.flush()
    await db.refresh(endpoint)
    return endpoint


async def update_endpoint(db: AsyncSession, endpoint: WebhookEndpoint, data: dict) -> WebhookEndpoint:
    for field, value in data.items():
        if field in ("url", "events", "is_active", "description"):
            setattr(endpoint, field, value)
    await db.flush()
    await db.refresh(endpoint)
    return endpoint


async def delete_endpoint(db: AsyncSession, endpoint: WebhookEndpoint) -> None:
    await db.delete(endpoint)
    await db.flush()


# --- Event emission ---


async def emit_event(
    db: AsyncSession,
    tenant_id: uuid.UUID,
    event_type: str,
    payload: dict,
) -> list[WebhookDelivery]:
    """Fan out an event to all matching active endpoints for this tenant."""
    endpoints = await db.execute(
        select(WebhookEndpoint).where(
            WebhookEndpoint.tenant_id == tenant_id,
            WebhookEndpoint.is_active.is_(True),
        )
    )
    deliveries = []
    for ep in endpoints.scalars().all():
        if _matches_event(ep.events, event_type):
            delivery = await deliver_webhook(db, ep, event_type, payload)
            deliveries.append(delivery)
    return deliveries


async def deliver_webhook(
    db: AsyncSession,
    endpoint: WebhookEndpoint,
    event_type: str,
    payload: dict,
) -> WebhookDelivery:
    """POST payload to endpoint with HMAC-SHA256 signature, record delivery."""
    payload_bytes = json.dumps(payload, default=str).encode("utf-8")
    signature = _sign_payload(endpoint.secret, payload_bytes)

    delivery = WebhookDelivery(
        endpoint_id=endpoint.id,
        event_type=event_type,
        payload=payload,
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(
                endpoint.url,
                content=payload_bytes,
                headers={
                    "Content-Type": "application/json",
                    "X-FactoryBrain-Signature": signature,
                    "X-FactoryBrain-Event": event_type,
                },
            )
        delivery.status_code = response.status_code
        delivery.response_body = response.text[:2000] if response.text else None
        delivery.delivered_at = datetime.now(UTC)
        endpoint.last_triggered_at = datetime.now(UTC)

        if response.status_code >= 400:
            delivery.error = f"HTTP {response.status_code}"
            endpoint.failure_count += 1
        else:
            endpoint.failure_count = 0

    except Exception as exc:
        delivery.error = str(exc)[:2000]
        endpoint.failure_count += 1
        logger.warning("Webhook delivery failed for endpoint %s: %s", endpoint.id, exc)

    db.add(delivery)
    await db.flush()
    await db.refresh(delivery)
    return delivery


# --- Delivery history ---


async def list_deliveries(db: AsyncSession, endpoint_id: uuid.UUID, limit: int = 50) -> list[WebhookDelivery]:
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.endpoint_id == endpoint_id)
        .order_by(WebhookDelivery.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


# --- Helpers ---


def _sign_payload(secret: str, payload_bytes: bytes) -> str:
    """Compute HMAC-SHA256 hex digest of payload using the endpoint secret."""
    return hmac.new(secret.encode("utf-8"), payload_bytes, hashlib.sha256).hexdigest()


def _matches_event(subscribed_events: list[str], event_type: str) -> bool:
    """Check if event_type matches any pattern in subscribed_events.

    Supports wildcards: 'alert.*' matches 'alert.triggered', '*' matches everything.
    """
    for pattern in subscribed_events:
        if fnmatch.fnmatch(event_type, pattern):
            return True
    return False
