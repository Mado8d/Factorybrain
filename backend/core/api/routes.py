"""Central API router — aggregates all module routes."""

from fastapi import APIRouter

from core.ai.router import router as ai_router
from core.api.audit import router as audit_router
from core.api.dashboard import router as dashboard_router
from core.api.diagnostics import router as diagnostics_router
from core.api.failure_codes import router as failure_codes_router
from core.api.kpis import router as kpis_router
from core.api.loto import router as loto_router
from core.api.requests import router as requests_router
from core.api.scheduling import router as scheduling_router
from core.api.shift import router as shift_router
from core.api.uploads import router as uploads_router
from core.api.webhooks import router as webhooks_router
from core.auth.routes import router as auth_router
from core.devices.routes import router as devices_router
from core.machines.routes import router as machines_router
from core.maintenance.pm_routes import router as pm_router
from core.maintenance.routes import router as maintenance_router
from core.plants.routes import router as plants_router
from core.tenants.routes import router as tenants_router
from core.users.routes import router as users_router

api_router = APIRouter()

# Core routes
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(users_router, prefix="/users", tags=["users"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(uploads_router, tags=["uploads"])
api_router.include_router(diagnostics_router, tags=["diagnostics"])
api_router.include_router(devices_router, prefix="/nodes", tags=["devices"])
api_router.include_router(machines_router, prefix="/machines", tags=["machines"])
api_router.include_router(plants_router, prefix="/plants", tags=["plants"])
api_router.include_router(maintenance_router, prefix="/maintenance", tags=["maintenance"])
api_router.include_router(pm_router, prefix="/maintenance/pm-schedules", tags=["preventive-maintenance"])
api_router.include_router(tenants_router, prefix="/tenants", tags=["tenants"])
api_router.include_router(requests_router, prefix="/requests", tags=["requests"])
api_router.include_router(kpis_router, prefix="/kpis", tags=["kpis"])
api_router.include_router(failure_codes_router, prefix="/failure-codes", tags=["failure-codes"])
api_router.include_router(audit_router, prefix="/audit", tags=["audit"])
api_router.include_router(shift_router, prefix="/shift-handover", tags=["shift-handover"])
api_router.include_router(loto_router, prefix="/safety", tags=["safety"])
api_router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(scheduling_router, prefix="/scheduling", tags=["scheduling"])
api_router.include_router(ai_router, prefix="/ai", tags=["ai"])
