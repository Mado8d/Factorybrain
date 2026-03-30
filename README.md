# FactoryBrain — Intelligent Manufacturing Platform

> Plak een sensorbox op je machine, krijg een dashboard dat voorspelt wanneer die stuk gaat, hoeveel je produceert, en hoe je je ploegplanning moet optimaliseren.

## Architecture

```
factorybrain/
├── backend/          # FastAPI + Celery (Python 3.12)
├── frontend/         # Next.js 14 + shadcn/ui
├── firmware/         # ESP-IDF (C) — VibeSense & EnergySense nodes
├── pcb/              # KiCad schematics & PCB layouts
├── ml/               # ML training pipelines (PyTorch, ONNX)
├── docs/             # Documentation
├── scripts/          # Dev & deployment scripts
└── docker-compose.yml
```

## Quick Start

```bash
# 1. Clone & setup
git clone https://github.com/your-org/factorybrain.git
cd factorybrain
cp .env.example .env

# 2. Start infrastructure
docker compose up -d

# 3. Backend
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
alembic upgrade head
uvicorn core.main:app --reload

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI (Python 3.12) | Async, type-safe, ML-native |
| Database | TimescaleDB (PostgreSQL 16) | Time-series + relational in one |
| Cache | Redis | Pub/sub, caching, rate limiting |
| Messaging | Mosquitto (MQTT 5.0) | Sensor telemetry, TLS, QoS |
| Storage | MinIO | Models, reports, firmware images |
| Frontend | Next.js 14 + shadcn/ui | SSR dashboards, real-time UI |
| Firmware | ESP-IDF 5.x (C) | Industrial-grade edge computing |
| ML | PyTorch → ONNX/TFLite | Train server-side, deploy edge |
| Infra | Docker Compose + Caddy | Single-node, auto-HTTPS |

## License

Proprietary — All rights reserved.
