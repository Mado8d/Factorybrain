"""Schema validation tests."""

from core.schemas.telemetry import DEFAULT_WIDGET_LAYOUT, DashboardKPIs, WidgetConfig
from core.schemas.tenant import DEFAULT_TENANT_SETTINGS, TenantSettingsUpdate, ThresholdSettings


def test_default_tenant_settings_structure():
    settings = DEFAULT_TENANT_SETTINGS
    assert "thresholds" in settings
    assert "refresh_interval_seconds" in settings
    assert settings["thresholds"]["vibration_warning"] == 2.5
    assert settings["thresholds"]["vibration_critical"] == 4.0
    assert settings["thresholds"]["anomaly_warning"] == 0.3
    assert settings["thresholds"]["anomaly_critical"] == 0.6


def test_threshold_settings_defaults():
    t = ThresholdSettings()
    assert t.vibration_warning == 2.5
    assert t.temperature_critical == 80.0


def test_tenant_settings_partial_update():
    update = TenantSettingsUpdate(thresholds=ThresholdSettings(vibration_warning=3.0))
    dumped = update.model_dump(exclude_unset=True)
    assert "thresholds" in dumped
    assert dumped["thresholds"]["vibration_warning"] == 3.0


def test_dashboard_kpis_model():
    kpis = DashboardKPIs(
        active_machines=3,
        total_machines=5,
        open_alerts=1,
        critical_alerts=0,
    )
    assert kpis.active_machines == 3
    assert kpis.avg_oee is None


def test_widget_config():
    w = WidgetConfig(
        id="test-1",
        type="kpi",
        title="Test KPI",
        position=0,
    )
    assert w.chart_type == "line"
    assert w.height == 250
    assert w.col_span == 1


def test_default_widget_layout():
    assert len(DEFAULT_WIDGET_LAYOUT) == 8
    kpis = [w for w in DEFAULT_WIDGET_LAYOUT if w["type"] == "kpi"]
    charts = [w for w in DEFAULT_WIDGET_LAYOUT if "chart" in w["type"]]
    assert len(kpis) == 4
    assert len(charts) == 4
