"""Node health checker — runs every 5 minutes via Celery beat."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from core.celery_app import celery_app
from core.database import SyncSession
from core.models.sensor_node import SensorNode

logger = logging.getLogger(__name__)

NODE_OFFLINE_THRESHOLD_MINUTES = 10


@celery_app.task(name="core.tasks.node_health.check_node_health")
def check_node_health():
    """Mark sensor nodes as inactive if they haven't reported in 10 minutes."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=NODE_OFFLINE_THRESHOLD_MINUTES)

    with SyncSession() as session:
        # Find active nodes that haven't been seen recently
        stale_nodes = session.execute(
            select(SensorNode)
            .where(SensorNode.is_active == True)  # noqa: E712
            .where(SensorNode.last_seen != None)  # noqa: E711
            .where(SensorNode.last_seen < cutoff)
        ).scalars().all()

        for node in stale_nodes:
            node.is_active = False
            logger.warning(
                f"Node {node.id} marked inactive — last seen {node.last_seen}"
            )

        # Also find active nodes that have never reported
        never_seen = session.execute(
            select(SensorNode)
            .where(SensorNode.is_active == True)  # noqa: E712
            .where(SensorNode.last_seen == None)  # noqa: E711
        ).scalars().all()

        # Re-activate nodes that have come back online
        revived_nodes = session.execute(
            select(SensorNode)
            .where(SensorNode.is_active == False)  # noqa: E712
            .where(SensorNode.last_seen != None)  # noqa: E711
            .where(SensorNode.last_seen >= cutoff)
        ).scalars().all()

        for node in revived_nodes:
            node.is_active = True
            logger.info(f"Node {node.id} re-activated — last seen {node.last_seen}")

        session.commit()

        total_stale = len(stale_nodes)
        total_revived = len(revived_nodes)
        if total_stale or total_revived:
            logger.info(
                f"Health check: {total_stale} nodes marked inactive, "
                f"{total_revived} nodes re-activated"
            )
