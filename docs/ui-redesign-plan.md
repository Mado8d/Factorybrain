# FactoryBrain — UI Redesign Plan (Coolify-inspired)

## What Makes Coolify's UI Great

1. **Dark theme** — professional, modern, easy on the eyes for monitoring dashboards
2. **Dense but clean layout** — lots of info without feeling cluttered
3. **Consistent card design** — rounded corners, subtle borders, consistent padding
4. **Color-coded status indicators** — green/yellow/red dots, colored badges
5. **Sidebar navigation** — clean icons, active state highlighting, collapsible
6. **Monospace fonts for technical data** — container names, IDs, timestamps
7. **Real-time feedback** — deployment logs streaming, status updates
8. **Tabs for sub-navigation** — Configuration/Deployments/Logs/Terminal
9. **Action buttons with clear hierarchy** — primary (purple), danger (red), neutral (gray)
10. **Toast notifications** — success/error feedback without blocking the UI

---

## What We Should Change in FactoryBrain

### Phase 1: Dark Theme + Layout (biggest visual impact)

**Current**: Light gray background, white cards
**Target**: Dark background (#0a0a0a), dark cards (#1a1a2e), subtle borders

| Change | Current | Target |
|--------|---------|--------|
| Background | `bg-gray-50` (#f9fafb) | `bg-[#0a0a0a]` |
| Cards | `bg-white border` | `bg-[#1a1a2e] border-gray-800` |
| Text primary | `text-gray-900` | `text-gray-100` |
| Text secondary | `text-gray-500` | `text-gray-400` |
| Sidebar | `bg-white border-r` | `bg-[#111] border-gray-800` |
| Brand color | `#185FA5` (blue) | Keep blue or switch to purple like Coolify |
| Input fields | White bg, gray border | `bg-[#1a1a2e] border-gray-700` |

**Files to change**:
- `frontend/src/app/globals.css` — update CSS variables for dark mode
- `frontend/tailwind.config.js` — update color palette
- All page files — swap `bg-gray-50`/`bg-white` classes

**Effort**: Medium (2-3 hours) — mostly find-and-replace of Tailwind classes

### Phase 2: Component Library Upgrade

**Current**: Raw Tailwind classes everywhere, no reusable components
**Target**: Consistent component library like Coolify uses

**New components to create** (`src/components/ui/`):
| Component | Purpose | Coolify equivalent |
|-----------|---------|-------------------|
| `Card` | Container with consistent styling | Dark card with subtle border |
| `Badge` | Status indicators (Running, Stopped, etc.) | Colored pills with dots |
| `Button` | Primary/secondary/danger variants | Purple primary, red danger |
| `Input` | Dark-themed form inputs | Dark bg, subtle border |
| `Tabs` | Sub-navigation within pages | Configuration/Logs/Terminal tabs |
| `Table` | Data tables with sorting | Server list, deployment list |
| `StatusDot` | Animated green/red dot | Live status indicators |
| `Toast` | Success/error notifications | Bottom-right notifications |
| `Modal` | Confirmation dialogs | Delete confirmation, settings |
| `Tooltip` | Info icons with hover text | (i) icons throughout Coolify |
| `CodeBlock` | Monospace text display | Log output, config display |
| `Dropdown` | Action menus | "Advanced" dropdown |

**Implementation**: Use `shadcn/ui` (already in our dependencies) with custom dark theme. Run:
```bash
npx shadcn-ui@latest init
npx shadcn-ui@latest add button card badge input tabs table dialog tooltip
```
Then customize the theme to match Coolify's dark aesthetic.

**Effort**: Medium-High (4-6 hours)

### Phase 3: Dashboard Redesign

**Current**: KPI cards + chart grid + machine grid (all stacked vertically)
**Target**: More like Coolify's dense, information-rich layout

**Changes**:
1. **Sticky header bar** — app name + current page + user avatar + notifications bell
2. **Collapsible sidebar** — icon-only mode for more screen space
3. **KPI cards redesigned** — smaller, denser, with sparkline mini-charts
4. **Machine cards redesigned** — horizontal list instead of grid, with status dot + mini metrics
5. **Real-time activity feed** — sidebar panel showing latest events (like Coolify's deployment log)
6. **Quick actions** — floating action button or command palette (Ctrl+K)

**Effort**: High (6-10 hours)

### Phase 4: Page-Specific Improvements

#### Machines Page
- **Current**: Simple table
- **Target**: Cards with live status dots (like Coolify's server list), click to expand with tabs (Info/Telemetry/Alerts/History)

#### Machine Detail Page
- **Current**: Info cards + charts
- **Target**: Tab layout like Coolify's app config (Configuration/Deployments/Logs/Terminal)
  - **Overview tab**: KPIs + live status
  - **Telemetry tab**: Charts with date range picker
  - **Alerts tab**: Alert history for this machine
  - **Settings tab**: Machine config, thresholds, sensor assignments

#### Maintenance Page
- **Current**: Two tabs (alerts/work orders)
- **Target**: Coolify-style list with status badges, expandable rows, quick actions

#### Settings Page
- **Current**: Stacked sections
- **Target**: Left sidebar navigation within settings (like Coolify's General/Advanced/Environment Variables)

#### Login Page
- **Current**: Centered card on light gray
- **Target**: Full-screen dark background with centered card, subtle gradient or pattern

**Effort**: High (8-12 hours)

### Phase 5: Micro-Interactions & Polish

1. **Loading skeletons** — shimmer animation instead of spinner (like Coolify)
2. **Page transitions** — subtle fade/slide animations between pages
3. **Hover states** — consistent hover effects on all interactive elements
4. **Keyboard shortcuts** — Ctrl+K command palette, Escape to close modals
5. **Responsive improvements** — mobile hamburger menu, touch-friendly buttons
6. **Favicon + meta** — proper OG tags for link previews, PWA manifest
7. **Sound effects** — optional alert sound for critical notifications

**Effort**: Medium (4-6 hours)

---

## Implementation Priority

```
HIGH IMPACT, LOW EFFORT (do first):
├── Dark theme (globals.css + tailwind.config)
├── Login page dark redesign
└── Badge/StatusDot components

HIGH IMPACT, MEDIUM EFFORT (do second):
├── shadcn/ui component library setup
├── Card/Button/Input components
├── Collapsible sidebar
└── Dashboard KPI redesign

MEDIUM IMPACT, HIGH EFFORT (do later):
├── Machine detail page with tabs
├── Real-time activity feed
├── Settings page with sub-navigation
└── Maintenance page redesign

NICE TO HAVE (future):
├── Command palette (Ctrl+K)
├── Loading skeletons
├── Page transitions
└── PWA manifest
```

---

## Design Tokens (Coolify-inspired palette)

```css
:root {
  /* Backgrounds */
  --bg-primary: #0a0a0a;
  --bg-secondary: #111111;
  --bg-card: #1a1a2e;
  --bg-card-hover: #222240;
  --bg-input: #1a1a2e;
  
  /* Borders */
  --border-default: #2a2a3e;
  --border-hover: #3a3a5e;
  
  /* Text */
  --text-primary: #e4e4e7;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  
  /* Brand */
  --brand-primary: #7c3aed;     /* Purple like Coolify */
  --brand-primary-hover: #6d28d9;
  
  /* Status */
  --status-running: #22c55e;
  --status-warning: #f59e0b;
  --status-error: #ef4444;
  --status-idle: #6b7280;
  
  /* Accents */
  --accent-blue: #3b82f6;
  --accent-purple: #8b5cf6;
  --accent-green: #22c55e;
}
```

---

## Estimated Total Effort

| Phase | Hours | Priority |
|-------|-------|----------|
| Phase 1: Dark Theme | 2-3h | NOW |
| Phase 2: Component Library | 4-6h | NEXT |
| Phase 3: Dashboard Redesign | 6-10h | LATER |
| Phase 4: Page Improvements | 8-12h | LATER |
| Phase 5: Polish | 4-6h | FUTURE |
| **Total** | **24-37h** | |

We can do Phase 1 + 2 in one session and it will transform the look completely.
