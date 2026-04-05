"""SQLAlchemy models — central registry."""

from core.models.ai_suggestion import AISuggestion
from core.models.base import Base
from core.models.machine import Machine
from core.models.machine_event import MachineEvent
from core.models.maintenance import (
    MaintenanceAlert,
    MaintenanceWorkOrder,
    PMOccurrence,
    PreventiveMaintenanceSchedule,
    ServiceProvider,
    ServiceProviderUser,
    SparePart,
)
from core.models.plant import Plant, ProductionLine
from core.models.production_log import ProductionLog
from core.models.sensor_node import SensorNode
from core.models.sensor_reading import SensorReading
from core.models.tenant import Tenant
from core.models.user import User

__all__ = [
    "Base",
    "Tenant",
    "User",
    "Plant",
    "ProductionLine",
    "Machine",
    "SensorNode",
    "SensorReading",
    "MachineEvent",
    "MaintenanceAlert",
    "MaintenanceWorkOrder",
    "ServiceProvider",
    "PreventiveMaintenanceSchedule",
    "PMOccurrence",
    "ServiceProviderUser",
    "AISuggestion",
    "SparePart",
    "ProductionLog",
]
