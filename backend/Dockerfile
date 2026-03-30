FROM python:3.12-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends gcc libpq-dev && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml .
RUN pip install --no-cache-dir .

FROM base AS api
COPY . .
CMD ["uvicorn", "core.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]

FROM base AS celery-worker
COPY . .
CMD ["celery", "-A", "core.celery_app:celery_app", "worker", "--loglevel=info", "--concurrency=2", "--max-tasks-per-child=100"]

FROM base AS celery-beat
COPY . .
CMD ["celery", "-A", "core.celery_app:celery_app", "beat", "--loglevel=info"]
