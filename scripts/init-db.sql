-- ============================================================
-- FactoryBrain — Database Initialization
-- Runs once on first docker compose up
-- ============================================================

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- PLATFORM CORE — Multi-tenant foundation
-- ============================================================

CREATE TABLE tenants (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE NOT NULL,
    plan            TEXT DEFAULT 'starter',
    timezone        TEXT DEFAULT 'Europe/Brussels',
    locale          TEXT DEFAULT 'nl-BE',
    settings        JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) NOT NULL,
    email           TEXT UNIQUE NOT NULL,
    name            TEXT NOT NULL,
    hashed_password TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'viewer',
    is_active       BOOLEAN DEFAULT true,
    preferences     JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_tenant ON users(tenant_id);

-- ============================================================
-- ASSET REGISTRY — Machines, production lines, plants
-- ============================================================

CREATE TABLE plants (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) NOT NULL,
    name        TEXT NOT NULL,
    timezone    TEXT DEFAULT 'Europe/Brussels',
    address     TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_plants_tenant ON plants(tenant_id);

CREATE TABLE production_lines (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) NOT NULL,
    plant_id    UUID REFERENCES plants(id) NOT NULL,
    name        TEXT NOT NULL,
    line_type   TEXT,
    sort_order  INTEGER DEFAULT 0,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE machines (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) NOT NULL,
    line_id         UUID REFERENCES production_lines(id),
    name            TEXT NOT NULL,
    asset_tag       TEXT,
    machine_type    TEXT,
    manufacturer    TEXT,
    model           TEXT,
    year_installed  INTEGER,
    rated_power_kw  REAL,
    status          TEXT DEFAULT 'active',
    specifications  JSONB DEFAULT '{}',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_machines_tenant ON machines(tenant_id);

-- ============================================================
-- SENSOR NODES — Device management
-- ============================================================

CREATE TABLE sensor_nodes (
    id              TEXT PRIMARY KEY,
    tenant_id       UUID REFERENCES tenants(id) NOT NULL,
    machine_id      UUID REFERENCES machines(id),
    node_type       TEXT NOT NULL DEFAULT 'vibesense',
    firmware_ver    TEXT,
    hw_revision     TEXT,
    install_date    DATE,
    last_seen       TIMESTAMPTZ,
    config          JSONB DEFAULT '{}',
    is_active       BOOLEAN DEFAULT true,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_nodes_tenant ON sensor_nodes(tenant_id);

-- ============================================================
-- TIME-SERIES — Sensor telemetry (hypertable)
-- ============================================================

CREATE TABLE sensor_readings (
    time            TIMESTAMPTZ NOT NULL,
    tenant_id       UUID NOT NULL,
    node_id         TEXT NOT NULL,
    node_type       TEXT NOT NULL DEFAULT 'vibesense',
    -- Common
    temperature_1   REAL,
    -- VibeSense
    vib_rms_x       REAL,
    vib_rms_y       REAL,
    vib_rms_z       REAL,
    dominant_freq   REAL,
    crest_factor    REAL,
    anomaly_score   REAL,
    -- EnergySense
    grid_power_w    REAL,
    solar_power_w   REAL,
    channel_1_w     REAL,
    channel_2_w     REAL,
    channel_3_w     REAL,
    channel_4_w     REAL,
    voltage_v       REAL,
    power_factor    REAL,
    -- Shared
    current_rms     REAL,
    energy_kwh      REAL
);
SELECT create_hypertable('sensor_readings', 'time');
CREATE INDEX idx_readings_tenant_node ON sensor_readings(tenant_id, node_id, time DESC);

-- 5-minute continuous aggregate
CREATE MATERIALIZED VIEW sensor_5min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('5 minutes', time) AS bucket,
    tenant_id,
    node_id,
    node_type,
    AVG(vib_rms_x) AS avg_vib_x,
    MAX(vib_rms_x) AS max_vib_x,
    AVG(current_rms) AS avg_current,
    AVG(temperature_1) AS avg_temp,
    MAX(anomaly_score) AS max_anomaly,
    AVG(grid_power_w) AS avg_grid_power,
    AVG(solar_power_w) AS avg_solar_power
FROM sensor_readings
GROUP BY bucket, tenant_id, node_id, node_type;

-- Compression policy: compress chunks older than 7 days
SELECT add_compression_policy('sensor_readings', INTERVAL '7 days');

-- Retention policy: drop raw data older than 1 year
SELECT add_retention_policy('sensor_readings', INTERVAL '1 year');

-- ============================================================
-- MACHINE EVENTS — State changes, alarms (hypertable)
-- ============================================================

CREATE TABLE machine_events (
    time        TIMESTAMPTZ NOT NULL,
    tenant_id   UUID NOT NULL,
    machine_id  UUID NOT NULL,
    event_type  TEXT NOT NULL,
    severity    TEXT DEFAULT 'info',
    source      TEXT,
    details     JSONB DEFAULT '{}',
    created_by  UUID
);
SELECT create_hypertable('machine_events', 'time');
CREATE INDEX idx_events_machine ON machine_events(machine_id, time DESC);

-- ============================================================
-- MAINTENANCE — Alerts, work orders, service providers
-- ============================================================

CREATE TABLE service_providers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES tenants(id) NOT NULL,
    company_name        TEXT NOT NULL,
    contact_name        TEXT,
    contact_email       TEXT,
    contact_phone       TEXT,
    specializations     TEXT[],
    sla_response_hours  INTEGER,
    sla_resolve_hours   INTEGER,
    contract_type       TEXT,
    hourly_rate         DECIMAL(8,2),
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE service_provider_users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_provider_id UUID REFERENCES service_providers(id) NOT NULL,
    tenant_id           UUID REFERENCES tenants(id) NOT NULL,
    email               TEXT NOT NULL,
    name                TEXT NOT NULL,
    hashed_password     TEXT NOT NULL,
    role                TEXT DEFAULT 'technician',
    is_active           BOOLEAN DEFAULT true,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email, tenant_id)
);

CREATE TABLE maintenance_alerts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) NOT NULL,
    machine_id      UUID REFERENCES machines(id) NOT NULL,
    node_id         TEXT REFERENCES sensor_nodes(id),
    alert_type      TEXT NOT NULL,
    severity        TEXT NOT NULL DEFAULT 'info',
    anomaly_score   REAL,
    predicted_rul   INTERVAL,
    details         JSONB DEFAULT '{}',
    status          TEXT DEFAULT 'open',
    acknowledged_by UUID,
    acknowledged_at TIMESTAMPTZ,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_alerts_tenant ON maintenance_alerts(tenant_id, created_at DESC);

CREATE TABLE maintenance_work_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES tenants(id) NOT NULL,
    wo_number           TEXT UNIQUE NOT NULL,
    trigger_type        TEXT NOT NULL,
    trigger_alert_id    UUID REFERENCES maintenance_alerts(id),
    machine_id          UUID REFERENCES machines(id) NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    priority            TEXT NOT NULL DEFAULT 'medium',
    category            TEXT,
    machine_context     JSONB DEFAULT '{}',
    assigned_to_provider UUID REFERENCES service_providers(id),
    assigned_to_tech    UUID REFERENCES service_provider_users(id),
    assigned_at         TIMESTAMPTZ,
    assigned_by         UUID REFERENCES users(id),
    status              TEXT DEFAULT 'draft',
    requested_date      DATE,
    scheduled_date      DATE,
    estimated_duration  INTERVAL,
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    work_performed      TEXT,
    root_cause          TEXT,
    parts_used          JSONB,
    labor_hours         DECIMAL(6,2),
    total_cost          DECIMAL(10,2),
    verified_at         TIMESTAMPTZ,
    verified_by         UUID REFERENCES users(id),
    verification_status TEXT,
    quality_rating      INTEGER,
    downtime_minutes    INTEGER,
    attachments         JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wo_tenant ON maintenance_work_orders(tenant_id, created_at DESC);
CREATE INDEX idx_wo_provider ON maintenance_work_orders(assigned_to_provider);

-- ============================================================
-- AI SUGGESTIONS — Human-in-the-loop logging
-- ============================================================

CREATE TABLE ai_suggestions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES tenants(id) NOT NULL,
    suggestion_type TEXT NOT NULL,
    context         JSONB NOT NULL,
    options         JSONB NOT NULL,
    model_version   TEXT,
    confidence      REAL,
    status          TEXT DEFAULT 'pending',
    decided_by      UUID,
    decided_at      TIMESTAMPTZ,
    decision_reason TEXT,
    applied_option  INTEGER,
    modification    JSONB,
    outcome_rating  INTEGER,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW-LEVEL SECURITY — Tenant isolation
-- ============================================================

ALTER TABLE plants ENABLE ROW LEVEL SECURITY;
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE machine_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_work_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;

-- RLS policies (applied via app.current_tenant session variable)
CREATE POLICY tenant_isolation_plants ON plants
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_machines ON machines
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_nodes ON sensor_nodes
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_readings ON sensor_readings
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_events ON machine_events
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_alerts ON maintenance_alerts
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_wo ON maintenance_work_orders
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);
CREATE POLICY tenant_isolation_sp ON service_providers
    USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- ============================================================
-- SEED DATA — Development tenant
-- ============================================================

INSERT INTO tenants (id, name, slug, plan) VALUES
    ('a0000000-0000-0000-0000-000000000001', 'Dev Factory', 'dev-factory', 'enterprise');

-- Dev admin user (password: "admin123" — bcrypt hash)
INSERT INTO users (tenant_id, email, name, hashed_password, role) VALUES
    ('a0000000-0000-0000-0000-000000000001',
     'admin@devfactory.local',
     'Admin',
     '$2b$12$LJ3m4ys3Lz0YK4g1Q5z5O.sY9q2JzKq8vK1J3m4ys3Lz0YK4g1Q5',
     'admin');
