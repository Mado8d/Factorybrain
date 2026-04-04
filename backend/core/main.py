"""FactoryBrain — Main FastAPI application."""

import logging
import sys
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

    # Start MQTT consumer (skip on Windows — aiomqtt needs SelectorEventLoop)
    if sys.platform != "win32":
        await mqtt_service.start()
        logger.info("MQTT consumer started")
    else:
        logger.warning("MQTT consumer disabled on Windows. Use the DB simulator instead.")

    yield

    # Shutdown
    if sys.platform != "win32":
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
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

# Mount API router
app.include_router(api_router, prefix="/api")


@app.middleware("http")
async def add_security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    return response


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "0.1.0"}
