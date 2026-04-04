# FactoryBrain Phase 1 — Implementation Plan
**"Make it usable in the field"**

Date: April 4, 2026

---

## Architecture Principles

Before any feature, these rules govern every decision:

1. **Mobile-first, desktop-enhanced** — Design for a 375px phone screen first. Desktop gets more columns, not different features.
2. **< 3 taps for any common action** — If a technician needs more than 3 taps to start a timer, log a comment, or scan an asset, the UX has failed.
3. **Offline-resilient** — Core read operations work offline. Writes queue and sync. Graceful degradation, not full offline-first (Phase 1 scope).
4. **Role-based experiences** — Technicians, managers, and operators see different default views. One app, three experiences.
5. **Event-sourced activity** — Every action on a work order becomes an event in a unified timeline. This is the foundation for audit trail (Phase 2) and AI knowledge capture (Phase 3).
6. **Multi-language ready** — All user-facing strings extracted to a translation layer from Day 1. Ship English first, but the architecture supports NL/FR/DE without refactoring.

---

## Current Architecture (What We're Building On)

| Layer | Technology | Status |
|-------|-----------|--------|
| Frontend | Next.js 14, React 18, Zustand, Tailwind, Radix UI | Solid |
| API Client | Singleton class, 50+ methods, JWT + refresh | Solid |
| PWA | Manifest + basic SW (offline.html fallback only) | Needs upgrade |
| QR Generation | `qrcode.react` already installed | Ready |
| QR Scanning | Not installed | Needs `@yudiel/react-qr-scanner` |
| Barcode | `react-barcode` for spare parts labels | Ready |
| Charts | Recharts (line, area, bar, gauge) | Solid |
| State | Zustand (auth + dashboard stores) | Needs expansion |
| Forms | react-hook-form + zod | Ready |
| Backend | FastAPI, SQLAlchemy async, TimescaleDB | Solid |
| Auth | JWT + role hierarchy (5 levels) + permissions | Solid |
| Real-time | MQTT → WebSocket broadcast | Solid |

---

## Feature 1: Work Order Activity Feed & Comments

### Why First
This is the backbone everything else plugs into. Time tracking logs to it. QR scans create entries in it. Request approvals flow through it. It's the "source of truth" for what happened on a work order.

### Data Model (Backend)

```
NEW TABLE: work_order_events
  id              UUID PK
  tenant_id       UUID FK → tenants (indexed)
  work_order_id   UUID FK → maintenance_work_orders (indexed)
  user_id         UUID FK → users (nullable — system events have no user)
  event_type      VARCHAR — 'comment' | 'status_change' | 'assignment' | 
                            'time_start' | 'time_stop' | 'part_used' | 
                            'photo' | 'checklist_update' | 'request_note'
  content         TEXT (nullable — comment text, status change description)
  metadata        JSONB — flexible per event type:
                    status_change: {from: "open", to: "in_progress"}
                    time_stop: {duration_seconds: 5400, category: "wrench"}
                    part_used: {part_id, part_name, quantity}
                    photo: {filename, original_name, size}
                    assignment: {assigned_to, assigned_by}
  mentions        UUID[] — array of mentioned user IDs
  attachments     JSONB[] — [{filename, url, content_type, size}]
  created_at      TIMESTAMPTZ
```

**RLS**: Enable on `work_order_events` with tenant_id policy.

### API Endpoints

```
GET    /api/maintenance/work-orders/{wo_id}/events
         ?limit=50&offset=0&types=comment,status_change
POST   /api/maintenance/work-orders/{wo_id}/events
         Body: {event_type: "comment", content: "Bearing replaced", 
                mentions: ["uuid"], attachments: [...]}
```

### Auto-Generated Events

The system automatically creates events when:
- Work order status changes (any field update via existing PATCH endpoint)
- Work order is assigned/reassigned
- Parts are used (link to inventory deduction — Phase 2)
- Time tracking starts/stops (Feature 3)
- Checklist items are completed

This means the existing `update_work_order` service function gets a hook to emit events.

### Frontend: Activity Feed Component

**`/components/dashboard/activity-feed.tsx`** — Reusable component.

```
Visual Design:
┌─────────────────────────────────────────────┐
│ Activity                                     │
├─────────────────────────────────────────────┤
│ ● 14:42  Jan V.                              │
│   Bearing seems worn, ordering replacement   │
│   📷 [photo_bearing.jpg]                     │
│                                              │
│ ⚙ 14:40  System                              │
│   Status changed: Open → In Progress         │
│                                              │
│ ● 14:38  Pieter D.                           │
│   @Jan check WO #1247 — same issue in March  │
│                                              │
│ ─── Today ──────────────────────────────────│
│                                              │
│ ⚙ 09:15  System                              │
│   Work order created from alert #A-0042      │
├─────────────────────────────────────────────┤
│ 💬 Add comment...                    [📷] [→]│
└─────────────────────────────────────────────┘
```

**Comment composer features:**
- Text input with @mention autocomplete (type `@` → user dropdown)
- Photo attachment (camera capture on mobile, file picker on desktop)
- Compress images client-side before upload (`browser-image-compression`)
- Submit on Enter (desktop) or Send button (mobile)

### @Mention System

- Store mentions as `@[user_uuid]` in raw text
- Parse on save → extract user IDs → create notifications
- Render: replace `@[uuid]` with styled chip showing user name
- Autocomplete: fetch tenant users, filter as you type after `@`

### Integration Points

The activity feed embeds in:
1. Work order detail page (primary location)
2. Machine detail page → "Recent Activity" tab (filtered by machine)
3. Dashboard → notification bell (mentions + assignments)

---

## Feature 2: QR Code Scanning & Asset Quick Actions

### QR Code Format

**URL-based**: `https://{tenant-domain}/scan/{machine_id}`

For now (no custom domain yet): `https://app.factorybrain.io/s/{machine_id}`

Falls back to: `/dashboard/machines/{machine_id}` in the app.

### QR Label Generation (Enhance Existing)

Extend the existing barcode label system (spare parts) to machines:

**Label layout (50x25mm)**:
```
┌────────────────────────────┐
│ ┌─────┐  MACHINE NAME      │
│ │ QR  │  Asset: CNC-001    │
│ │CODE │  Line: Production A │
│ └─────┘  FactoryBrain       │
└────────────────────────────┘
```

**Print flow**: Machine detail page → "Print QR Label" button → opens print dialog with formatted label.

### QR Scanner Page

**New route**: `/dashboard/scan`

**New package**: `npm install @yudiel/react-qr-scanner`

**Flow**:
1. Open scanner (camera permission prompt on first use)
2. Point at QR code → vibrate on detect
3. Parse URL → extract machine_id
4. Show Quick Action Sheet (bottom sheet):

```
┌─────────────────────────────────────────┐
│ ✕                                        │
│                                          │
│  CNC Milling Machine 3                   │
│  Line: Production A  •  Status: ● Active │
│                                          │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ 📋 Open WOs  │  │ 🔧 New WO    │     │
│  │    (3)       │  │              │     │
│  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ ⚠️ Report    │  │ 📊 History   │     │
│  │  Issue       │  │              │     │
│  └──────────────┘  └──────────────┘     │
│  ┌──────────────┐  ┌──────────────┐     │
│  │ 📄 Docs      │  │ 📈 Telemetry │     │
│  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────┘
```

**"Report Issue"** → opens the Request Portal pre-filled with this machine.

### Anonymous Scan (No Login)

If someone scans without being logged in:
- Show a simplified "Report Issue" form (Feature 5's request portal)
- Pre-fill the machine from the QR code
- No login required — public request submission

### Sidebar Integration

Add "Scan" to the sidebar with a QR icon. On mobile, make it a floating action button (FAB) in the bottom-right corner — always accessible.

---

## Feature 3: Work Order Time Tracking

### Data Model

```
NEW TABLE: time_entries
  id              UUID PK
  tenant_id       UUID FK → tenants (indexed)
  work_order_id   UUID FK → maintenance_work_orders (indexed)
  user_id         UUID FK → users (indexed)
  started_at      TIMESTAMPTZ NOT NULL
  paused_at       TIMESTAMPTZ (nullable)
  stopped_at      TIMESTAMPTZ (nullable)
  category        VARCHAR DEFAULT 'wrench' 
                  — 'wrench' | 'travel' | 'waiting' | 'admin'
  duration_seconds INTEGER (calculated on stop)
  notes           TEXT (nullable)
  created_at      TIMESTAMPTZ
```

**RLS**: Enable with tenant_id policy.

### API Endpoints

```
POST   /api/maintenance/work-orders/{wo_id}/time/start
         Body: {category: "wrench"}
POST   /api/maintenance/work-orders/{wo_id}/time/pause
POST   /api/maintenance/work-orders/{wo_id}/time/stop
         Body: {notes: "optional"}
GET    /api/maintenance/work-orders/{wo_id}/time
         → [{id, user_name, started_at, duration_seconds, category}]
POST   /api/maintenance/work-orders/{wo_id}/time/manual
         Body: {started_at, stopped_at, category, notes}
```

### Business Rules

- **One active timer per user** — starting a new timer auto-pauses the current one
- **Timer persists across app restarts** — store active timer in localStorage
- **Orphan detection** — if timer was started > 12 hours ago without stop, prompt user
- **Auto-stop on WO completion** — when WO status → "completed", stop all active timers
- **Each start/stop creates a work_order_event** — so it appears in the activity feed

### Frontend: Timer Widget

Lives on the work order detail page AND in a persistent mini-bar at the bottom of the screen (like a music player):

**Full timer (WO detail page)**:
```
┌─────────────────────────────────┐
│  ⏱  01:23:45                    │
│                                  │
│  ● Wrench  ○ Travel  ○ Waiting  │
│                                  │
│  [ ⏸ Pause ]  [ ⏹ Stop & Log ] │
└─────────────────────────────────┘
```

**Mini-bar (persistent across pages)**:
```
┌─────────────────────────────────────────────┐
│ ⏱ 01:23:45 — WO-00042 CNC Bearing Replace  │
│                              [Pause] [Stop] │
└─────────────────────────────────────────────┘
```

### Zustand Store: Timer

```typescript
// /src/store/timer.ts
interface TimerState {
  activeTimer: {
    workOrderId: string;
    workOrderTitle: string;
    timeEntryId: string;
    startedAt: string;
    category: string;
    isPaused: boolean;
    pausedAt: string | null;
  } | null;
  elapsed: number; // seconds, updated every second
  start(woId, woTitle, category) → Promise<void>;
  pause() → Promise<void>;
  resume() → Promise<void>;
  stop(notes?) → Promise<void>;
}
```

Persist to localStorage so it survives page refresh. A `setInterval` ticks every second to update the displayed elapsed time.

---

## Feature 4: Enhanced PWA (Service Worker + Caching)

### Migration: Hand-rolled sw.js → Serwist

**Install**: `npm install @serwist/next serwist`

Replace the current hand-rolled `/public/sw.js` with Serwist's managed service worker.

### Caching Strategy

| Resource | Strategy | Max Age |
|----------|----------|---------|
| App shell (JS/CSS/HTML) | Precache (build-time) | Until next deploy |
| Fonts, icons | Cache-First | 30 days |
| API: `/api/machines` | Stale-While-Revalidate | 5 min |
| API: `/api/maintenance/work-orders` | Network-First | 2 min |
| API: `/api/dashboard/kpis` | Network-First | 1 min |
| API: `/api/users/me` | Cache-First | Session |
| Uploaded images/docs | Cache-First | 7 days |
| Telemetry/WebSocket | Network-only | — |

### Install Prompt

Show a tasteful install banner on first mobile visit (after 2nd page view):

```
┌─────────────────────────────────────────┐
│ 📱 Install FactoryBrain for quick access│
│    Works offline • Push notifications   │
│                                         │
│  [ Install ]              [ Not now ]   │
└─────────────────────────────────────────┘
```

Use the `beforeinstallprompt` event. Store dismissal in localStorage (don't show again for 7 days).

### Push Notifications (Foundation)

**Backend**: Add `pywebpush` to dependencies. Generate VAPID keys.

**New table**: `push_subscriptions`
```
  id              UUID PK
  user_id         UUID FK → users
  tenant_id       UUID FK → tenants  
  endpoint        TEXT
  p256dh_key      TEXT
  auth_key        TEXT
  created_at      TIMESTAMPTZ
```

**New endpoints**:
```
POST   /api/notifications/subscribe    — store push subscription
DELETE /api/notifications/subscribe    — unsubscribe
GET    /api/notifications/preferences  — get notification settings per category
PUT    /api/notifications/preferences  — update preferences
```

**Notification triggers** (hook into existing systems):
- Maintenance alert created → push to assigned technicians
- Work order assigned → push to assignee
- @mention in comment → push to mentioned user
- PM schedule due → push to assigned technician

**Notification categories** (user-configurable):
```
{
  "critical_alerts": {"push": true, "email": true},
  "work_order_assigned": {"push": true, "email": false},
  "mentions": {"push": true, "email": false},
  "pm_reminders": {"push": false, "email": true},
  "request_updates": {"push": false, "email": false}
}
```

---

## Feature 5: Self-Service Work Request Portal

### Architecture

**New route**: `/request/{tenant_slug}` — public, no auth required.

**Also accessible via**: QR scan by non-logged-in users.

### Data Model

```
NEW TABLE: work_requests
  id              UUID PK
  tenant_id       UUID FK → tenants (indexed)
  machine_id      UUID FK → machines (nullable)
  status          VARCHAR DEFAULT 'new' 
                  — 'new' | 'approved' | 'rejected' | 'duplicate'
  title           VARCHAR NOT NULL
  description     TEXT
  urgency         VARCHAR DEFAULT 'medium' — 'low' | 'medium' | 'high' | 'critical'
  requester_name  VARCHAR
  requester_contact VARCHAR (email or phone, optional)
  photos          JSONB[] — [{filename, url}]
  location        VARCHAR (nullable)
  reviewed_by     UUID FK → users (nullable)
  reviewed_at     TIMESTAMPTZ (nullable)
  review_notes    TEXT (nullable)
  work_order_id   UUID FK → maintenance_work_orders (nullable — set on approval)
  created_at      TIMESTAMPTZ
```

**RLS**: Enable with tenant_id policy.

### API Endpoints

```
# Public (no auth)
POST   /api/requests/{tenant_slug}
         Body: {title, description?, urgency, machine_id?, 
                requester_name?, requester_contact?, photos?}
GET    /api/requests/{tenant_slug}/{request_id}/status
         → {status, created_at, reviewed_at} (requester can check status)

# Authenticated (manager+)
GET    /api/requests
         ?status=new&limit=50
POST   /api/requests/{request_id}/approve
         → Creates work order, links it, sets status=approved
POST   /api/requests/{request_id}/reject
         Body: {reason}
POST   /api/requests/{request_id}/duplicate
         Body: {existing_work_order_id}
```

### Frontend: Request Form

**Route**: `/request/[tenant_slug]/page.tsx` — OUTSIDE the dashboard layout. No sidebar, no auth.

**Design**: Large, simple, touch-friendly:

```
┌──────────────────────────────────────┐
│  🏭 FactoryBrain                     │
│  Report a Maintenance Issue          │
│                                      │
│  What's the problem? *               │
│  ┌──────────────────────────────┐   │
│  │ Describe the issue...         │   │
│  └──────────────────────────────┘   │
│                                      │
│  Which machine? (if known)           │
│  ┌──────────────────────────────┐   │
│  │ ▼ Select or search...        │   │
│  └──────────────────────────────┘   │
│  Pre-filled if scanned via QR        │
│                                      │
│  How urgent?                         │
│  [ Low ] [ Medium ] [ High ] [DOWN!] │
│                                      │
│  Add photo (optional)                │
│  ┌─────────┐                        │
│  │ 📷 Take │  or drag & drop        │
│  │  Photo  │                        │
│  └─────────┘                        │
│                                      │
│  Your name (optional)                │
│  ┌──────────────────────────────┐   │
│  │                               │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │       Submit Request          │   │
│  └──────────────────────────────┘   │
│                                      │
│  After submitting you'll get a       │
│  tracking link to check status.      │
└──────────────────────────────────────┘
```

### Frontend: Request Review (Admin/Manager)

Add a "Requests" tab to the Maintenance page, or a badge counter in the sidebar:

```
Requests (3 new)

┌──────────────────────────────────────────────┐
│ ⚡ HIGH — Hydraulic leak on Press #2          │
│ From: Jan (operator) • 12 min ago            │
│ 📷 1 photo                                    │
│                                              │
│ [✓ Approve → Create WO] [✗ Reject] [🔗 Link]│
└──────────────────────────────────────────────┘
```

---

## Implementation Order

This is critical. Features build on each other:

```
Week 1:
  Day 1-2: Work Order Events model + API + activity feed component
  Day 3:   Time tracking model + API + timer widget + Zustand store
  Day 4:   QR scanning + quick action sheet + label printing for machines
  Day 5:   Integrate timer mini-bar + activity feed into WO detail page

Week 2:
  Day 1-2: PWA upgrade (Serwist, caching, install prompt)
  Day 3:   Push notification foundation (VAPID, subscriptions, backend triggers)
  Day 4:   Work request portal (public form + admin review panel)
  Day 5:   Polish, test all flows on mobile, fix edge cases
```

### Dependencies Between Features

```
Activity Feed ──→ Time Tracking (logs to feed)
                ──→ QR "Report Issue" (creates request with events)
                ──→ Request Portal (approval creates event)
                
QR Scanning ────→ Quick Actions (needs machine data)
             ──→ Request Portal (pre-fills machine)

PWA / Caching ──→ Push Notifications (requires service worker)
              ──→ Offline timer persistence (localStorage + SW)

Timer ──────────→ Activity Feed (start/stop events)
             ──→ WO completion (auto-stop)
```

---

## New Files to Create

### Backend
```
core/models/work_order_event.py    — WorkOrderEvent model
core/models/time_entry.py          — TimeEntry model
core/models/work_request.py        — WorkRequest model
core/models/push_subscription.py   — PushSubscription model
core/schemas/work_order_event.py   — Event schemas
core/schemas/time_entry.py         — Time entry schemas
core/schemas/work_request.py       — Request schemas
core/services/event_service.py     — Create/list events, auto-event hooks
core/services/time_service.py      — Timer start/pause/stop/manual
core/services/request_service.py   — Request CRUD + approval workflow
core/services/notification_service.py — Push notification sender
core/api/requests.py               — Public request endpoints
```

### Frontend
```
src/app/dashboard/scan/page.tsx           — QR scanner page
src/app/request/[slug]/page.tsx           — Public request form
src/app/request/[slug]/[id]/page.tsx      — Request status tracker
src/components/dashboard/activity-feed.tsx — Unified event timeline
src/components/dashboard/timer-widget.tsx  — Full timer on WO page
src/components/dashboard/timer-bar.tsx     — Persistent mini-bar
src/components/dashboard/qr-actions.tsx    — Quick action bottom sheet
src/components/dashboard/qr-label.tsx      — Printable QR label
src/components/dashboard/request-form.tsx  — Reusable request form
src/store/timer.ts                         — Timer Zustand store
src/store/notifications.ts                 — Push notification store
src/hooks/useTimer.ts                      — Timer hook with interval
src/hooks/useOnlineStatus.ts               — Network connectivity hook
```

### Config Changes
```
frontend/package.json          — Add: @serwist/next, serwist, 
                                      @yudiel/react-qr-scanner,
                                      browser-image-compression
backend/pyproject.toml         — Add: pywebpush
frontend/next.config.js        — Serwist integration
frontend/public/sw.js          — Replace with Serwist-managed SW
```

---

## Database Migrations Needed

```sql
-- 1. work_order_events
CREATE TABLE work_order_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  event_type VARCHAR NOT NULL,
  content TEXT,
  metadata JSONB DEFAULT '{}',
  mentions UUID[] DEFAULT '{}',
  attachments JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_wo_events_wo ON work_order_events(work_order_id);
CREATE INDEX idx_wo_events_tenant ON work_order_events(tenant_id);
ALTER TABLE work_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_wo_events ON work_order_events 
  USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- 2. time_entries
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  work_order_id UUID NOT NULL REFERENCES maintenance_work_orders(id),
  user_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL,
  paused_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  category VARCHAR DEFAULT 'wrench',
  duration_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_time_wo ON time_entries(work_order_id);
CREATE INDEX idx_time_user ON time_entries(user_id);
CREATE INDEX idx_time_tenant ON time_entries(tenant_id);
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_time_entries ON time_entries 
  USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- 3. work_requests
CREATE TABLE work_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  machine_id UUID REFERENCES machines(id),
  status VARCHAR DEFAULT 'new',
  title VARCHAR NOT NULL,
  description TEXT,
  urgency VARCHAR DEFAULT 'medium',
  requester_name VARCHAR,
  requester_contact VARCHAR,
  photos JSONB DEFAULT '[]',
  location VARCHAR,
  reviewed_by UUID REFERENCES users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  work_order_id UUID REFERENCES maintenance_work_orders(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_requests_tenant ON work_requests(tenant_id);
CREATE INDEX idx_requests_status ON work_requests(status);
ALTER TABLE work_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_requests ON work_requests 
  USING (tenant_id = current_setting('app.current_tenant', true)::UUID);

-- 4. push_subscriptions
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  endpoint TEXT NOT NULL,
  p256dh_key TEXT NOT NULL,
  auth_key TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, endpoint)
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
```

---

## Recommended Learning Resources

For anyone working on this codebase:

### PWA & Offline
- **"Going Offline" by Jeremy Keith** (A Book Apart) — Best concise guide on service worker patterns
- **web.dev/learn/pwa** — Google's official PWA learning path (free)
- **Serwist docs**: https://serwist.pages.dev/

### Industrial UX
- **"Don't Make Me Think" by Steve Krug** — Still the gold standard for "< 3 taps" thinking
- **Nielsen Norman Group articles on industrial/field worker UX** — Search nngroup.com for "mobile field workers"

### CMMS Domain
- **"Maintenance Best Practices" by Ramesh Gulati** — Bible for understanding what maintenance teams actually need
- **ISO 14224** — Petroleum/petrochemical industries standard for failure data collection (the failure code taxonomy standard)

---

## Success Metrics

How to know Phase 1 worked:

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Daily active mobile users | > 60% of technicians | PWA analytics |
| Time to create WO from scan | < 30 seconds | Time tracking on scan → WO create flow |
| Comments per work order | > 2 average | Event count where type=comment |
| Timer usage rate | > 50% of closed WOs | WOs with time_entries vs total closed |
| Work requests submitted | > 5/week per site | Request count |
| Request approval time | < 2 hours | Time between request creation and review |

---

## What This Enables for Phase 2

Phase 1 creates the foundation:

- **Activity feed → Audit trail** (Phase 2): Events already capture all mutations
- **Time tracking → MTTR calculation** (Phase 2): Timer data feeds KPI dashboard
- **Activity feed → AI knowledge capture** (Phase 3): Historical WO events become training data
- **Request portal → Planned vs unplanned ratio** (Phase 2): Requests vs PM-generated WOs
- **Push notifications → Alert escalation** (Phase 2): Foundation already sends notifications
- **QR scanning → Asset hierarchy navigation** (Phase 2): Scan parent or child component
