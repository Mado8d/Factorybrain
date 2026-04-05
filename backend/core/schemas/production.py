"""Production schemas — logs, summaries, import results."""

from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, computed_field


class ProductionLogCreate(BaseModel):
    machine_id: UUID | None = None
    production_line_id: UUID | None = None
    shift_date: date
    shift_type: str | None = None
    planned_units: int = 0
    actual_units: int = 0
    defect_units: int = 0
    planned_runtime_minutes: int = 480
    actual_runtime_minutes: int | None = None
    downtime_minutes: int = 0
    ideal_cycle_time_seconds: float | None = None
    product_type: str | None = None
    batch_number: str | None = None
    operator_name: str | None = None
    notes: str | None = None
    source: str = "manual"


class ProductionLogUpdate(BaseModel):
    machine_id: UUID | None = None
    production_line_id: UUID | None = None
    shift_date: date | None = None
    shift_type: str | None = None
    planned_units: int | None = None
    actual_units: int | None = None
    defect_units: int | None = None
    planned_runtime_minutes: int | None = None
    actual_runtime_minutes: int | None = None
    downtime_minutes: int | None = None
    ideal_cycle_time_seconds: float | None = None
    product_type: str | None = None
    batch_number: str | None = None
    operator_name: str | None = None
    notes: str | None = None


class ProductionLogResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    machine_id: UUID | None
    production_line_id: UUID | None
    shift_date: date
    shift_type: str | None
    planned_units: int
    actual_units: int
    defect_units: int
    planned_runtime_minutes: int
    actual_runtime_minutes: int | None
    downtime_minutes: int
    ideal_cycle_time_seconds: float | None
    product_type: str | None
    batch_number: str | None
    operator_name: str | None
    notes: str | None
    source: str
    imported_at: datetime | None
    imported_by: UUID | None
    created_at: datetime
    updated_at: datetime
    machine_name: str | None = None

    @computed_field
    @property
    def performance_rate(self) -> float | None:
        if (
            self.actual_units
            and self.actual_runtime_minutes
            and self.ideal_cycle_time_seconds
            and self.actual_runtime_minutes > 0
            and self.ideal_cycle_time_seconds > 0
        ):
            expected = self.actual_runtime_minutes * 60 / self.ideal_cycle_time_seconds
            return round(self.actual_units / expected * 100, 1) if expected > 0 else None
        return None

    @computed_field
    @property
    def quality_rate(self) -> float | None:
        if self.actual_units and self.actual_units > 0:
            return round((self.actual_units - self.defect_units) / self.actual_units * 100, 1)
        return None

    @computed_field
    @property
    def availability_rate(self) -> float | None:
        if self.actual_runtime_minutes is not None and self.planned_runtime_minutes > 0:
            return round(self.actual_runtime_minutes / self.planned_runtime_minutes * 100, 1)
        return None

    @computed_field
    @property
    def oee(self) -> float | None:
        a = self.availability_rate
        p = self.performance_rate
        q = self.quality_rate
        if a is not None and p is not None and q is not None:
            return round(a * p * q / 10000, 1)
        return None

    class Config:
        from_attributes = True


class ProductionSummary(BaseModel):
    total_planned: int = 0
    total_actual: int = 0
    total_defects: int = 0
    total_planned_runtime: int = 0
    total_actual_runtime: int = 0
    total_downtime: int = 0
    avg_availability: float | None = None
    avg_performance: float | None = None
    avg_quality: float | None = None
    avg_oee: float | None = None
    log_count: int = 0


class OEETrendPoint(BaseModel):
    date: str
    availability: float | None = None
    performance: float | None = None
    quality: float | None = None
    oee: float | None = None


class ExcelImportResponse(BaseModel):
    imported: int = 0
    errors: list[dict] = []
    total_rows: int = 0
