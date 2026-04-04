"""Anomaly threshold checker — runs every minute via Celery beat."""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, text

from core.celery_app import celery_app
from core.database import SyncSession
from core.models.maintenance import MaintenanceAlert
from core.models.sensor_node import SensorNode
from core.models.sensor_reading import SensorReading
from core.models.tenant import Tenant
from core.schemas.tenant import DEFAULT_TENANT_SETTINGS

logger = logging.getLogger(__name__)


@celery_app.task(name="core.tasks.anomaly_checker.check_anomaly_thresholds")
def check_anomaly_thresholds():
    """Check latest sensor readings against tenant-configured thresholds."""
    with SyncSession() as session:
        tenants = session.execute(select(Tenant)).scalars().all()

        for tenant in tenants:
            try:
                _check_tenant(session, tenant)
            except Exception:
                logger.exception(f"Error checking thresholds for tenant {tenant.id}")
                session.rollback()

        session.commit()


def _check_tenant(session, tenant: Tenant):
    """Check all sensor readings for a single tenant."""
    settings = tenant.settings or {}
    thresholds = {
        **DEFAULT_TENANT_SETTINGS["thresholds"],
        **settings.get("thresholds", {}),
    }

    # Set RLS context — SET doesn't support bind params in PostgreSQL
    import re
    tid = str(tenant.id)
    if not re.match(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', tid):
        raise ValueError(f"Invalid tenant_id: {tid}")
    session.execute(text(f"SET LOCAL app.current_tenant = '{tid}'"))

    # Escalation check: open alerts older than escalation_minutes get upgraded
    escalation_rules = settings.get("escalation", {})
    warning_escalate_min = escalation_rules.get("warning_to_critical_minutes", 60)
    auto_create_wo = escalation_rules.get("auto_create_wo_on_critical", False)

    escalation_cutoff = datetime.now(timezone.utc) - timedelta(minutes=warning_escalate_min)
    stale_alerts = session.execute(
        select(MaintenanceAlert)
        .where(MaintenanceAlert.tenant_id == tenant.id)
        .where(MaintenanceAlert.status == "open")
        .where(MaintenanceAlert.severity == "warning")
        .where(MaintenanceAlert.created_at <= escalation_cutoff)
    ).scalars().all()

    for alert in stale_alerts:
        alert.severity = "critical"
        alert.details = {
            **(alert.details or {}),
            "escalated_from": "warning",
            "escalated_at": datetime.now(timezone.utc).isoformat(),
            "escalation_reason": f"Not acknowledged within {warning_escalate_min} minutes",
        }
        logger.info(f"Escalated alert {alert.id} from warning to critical (>{warning_escalate_min}min unacknowledged)")

    # Get latest reading per node (within last 2 minutes)
    since = datetime.now(timezone.utc) - timedelta(minutes=2)
    readings = session.execute(
        select(SensorReading)
        .where(SensorReading.tenant_id == tenant.id)
        .where(SensorReading.time >= since)
        .order_by(SensorReading.time.desc())
    ).scalars().all()

    # Deduplicate: keep only latest per node
    seen_nodes: set[str] = set()
    latest_readings = []
    for r in readings:
        if r.node_id not in seen_nodes:
            seen_nodes.add(r.node_id)
            latest_readings.append(r)

    for reading in latest_readings:
        _check_reading(session, tenant, reading, thresholds)


def _check_reading(session, tenant, reading: SensorReading, thresholds: dict):
    """Check a single reading against thresholds and create alerts if needed."""
    alerts_to_create = []

    # VibeSense checks
    if reading.vib_rms_x is not None:
        max_vib = max(
            reading.vib_rms_x or 0,
            reading.vib_rms_y or 0,
            reading.vib_rms_z or 0,
        )
        if max_vib >= thresholds["vibration_critical"]:
            alerts_to_create.append(("vibration_threshold", "critical", max_vib))
        elif max_vib >= thresholds["vibration_warning"]:
            alerts_to_create.append(("vibration_threshold", "warning", max_vib))

    if reading.anomaly_score is not None:
        if reading.anomaly_score >= thresholds["anomaly_critical"]:
            alerts_to_create.append(("anomaly_threshold", "critical", reading.anomaly_score))
        elif reading.anomaly_score >= thresholds["anomaly_warning"]:
            alerts_to_create.append(("anomaly_threshold", "warning", reading.anomaly_score))

    # Temperature check
    if reading.temperature_1 is not None:
        if reading.temperature_1 >= thresholds["temperature_critical"]:
            alerts_to_create.append(("temperature_threshold", "critical", reading.temperature_1))
        elif reading.temperature_1 >= thresholds["temperature_warning"]:
            alerts_to_create.append(("temperature_threshold", "warning", reading.temperature_1))

    # Look up machine_id from sensor node
    node = session.execute(
        select(SensorNode).where(SensorNode.id == reading.node_id)
    ).scalar_one_or_none()

    if not node or not node.machine_id:
        return

    for alert_type, severity, value in alerts_to_create:
        # Deduplicate: skip if open alert already exists for this node + type
        existing = session.execute(
            select(MaintenanceAlert)
            .where(MaintenanceAlert.tenant_id == tenant.id)
            .where(MaintenanceAlert.node_id == reading.node_id)
            .where(MaintenanceAlert.alert_type == alert_type)
            .where(MaintenanceAlert.status == "open")
        ).scalar_one_or_none()

        if existing:
            continue

        alert = MaintenanceAlert(
            tenant_id=tenant.id,
            machine_id=node.machine_id,
            node_id=reading.node_id,
            alert_type=alert_type,
            severity=severity,
            anomaly_score=value,
            details={
                "threshold": thresholds.get(f"{alert_type.split('_')[0]}_{severity}"),
                "actual_value": value,
                "node_type": reading.node_type,
                "reading_time": reading.time.isoformat(),
            },
        )
        session.add(alert)
        logger.info(
            f"Alert created: {alert_type} ({severity}) for node {reading.node_id} "
            f"value={value}"
        )
