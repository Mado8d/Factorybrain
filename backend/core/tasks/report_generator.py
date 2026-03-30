"""Report generator — placeholder for future PDF generation via MinIO."""

import logging

from core.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(name="core.tasks.report_generator.generate_report")
def generate_report(tenant_id: str, report_type: str, params: dict | None = None):
    """Generate a report. Currently a placeholder.

    Future implementation:
    - Query data based on report_type and params
    - Generate PDF using reportlab or weasyprint
    - Upload to MinIO 'reports' bucket
    - Return download URL
    """
    logger.info(f"Report generation placeholder: {report_type} for tenant {tenant_id}")
    return {
        "status": "not_implemented",
        "report_type": report_type,
        "tenant_id": tenant_id,
    }
