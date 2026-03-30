"""Celery application — background task processing."""

from celery import Celery

from core.config import settings

celery_app = Celery(
    "factorybrain",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=[
        "core.tasks.anomaly_checker",
        "core.tasks.node_health",
        "core.tasks.report_generator",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Europe/Brussels",
    enable_utc=True,
    worker_max_tasks_per_child=100,
    worker_concurrency=2,
    beat_schedule={
        "anomaly-threshold-check": {
            "task": "core.tasks.anomaly_checker.check_anomaly_thresholds",
            "schedule": 60.0,
        },
        "node-health-check": {
            "task": "core.tasks.node_health.check_node_health",
            "schedule": 300.0,
        },
    },
)
