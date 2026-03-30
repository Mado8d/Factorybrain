"""FactoryBrain — Main FastAPI application."""

import logging
from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from core.config import settings
from core.api.routes import api_router
from core.ingestion.mqtt_consumer import mqtt_service

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Startup and shutdown events."""
    logger.info("Starting FactoryBrain API...")

    # Start MQTT consumer as background task
    await mqtt_service.start()
    logger.info("MQTT consumer started")

    yield

    # Shutdown
    await mqtt_service.stop()
    logger.info("FactoryBrain API stopped")


app = FastAPI(
    title="FactoryBrain",
    description="Intelligent Manufacturing Platform — Predictive Maintenance + MES",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API router
app.include_router(api_router, prefix="/api")


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "0.1.0"}
