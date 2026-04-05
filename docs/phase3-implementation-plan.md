# FactoryBrain Phase 3 — Implementation Plan
**"Make it intelligent and enterprise-ready"**

Date: April 5, 2026

---

## Architecture Principles

1. **AI as a layer, not a dependency** — Every AI feature has a fallback. If the API is down, the system works without AI. AI suggests, humans decide.
2. **Configurable per tenant** — LOTO, shift handover, AI features, integrations are all modules that can be enabled/disabled per tenant. Not every factory needs LOTO.
3. **Cost-minimal AI** — Haiku for 90% of tasks, Sonnet for complex analysis. Prompt caching cuts costs 60-90%. Target: <$50/month per tenant.
4. **Safety-critical grounding** — AI never invents torque values, part numbers, or safety procedures. Always grounded in uploaded manuals or verified data. Show confidence warnings.
5. **Webhook-first integrations** — Internal event bus powers webhooks, which power Zapier/Make/ERP connectors. Build once, integrate everywhere.

---

## Feature Map (6 Modules)

```
Phase 3
├── Module A: AI Maintenance Assistant (Weeks 1-3)
│   ├── A1: WO description + procedure generator (Haiku)
│   ├── A2: AI Chat with RAG (Sonnet + pgvector)
│   ├── A3: Anomaly analysis "Analyze with AI" (Sonnet)
│   ├── A4: Root cause suggestions from history
│   └── A5: Voice-to-text for work logging
│
├── Module B: Predictive Maintenance ML (Weeks 2-4)
│   ├── B1: Isolation Forest anomaly detection (scikit-learn)
│   ├── B2: Per-machine model training pipeline (Celery)
│   ├── B3: ONNX Runtime inference in API
│   ├── B4: PM frequency optimization (Weibull analysis)
│   └── B5: Degradation curves + health scores
│
├── Module C: Shift Handover (Weeks 3-4)
│   ├── C1: Handover model with auto-population
│   ├── C2: Structured template (status + events + open items)
│   ├── C3: Dual sign-off (outgoing + incoming)
│   └── C4: AI-generated shift summary
│
├── Module D: LOTO / Safety (Weeks 4-5)
│   ├── D1: LOTO procedure templates per machine
│   ├── D2: Digital lock-out permit workflow
│   ├── D3: WO status enforcement (can't start without LOTO)
│   ├── D4: Permit-to-work system
│   └── D5: QR scan integration for LOTO
│
├── Module E: Integrations Foundation (Weeks 5-6)
│   ├── E1: Webhook system (event bus + delivery + retry)
│   ├── E2: SSO/OIDC support (Azure AD, Google, Okta)
│   ├── E3: API documentation (OpenAPI/Swagger)
│   └── E4: Zapier/Make connector foundation
│
└── Module F: Technician Scheduling (Weeks 6-7)
    ├── F1: Skill/certification matrix
    ├── F2: Availability calendar
    ├── F3: Auto-assignment algorithm
    └── F4: Team workload dashboard
```

---

## Module A: AI Maintenance Assistant

### A1: WO Description + Procedure Generator

**How it works:**
- When creating a work order, user clicks "Generate with AI"
- Input: machine name, type, manufacturer, alert context (if from alert)
- Output: structured WO description + step-by-step procedure + safety notes
- Model: **Haiku 4.5** (fast, cheap — ~$0.006 per generation)

**Backend endpoint:**
```
POST /api/ai/generate-description
  Body: {machine_id, alert_id?, category?, title?}
  Returns: {description, procedure_steps[], safety_notes, parts_suggested[]}
```

**Prompt template (grounded):**
```
You are a maintenance procedure assistant for industrial equipment.
Generate a work order description and step-by-step procedure.

Machine: {name} ({type}, {manufacturer} {model})
Issue: {alert_type or user description}
Recent history: {last 5 WOs on this machine with outcomes}

Rules:
- Be specific to this machine type
- Include safety precautions first
- If you don't know a torque value or part number, say "refer to OEM manual"
- Number every step
- Include verification step at the end
```

### A2: AI Chat with RAG (the MaintainX CoPilot equivalent)

**Architecture:**
```
User question → Embed → pgvector similarity search → Top 5 chunks
    → Claude Sonnet with retrieved context → Streamed response
```

**Knowledge sources (per tenant):**
1. Uploaded OEM manuals (PDF → chunks → embeddings)
2. Completed work order descriptions + root causes
3. PM procedures and checklists
4. Machine specifications

**Backend:**
```
POST /api/ai/chat
  Body: {message, conversation_id?, machine_id?}
  Returns: {response, sources: [{doc_name, chunk_text, similarity}]}

POST /api/ai/chat/stream  (SSE streaming)
  Same input → Server-Sent Events with text chunks
```

**Document ingestion pipeline:**
```
Upload PDF → pymupdf4llm extract text → Split into 500-token chunks
  → Embed with voyage-3-large → Store in maintenance_documents table with vector
```

**New tables:**
```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Document chunks with embeddings
CREATE TABLE knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  source_type VARCHAR NOT NULL,  -- 'manual', 'work_order', 'procedure'
  source_id VARCHAR,             -- original doc/WO ID
  source_name VARCHAR,
  machine_id UUID REFERENCES machines(id),
  content TEXT NOT NULL,
  embedding vector(1024),        -- voyage-3-large dimension
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON knowledge_chunks USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_kc_tenant ON knowledge_chunks(tenant_id);
```

**Hallucination safety:**
- If RAG retrieval similarity < 0.7: show warning "No verified source found — AI suggestion, please verify"
- Never generate torque values, chemical concentrations, or electrical ratings without source
- Every AI response shows source documents used

### A3: "Analyze with AI" on Anomalies

**Where it appears:**
- Machine detail page → when anomaly_score > threshold → "Analyze with AI" button
- Alert detail → "Get AI Analysis" button
- Dashboard → anomaly widget → click for analysis

**What it does:**
- Sends last 24h of sensor data + machine context + recent WO history to Sonnet
- Returns: likely cause, severity assessment, recommended action, similar past incidents
- Model: **Sonnet 4.6** (needs reasoning for pattern analysis)

**Backend:**
```
POST /api/ai/analyze-anomaly
  Body: {machine_id, node_id, hours?: 24}
  Returns: {
    severity: "high",
    likely_cause: "Bearing inner race defect based on elevated vibration...",
    evidence: ["vib_rms_z increased 40% over 3 days", "dominant_freq shifted..."],
    recommended_actions: ["Schedule bearing inspection", "Order SKF 6205-2RS"],
    similar_incidents: [{wo_id, date, root_cause, outcome}],
    confidence: 0.82,
    sources_used: ["WO-00042 (March 2026)", "Machine specs"]
  }
```

### A4: Root Cause Suggestions

When closing a work order with failure codes:
- AI analyzes the machine's failure history + current failure code selection
- Suggests probable root causes based on pattern matching
- Uses failure_codes taxonomy + historical WO data
- Model: **Haiku 4.5** (structured pattern matching)

### A5: Voice-to-Text

**Two options:**

| Option | Cost | Privacy | Quality |
|--------|------|---------|---------|
| **OpenAI Whisper API** | $0.006/minute | Cloud | Excellent |
| **faster-whisper (local)** | Free (CPU) | On-premise | Good |

**Recommendation:** Start with Whisper API (simpler), add local option later.

**Frontend:** Record button on comment composer → upload audio → transcribe → insert text.

---

## Module B: Predictive Maintenance ML

### B1: Isolation Forest Anomaly Detection

**What:** Unsupervised ML that learns "normal" vibration patterns per machine and flags deviations.

**Data requirement:** 2-4 weeks of baseline sensor data per machine.

**Implementation:**
1. Celery task runs nightly: query last 30 days of sensor_readings per machine
2. Train Isolation Forest on features: [vib_rms_x, vib_rms_y, vib_rms_z, dominant_freq, crest_factor, temperature_1]
3. Export model to ONNX format
4. Store model binary in MinIO (one per machine)
5. FastAPI endpoint loads model, scores new readings

**New table:**
```sql
CREATE TABLE ml_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  machine_id UUID NOT NULL REFERENCES machines(id),
  model_type VARCHAR NOT NULL,  -- 'isolation_forest', 'lstm_ae', 'weibull'
  model_path VARCHAR NOT NULL,  -- MinIO path
  features JSONB,               -- feature names used
  metrics JSONB,                -- training metrics (auc, contamination, etc.)
  trained_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### B2: Training Pipeline (Celery)

```python
# Celery beat schedule: train_anomaly_models every night at 2 AM
@celery_app.task
def train_anomaly_models():
    for machine in get_all_machines():
        readings = get_sensor_readings(machine.id, days=30)
        if len(readings) < 1000:  # Need minimum data
            continue
        model = IsolationForest(contamination=0.05)
        model.fit(readings[FEATURES])
        onnx_model = convert_to_onnx(model)
        save_to_minio(f"models/{machine.id}/anomaly.onnx", onnx_model)
        update_ml_models_table(machine.id, ...)
```

### B3: ONNX Runtime Inference

```
POST /api/ml/score
  Body: {machine_id, readings: [{vib_rms_x, ...}]}
  Returns: {scores: [0.92, -0.15, ...], anomaly_indices: [1]}
```

### B4: PM Frequency Optimization (Weibull)

Uses the `reliability` library to analyze failure patterns:
- Collect time-between-failures from closed WOs per machine type
- Fit Weibull distribution
- Calculate optimal PM interval that minimizes total cost
- Present as recommendation in PM schedule settings

### B5: Degradation Curves

- Track rolling averages of key metrics (vib_rms, temperature) over weeks
- Plot trend line with predicted crossing of warning/critical thresholds
- Display on machine detail page as "Predicted days to threshold"

---

## Module C: Shift Handover

### Data Model

```sql
CREATE TABLE shift_handovers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plant_id UUID REFERENCES plants(id),
  shift_date DATE NOT NULL,
  shift_type VARCHAR NOT NULL,  -- 'morning', 'afternoon', 'night', or custom
  
  -- Auto-populated snapshots
  machine_statuses JSONB DEFAULT '[]',
  active_work_orders JSONB DEFAULT '[]',
  active_alerts JSONB DEFAULT '[]',
  sensor_anomalies JSONB DEFAULT '[]',
  
  -- Manual entries
  events JSONB DEFAULT '[]',
  open_items JSONB DEFAULT '[]',
  safety_notes TEXT,
  production_notes TEXT,
  
  -- Sign-off
  outgoing_user_id UUID REFERENCES users(id),
  outgoing_signed_at TIMESTAMPTZ,
  incoming_user_id UUID REFERENCES users(id),
  incoming_acknowledged_at TIMESTAMPTZ,
  
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Auto-Population

When a new handover is created, system pulls:
- Machine statuses from latest sensor readings
- Open WOs with assignee and status
- Open alerts with severity
- Sensor anomalies from last 8 hours
- AI-generated summary of shift activity (from work_order_events)

### Frontend: Handover Page

New route: `/dashboard/handover`

```
┌──────────────────────────────────────────────────┐
│  Shift Handover — April 5, 2026 — Morning Shift  │
├──────────────────────────────────────────────────┤
│                                                    │
│  Equipment Status (auto-populated)                │
│  ● CNC Mill 1 — Running                          │
│  ● Press #2 — ⚠ Maintenance (WO-00045)           │
│  ● Conveyor A — Running                           │
│                                                    │
│  Open Work Orders (3)                             │
│  🔴 WO-00045 Hydraulic repair — Jan V. — In Prog │
│  🟡 WO-00047 PM inspection — Pieter — Scheduled  │
│  🔵 WO-00048 Calibration — Unassigned            │
│                                                    │
│  Shift Events (add manually)                      │
│  + [Bearing replaced on CNC Mill 3 ............]  │
│  + [Air compressor leak detected in Hall B .....]  │
│  + Add event                                      │
│                                                    │
│  Open Items (with owner + deadline)               │
│  □ Parts arriving tomorrow for Press #2 — Jan     │
│  □ Call electrician for Hall B wiring — Pieter    │
│  + Add item                                       │
│                                                    │
│  Safety Notes                                     │
│  [Wet floor near Press #2 — signs placed .......]  │
│                                                    │
│  ✍ AI Summary: "Morning shift completed bearing   │
│  replacement on CNC-3 (WO-00042). Press #2        │
│  hydraulic repair ongoing, parts ETA tomorrow..."  │
│                                                    │
│  ──────────────────────────────────────────────── │
│  Outgoing: [Jan Vermeersch]  ☑ Signed 14:55       │
│  Incoming: [Pieter De Smet]  ☑ Acknowledged 15:02 │
│                                                    │
│  [🔒 Lock & Complete Handover]                     │
└──────────────────────────────────────────────────┘
```

### Shift Configuration (per tenant)

Store in `tenant.settings`:
```json
{
  "shifts": {
    "enabled": true,
    "types": [
      {"key": "morning", "label": "Morning", "start": "06:00", "end": "14:00"},
      {"key": "afternoon", "label": "Afternoon", "start": "14:00", "end": "22:00"},
      {"key": "night", "label": "Night", "start": "22:00", "end": "06:00"}
    ],
    "require_incoming_signoff": true,
    "require_safety_notes": false
  }
}
```

---

## Module D: LOTO / Safety

### LOTO Procedure Templates

Each machine can have a LOTO procedure defining its energy isolation points:

```sql
CREATE TABLE loto_procedures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  machine_id UUID NOT NULL REFERENCES machines(id),
  name VARCHAR NOT NULL,
  version INTEGER DEFAULT 1,
  energy_sources JSONB NOT NULL,
  -- [{type, location, isolation_method, verification_method, photo_url}]
  ppe_required TEXT[] DEFAULT '{}',
  special_instructions TEXT,
  is_active BOOLEAN DEFAULT true,
  approved_by UUID REFERENCES users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE loto_permits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  procedure_id UUID NOT NULL REFERENCES loto_procedures(id),
  status VARCHAR DEFAULT 'draft',
  -- draft, active, work_in_progress, completed, cancelled
  requested_by UUID NOT NULL REFERENCES users(id),
  authorized_by UUID REFERENCES users(id),
  authorized_at TIMESTAMPTZ,
  isolation_steps JSONB DEFAULT '[]',
  -- [{step_idx, locked_by, locked_at, lock_id, verified, unlocked_by, unlocked_at}]
  all_locked_at TIMESTAMPTZ,
  work_started_at TIMESTAMPTZ,
  work_completed_at TIMESTAMPTZ,
  all_unlocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### WO Status Enforcement

In the work order update service:
```python
# If WO requires LOTO, block start until permit is active
if wo.requires_loto and new_status == "in_progress":
    permit = get_loto_permit(wo.id)
    if not permit or permit.status != "active":
        raise HTTPException(400, "LOTO permit must be active before starting work")
```

### Permit-to-Work

Similar structure for hot work, confined space, height work, electrical work permits.
Configurable per tenant — only enable permit types that are relevant.

### QR Integration

Scan QR on machine → if LOTO procedure exists → show "Start LOTO" in quick actions.

---

## Module E: Integrations Foundation

### E1: Webhook System

**New tables:**
```sql
CREATE TABLE webhook_endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  url TEXT NOT NULL,
  secret VARCHAR NOT NULL,  -- HMAC signing key
  events TEXT[] NOT NULL,   -- ['work_order.created', 'alert.*']
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type VARCHAR NOT NULL,
  payload JSONB NOT NULL,
  status_code INTEGER,
  attempt INTEGER DEFAULT 1,
  next_retry_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Events emitted:**
- `work_order.created`, `.updated`, `.completed`, `.assigned`
- `alert.triggered`, `.resolved`
- `request.created`, `.approved`
- `pm_schedule.triggered`
- `spare_part.low_stock`

**Delivery:** Celery task with exponential backoff (10 retries over ~17 min).

### E2: SSO/OIDC

Add to `tenant.settings`:
```json
{
  "sso": {
    "enabled": true,
    "provider": "azure_ad",
    "client_id": "...",
    "metadata_url": "https://login.microsoftonline.com/{tenant}/.well-known/openid-configuration",
    "auto_provision_role": "operator"
  }
}
```

New endpoints:
```
GET  /api/auth/sso/{tenant_slug}/login    → redirect to IdP
GET  /api/auth/sso/{tenant_slug}/callback → validate token → issue JWT
```

Library: `authlib` for OIDC, `python3-saml` for legacy SAML.

### E3: API Documentation

Already have Swagger at `/api/docs`. Enhance with:
- Proper descriptions on all endpoints
- Example request/response bodies
- Authentication documentation
- Rate limit headers

### E4: Zapier/Make Foundation

The webhook system IS the Zapier foundation. Zapier subscribes via:
```
POST /api/integrations/webhooks  → registers a webhook endpoint
```

---

## Module F: Technician Scheduling

### Data Model

```sql
CREATE TABLE technician_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  skill_type VARCHAR NOT NULL,
  level INTEGER DEFAULT 1,  -- 1-5
  is_certified BOOLEAN DEFAULT false,
  certification_expiry DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, skill_type)
);

CREATE TABLE machine_skill_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  machine_id UUID NOT NULL REFERENCES machines(id),
  skill_type VARCHAR NOT NULL,
  min_level INTEGER DEFAULT 1,
  UNIQUE(machine_id, skill_type)
);

CREATE TABLE technician_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  user_id UUID NOT NULL REFERENCES users(id),
  date DATE NOT NULL,
  shift_type VARCHAR,       -- morning/afternoon/night
  status VARCHAR NOT NULL,  -- available, off, sick, vacation, on_call
  notes TEXT,
  UNIQUE(user_id, date, shift_type)
);
```

### Auto-Assignment Algorithm

Score each candidate on: skill match (40%), availability (30%), workload (20%), proximity (10%).

### Frontend: Team Schedule View

New route: `/dashboard/team`

Week view with technician rows (swim lanes), WO cards color-coded by priority, drag-and-drop reassignment, unassigned queue sidebar.

Start with 20 technicians capacity. Scale by paginating the view.

---

## New Python Dependencies

```toml
# Add to pyproject.toml
anthropic = ">=0.40"
pgvector = ">=0.3"
scikit-learn = ">=1.5"
onnxruntime = ">=1.19"
skl2onnx = ">=1.17"
reliability = ">=0.8"
pymupdf4llm = ">=0.0.10"
authlib = ">=1.3"
```

## New Frontend Dependencies

```
npm install ai react-markdown
```

---

## Implementation Timeline

```
Week 1: Module A (AI) — foundation + WO generator + chat
Week 2: Module A (AI) — RAG pipeline + anomaly analysis + voice
         Module B (PdM) — Isolation Forest + training pipeline
Week 3: Module B (PdM) — ONNX deployment + Weibull + degradation
         Module C (Shift Handover) — model + auto-populate + UI
Week 4: Module C (Shift Handover) — sign-off + AI summary
         Module D (LOTO) — procedures + permits + WO enforcement
Week 5: Module D (LOTO) — permit-to-work + QR integration
         Module E (Integrations) — webhook system + SSO
Week 6: Module E (Integrations) — API docs + Zapier
         Module F (Scheduling) — skills + availability + auto-assign
Week 7: Module F (Scheduling) — team calendar UI
         Polish, test, deploy
```

---

## New Files (Estimated)

### Backend (~25 files)
```
core/ai/router.py              — AI API endpoints
core/ai/service.py              — Claude API calls + RAG
core/ai/embeddings.py           — Document ingestion + vector search
core/ai/prompts.py              — Prompt templates
core/ml/anomaly.py              — Isolation Forest training + scoring
core/ml/weibull.py              — PM optimization
core/ml/tasks.py                — Celery training tasks
core/models/knowledge_chunk.py  — pgvector document chunks
core/models/ml_model.py         — Trained model registry
core/models/shift_handover.py   — Handover model
core/models/loto.py             — LOTO procedure + permit
core/models/webhook.py          — Webhook endpoints + deliveries
core/models/technician.py       — Skills + availability
core/schemas/ai.py, shift.py, loto.py, webhook.py, scheduling.py
core/services/shift_service.py, loto_service.py, webhook_service.py, scheduling_service.py
core/api/shift.py, loto.py, webhooks.py, scheduling.py
```

### Frontend (~15 files)
```
app/dashboard/ai/page.tsx        — AI chat interface
app/dashboard/handover/page.tsx  — Shift handover
app/dashboard/safety/page.tsx    — LOTO procedures + permits
app/dashboard/team/page.tsx      — Technician scheduling
components/dashboard/ai-chat.tsx — Chat widget (embeddable)
components/dashboard/ai-analyze.tsx — "Analyze with AI" panel
components/dashboard/handover-form.tsx
components/dashboard/loto-wizard.tsx
components/dashboard/team-calendar.tsx
store/ai.ts                      — Chat state
```

---

## Cost Estimates (per tenant, monthly)

| Item | Cost |
|------|------|
| Claude Haiku (WO gen, checklists) | ~$7 |
| Claude Sonnet (chat, analysis) | ~$30 |
| Voyage embeddings | ~$1 |
| Prompt caching savings | -$15 |
| **Total AI** | **~$25/month** |
| Server (already on Hetzner CX23) | $0 additional |
| **Total Phase 3 runtime** | **~$25/month** |

---

## Success Metrics

| Feature | Target | Measurement |
|---------|--------|-------------|
| AI procedure adoption | >50% of new WOs use AI | WOs with AI-generated content flag |
| Chat usage | >10 queries/day | AI chat message count |
| Anomaly detection | >80% true positive | Confirmed vs false alerts |
| Shift handover completion | >90% of shifts | Handovers with both signatures |
| LOTO compliance | 100% for LOTO-required WOs | WOs started without active permit = 0 |
| Webhook reliability | >99% delivery | Failed deliveries / total |
| Auto-assignment accuracy | >70% accepted | Assignments not manually overridden |
