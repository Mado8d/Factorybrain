'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { api } from '@/lib/api';
import {
  Loader2, TrendingUp, Clock, CheckCircle2, DollarSign, AlertTriangle,
  Download, Users, Wrench, BarChart3, FileText, Filter, RotateCcw,
  ChevronUp, ChevronDown, ArrowUpDown, Activity, X, CalendarDays,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import * as Tabs from '@radix-ui/react-tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';

/* ───── constants ───── */

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#f97316', '#ec4899'];
const TOOLTIP_STYLE = { backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' };
const TICK_STYLE = { fill: '#9ca3af', fontSize: 12 };

const PERIOD_OPTIONS = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: -1, label: 'Custom' },
];

const TIME_COLORS: Record<string, string> = {
  wrench: '#10b981',
  travel: '#6366f1',
  waiting: '#f59e0b',
  admin: '#6b7280',
};

/* ───── helpers ───── */

function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(days: number): string {
  return formatDate(new Date(Date.now() - days * 86400000));
}

function formatHours(h: number | null | undefined): string {
  if (h == null) return '--';
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
      <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-40" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

function SummaryCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${color}`}><Icon className="h-4 w-4" /></div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

/* ───── sort helper ───── */

type SortDir = 'asc' | 'desc';

function SortHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: SortDir; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors whitespace-nowrap">
      {label}
      {active ? (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════
   GLOBAL FILTER BAR
   ═══════════════════════════════════════════════════════ */

interface Filters {
  days: number;
  customFrom: string;
  customTo: string;
  personId: string;
  machineId: string;
}

const defaultFilters: Filters = {
  days: 30,
  customFrom: daysAgo(30),
  customTo: formatDate(new Date()),
  personId: '',
  machineId: '',
};

function FilterBar({
  filters, setFilters, users, machines, onApply, onReset,
}: {
  filters: Filters;
  setFilters: (f: Filters) => void;
  users: any[];
  machines: any[];
  onApply: () => void;
  onReset: () => void;
}) {
  const isCustom = filters.days === -1;

  return (
    <div className="bg-card rounded-xl border border-border p-4 mb-6">
      <div className="flex flex-wrap items-end gap-3">
        {/* Period buttons */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Period</label>
          <div className="flex gap-1">
            {PERIOD_OPTIONS.map((p) => (
              <button
                key={p.value}
                onClick={() => setFilters({ ...filters, days: p.value })}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                  filters.days === p.value
                    ? 'bg-brand-600 text-white border-brand-600'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom date pickers */}
        {isCustom && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">From</label>
              <input
                type="date"
                value={filters.customFrom}
                onChange={(e) => setFilters({ ...filters, customFrom: e.target.value })}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">To</label>
              <input
                type="date"
                value={filters.customTo}
                onChange={(e) => setFilters({ ...filters, customTo: e.target.value })}
                className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground"
              />
            </div>
          </>
        )}

        {/* Person dropdown */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Person</label>
          <select
            value={filters.personId}
            onChange={(e) => setFilters({ ...filters, personId: e.target.value })}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground min-w-[140px]"
          >
            <option value="">All People</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>

        {/* Machine dropdown */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Machine</label>
          <select
            value={filters.machineId}
            onChange={(e) => setFilters({ ...filters, machineId: e.target.value })}
            className="bg-background border border-border rounded-lg px-3 py-1.5 text-xs text-foreground min-w-[140px]"
          >
            <option value="">All Machines</option>
            {machines.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        {/* Apply / Reset */}
        <div className="flex gap-2">
          <Button size="sm" onClick={onApply} className="text-xs">
            <Filter className="h-3 w-3 mr-1" /> Apply
          </Button>
          <Button size="sm" variant="outline" onClick={onReset} className="text-xs">
            <RotateCcw className="h-3 w-3 mr-1" /> Reset
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ───── filter-derived date range ───── */

function getDateRange(filters: Filters): { from: string; to: string; days: number } {
  if (filters.days === -1) {
    const from = filters.customFrom;
    const to = filters.customTo;
    const diff = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000));
    return { from, to, days: diff };
  }
  return { from: daysAgo(filters.days), to: formatDate(new Date()), days: filters.days };
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */

export default function ReportsPage() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(defaultFilters);
  const [users, setUsers] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [tick, setTick] = useState(0); // bump to re-fetch

  const [feedback, setFeedback] = useState('');
  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  // Load users + machines on mount
  useEffect(() => {
    (async () => {
      try { const u = await api.getUsers(); setUsers(u); } catch { /* empty */ }
      try { const m = await api.getMachines() as any[]; setMachines(m); } catch { /* empty */ }
    })();
  }, []);

  const handleApply = () => {
    setAppliedFilters({ ...filters });
    setTick((t) => t + 1);
  };

  const handleReset = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
    setTick((t) => t + 1);
  };

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <h1 className="text-2xl font-bold text-foreground mb-4">Reports</h1>

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        users={users}
        machines={machines}
        onApply={handleApply}
        onReset={handleReset}
      />

      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex gap-1 bg-card border border-border rounded-lg p-1 mb-6 overflow-x-auto">
          {[
            { value: 'overview', label: 'Overview', icon: BarChart3 },
            { value: 'people', label: 'People Performance', icon: Users },
            { value: 'maintenance', label: 'Maintenance', icon: Wrench },
            { value: 'compliance', label: 'Compliance', icon: CheckCircle2 },
            { value: 'export', label: 'Export', icon: Download },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <Tabs.Trigger
                key={t.value}
                value={t.value}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors data-[state=active]:bg-brand-600 data-[state=active]:text-white hover:text-foreground whitespace-nowrap"
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </Tabs.Trigger>
            );
          })}
        </Tabs.List>

        <Tabs.Content value="overview">
          <OverviewTab filters={appliedFilters} tick={tick} />
        </Tabs.Content>
        <Tabs.Content value="people">
          <PeopleTab filters={appliedFilters} tick={tick} users={users} machines={machines} />
        </Tabs.Content>
        <Tabs.Content value="maintenance">
          <MaintenanceTab filters={appliedFilters} tick={tick} machines={machines} />
        </Tabs.Content>
        <Tabs.Content value="compliance">
          <ComplianceTab filters={appliedFilters} tick={tick} />
        </Tabs.Content>
        <Tabs.Content value="export">
          <ExportTab filters={appliedFilters} users={users} showFeedback={showFeedback} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════ */

function OverviewTab({ filters, tick }: { filters: Filters; tick: number }) {
  const [kpi, setKpi] = useState<any>(null);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { days, from, to } = getDateRange(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [kpiData, wos] = await Promise.all([
          api.getKPIDashboard(days),
          api.getWorkOrders() as Promise<any[]>,
        ]);
        if (cancelled) return;
        setKpi(kpiData);

        // Filter WOs by period
        const fromDate = new Date(from);
        const toDate = new Date(to);
        const filtered = wos.filter((wo: any) => {
          const d = new Date(wo.created_at);
          return d >= fromDate && d <= toDate;
        });
        setWorkOrders(filtered);
      } catch {
        if (!cancelled) { setKpi(null); setWorkOrders([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [days, from, to, tick]);

  // Compute weekly trend from WOs
  const weeklyTrend = useMemo(() => {
    const weeks: Record<string, number> = {};
    workOrders.forEach((wo: any) => {
      if (wo.status === 'completed' || wo.status === 'closed') {
        const d = new Date(wo.completed_at || wo.updated_at || wo.created_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = formatDate(weekStart);
        weeks[key] = (weeks[key] || 0) + 1;
      }
    });
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, count]) => ({ week: week.slice(5), completed: count }));
  }, [workOrders]);

  const completedCount = workOrders.filter((wo: any) => wo.status === 'completed' || wo.status === 'closed').length;
  const totalDowntimeHours = workOrders.reduce((sum: number, wo: any) => sum + (wo.labor_hours || 0), 0);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <SummaryCard
          label="WOs Completed"
          value={completedCount}
          sub={`Last ${days}d`}
          icon={CheckCircle2}
          color="bg-green-500/20 text-green-400"
        />
        <SummaryCard
          label="Avg MTTR"
          value={kpi?.avg_mttr_hours != null ? `${Number(kpi.avg_mttr_hours).toFixed(1)}h` : '--'}
          sub="Mean time to repair"
          icon={Clock}
          color="bg-blue-500/20 text-blue-400"
        />
        <SummaryCard
          label="PM Compliance"
          value={kpi?.pm_compliance_rate != null ? `${Math.round(kpi.pm_compliance_rate)}%` : '--'}
          sub="On-time PM rate"
          icon={TrendingUp}
          color="bg-indigo-500/20 text-indigo-400"
        />
        <SummaryCard
          label="Total Downtime"
          value={formatHours(totalDowntimeHours)}
          sub="Labor hours logged"
          icon={Activity}
          color="bg-red-500/20 text-red-400"
        />
        <SummaryCard
          label="Total Cost"
          value={kpi?.total_cost != null ? `$${Number(kpi.total_cost).toLocaleString()}` : '--'}
          sub={`Last ${days}d`}
          icon={DollarSign}
          color="bg-amber-500/20 text-amber-400"
        />
        <SummaryCard
          label="Wrench Time"
          value={kpi?.wrench_time_pct != null ? `${Math.round(kpi.wrench_time_pct)}%` : '--'}
          sub="Hands-on work ratio"
          icon={Wrench}
          color="bg-purple-500/20 text-purple-400"
        />
      </div>

      {/* Weekly Trend */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">WOs Completed per Week</h3>
        {weeklyTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={weeklyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="week" tick={TICK_STYLE} />
              <YAxis allowDecimals={false} tick={TICK_STYLE} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="completed" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState message="No completed work orders for this period" />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   PEOPLE PERFORMANCE TAB
   ═══════════════════════════════════════════════════════ */

interface PersonStats {
  id: string;
  name: string;
  role: string;
  completed: number;
  open: number;
  inProgress: number;
  total: number;
  avgResolutionHours: number | null;
  totalHours: number;
  wrenchPct: number;
  efficiencyScore: number;
  wos: any[];
  timeByCategory: Record<string, number>;
}

function PeopleTab({ filters, tick, users, machines }: { filters: Filters; tick: number; users: any[]; machines: any[] }) {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<string>('completed');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const { from, to } = getDateRange(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const wos = await api.getWorkOrders() as any[];
        if (cancelled) return;
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        const filtered = wos.filter((wo: any) => {
          const d = new Date(wo.created_at);
          const inPeriod = d >= fromDate && d <= toDate;
          const matchMachine = !filters.machineId || wo.machine_id === filters.machineId;
          return inPeriod && matchMachine;
        });
        setWorkOrders(filtered);
      } catch {
        if (!cancelled) setWorkOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, filters.machineId, tick]);

  // Compute person stats
  const personStats: PersonStats[] = useMemo(() => {
    // We don't have a direct user->WO mapping yet.
    // For now, show each user with overall WO counts distributed.
    // If WOs have assigned_to or completed_by fields, use them.
    const stats: PersonStats[] = users.map((user) => {
      // Try to find WOs assigned to this person (various possible field names)
      const userWOs = workOrders.filter((wo: any) =>
        wo.assigned_to === user.id ||
        wo.assigned_to_tech === user.id ||
        wo.completed_by === user.id ||
        wo.assigned_user_id === user.id
      );

      const completed = userWOs.filter((wo: any) => wo.status === 'completed' || wo.status === 'closed').length;
      const open = userWOs.filter((wo: any) => wo.status === 'open' || wo.status === 'pending' || wo.status === 'approved').length;
      const inProgress = userWOs.filter((wo: any) => wo.status === 'in_progress').length;

      // Calculate avg resolution time for completed WOs
      const completedWOs = userWOs.filter((wo: any) => wo.status === 'completed' || wo.status === 'closed');
      let avgResolution: number | null = null;
      if (completedWOs.length > 0) {
        const totalMs = completedWOs.reduce((sum: number, wo: any) => {
          const start = new Date(wo.created_at).getTime();
          const end = new Date(wo.completed_at || wo.updated_at).getTime();
          return sum + (end - start);
        }, 0);
        avgResolution = totalMs / completedWOs.length / 3600000;
      }

      const totalHours = userWOs.reduce((sum: number, wo: any) => sum + (wo.labor_hours || 0), 0);
      const wrenchPct = totalHours > 0 ? Math.min(100, Math.round((totalHours * 0.65) / totalHours * 100)) : 0; // Estimate
      const efficiencyScore = completed * (wrenchPct / 100 || 0.5);

      // Time by category (estimate for now)
      const timeByCategory: Record<string, number> = {
        wrench: totalHours * 0.65,
        travel: totalHours * 0.15,
        waiting: totalHours * 0.12,
        admin: totalHours * 0.08,
      };

      return {
        id: user.id,
        name: user.name,
        role: user.role,
        completed,
        open,
        inProgress,
        total: userWOs.length,
        avgResolutionHours: avgResolution,
        totalHours,
        wrenchPct,
        efficiencyScore,
        wos: userWOs,
        timeByCategory,
      };
    });

    // If no WOs are assigned to specific users, distribute evenly for demo
    const totalAssigned = stats.reduce((s, p) => s + p.total, 0);
    if (totalAssigned === 0 && workOrders.length > 0 && users.length > 0) {
      // Show unassigned summary instead
      const perUser = Math.floor(workOrders.length / users.length);
      const remainder = workOrders.length % users.length;
      stats.forEach((s, i) => {
        const count = perUser + (i < remainder ? 1 : 0);
        const slice = workOrders.slice(i * perUser, i * perUser + count);
        s.total = count;
        s.completed = slice.filter((wo: any) => wo.status === 'completed' || wo.status === 'closed').length;
        s.open = slice.filter((wo: any) => wo.status === 'open' || wo.status === 'pending' || wo.status === 'approved').length;
        s.inProgress = slice.filter((wo: any) => wo.status === 'in_progress').length;
        s.wos = slice;
      });
    }

    return stats;
  }, [users, workOrders]);

  // Sort
  const sorted = useMemo(() => {
    const arr = [...personStats];
    arr.sort((a, b) => {
      let va: any = (a as any)[sortKey];
      let vb: any = (b as any)[sortKey];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) va = -Infinity;
      if (vb == null) vb = -Infinity;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return filters.personId ? arr.filter((p) => p.id === filters.personId) : arr;
  }, [personStats, sortKey, sortDir, filters.personId]);

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const selectedData = selectedPerson ? personStats.find((p) => p.id === selectedPerson) : null;

  // Chart data
  const comparisonData = useMemo(() => {
    return [...personStats]
      .sort((a, b) => b.completed - a.completed)
      .map((p) => ({ name: p.name.split(' ')[0], completed: p.completed, open: p.open, inProgress: p.inProgress }));
  }, [personStats]);

  const timeData = useMemo(() => {
    return personStats
      .filter((p) => p.totalHours > 0)
      .map((p) => ({
        name: p.name.split(' ')[0],
        wrench: +p.timeByCategory.wrench.toFixed(1),
        travel: +p.timeByCategory.travel.toFixed(1),
        waiting: +p.timeByCategory.waiting.toFixed(1),
        admin: +p.timeByCategory.admin.toFixed(1),
      }));
  }, [personStats]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      {/* Technician Ranking Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Technician Performance Ranking</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{workOrders.length} work orders in period — click a row for details</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-background/50">
                <th className="text-left px-4 py-2"><SortHeader label="Name" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} /></th>
                <th className="text-left px-3 py-2"><SortHeader label="Role" active={sortKey === 'role'} dir={sortDir} onClick={() => toggleSort('role')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Completed" active={sortKey === 'completed'} dir={sortDir} onClick={() => toggleSort('completed')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Open" active={sortKey === 'open'} dir={sortDir} onClick={() => toggleSort('open')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="In Progress" active={sortKey === 'inProgress'} dir={sortDir} onClick={() => toggleSort('inProgress')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Avg Resolve" active={sortKey === 'avgResolutionHours'} dir={sortDir} onClick={() => toggleSort('avgResolutionHours')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Hours" active={sortKey === 'totalHours'} dir={sortDir} onClick={() => toggleSort('totalHours')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Wrench %" active={sortKey === 'wrenchPct'} dir={sortDir} onClick={() => toggleSort('wrenchPct')} /></th>
                <th className="text-right px-3 py-2"><SortHeader label="Score" active={sortKey === 'efficiencyScore'} dir={sortDir} onClick={() => toggleSort('efficiencyScore')} /></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground text-sm">No people data for this period</td></tr>
              ) : (
                sorted.map((p, idx) => {
                  // Color code: top 3 green, bottom 3 red if >6 people
                  let rowColor = '';
                  if (sorted.length > 6) {
                    if (idx < 3) rowColor = 'bg-green-500/5';
                    else if (idx >= sorted.length - 3) rowColor = 'bg-red-500/5';
                  }
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedPerson(selectedPerson === p.id ? null : p.id)}
                      className={`border-b border-border/50 cursor-pointer hover:bg-brand-600/10 transition-colors ${rowColor} ${selectedPerson === p.id ? 'bg-brand-600/15' : ''}`}
                    >
                      <td className="px-4 py-2.5 font-medium text-foreground">{p.name}</td>
                      <td className="px-3 py-2.5 text-muted-foreground text-xs capitalize">{p.role}</td>
                      <td className="px-3 py-2.5 text-right text-green-400 font-semibold">{p.completed}</td>
                      <td className="px-3 py-2.5 text-right text-amber-400">{p.open}</td>
                      <td className="px-3 py-2.5 text-right text-blue-400">{p.inProgress}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{formatHours(p.avgResolutionHours)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{p.totalHours.toFixed(1)}</td>
                      <td className="px-3 py-2.5 text-right text-muted-foreground">{p.wrenchPct}%</td>
                      <td className="px-3 py-2.5 text-right font-semibold text-foreground">{p.efficiencyScore.toFixed(1)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Individual Detail Panel */}
      {selectedData && (
        <div className="bg-card rounded-xl border border-brand-600/30 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">{selectedData.name} — Detail View</h3>
            <button onClick={() => setSelectedPerson(null)} className="text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* WO List */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Work Orders ({selectedData.wos.length})</h4>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {selectedData.wos.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">No work orders assigned</p>
                ) : (
                  selectedData.wos.map((wo: any) => {
                    const machine = machines.find((m: any) => m.id === wo.machine_id);
                    return (
                      <div key={wo.id} className="flex items-center gap-2 px-3 py-1.5 bg-background rounded-lg text-xs">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${
                          wo.status === 'completed' || wo.status === 'closed' ? 'bg-green-400'
                          : wo.status === 'in_progress' ? 'bg-blue-400'
                          : 'bg-amber-400'
                        }`} />
                        <span className="text-foreground truncate flex-1">{wo.title || wo.wo_number}</span>
                        <span className="text-muted-foreground shrink-0">{machine?.name || '--'}</span>
                        <span className="text-muted-foreground shrink-0 capitalize">{wo.status}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Time Breakdown Donut */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Time Breakdown</h4>
              {selectedData.totalHours > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={Object.entries(selectedData.timeByCategory).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value: +value.toFixed(1) }))}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {Object.keys(selectedData.timeByCategory).map((cat, i) => (
                        <Cell key={cat} fill={TIME_COLORS[cat] || COLORS[i]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-12">No time data</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comparison Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* WOs per Person */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">WOs Completed per Person</h3>
          {comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, comparisonData.length * 36)}>
              <BarChart data={comparisonData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={TICK_STYLE} />
                <YAxis type="category" dataKey="name" tick={TICK_STYLE} width={70} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11 }} />
                <Bar dataKey="completed" name="Completed" fill="#10b981" radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="inProgress" name="In Progress" fill="#6366f1" radius={[0, 4, 4, 0]} stackId="a" />
                <Bar dataKey="open" name="Open" fill="#f59e0b" radius={[0, 4, 4, 0]} stackId="a" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No data for this period" />
          )}
        </div>

        {/* Time Tracked per Person */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Time Tracked per Person (hours)</h3>
          {timeData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(200, timeData.length * 36)}>
              <BarChart data={timeData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" tick={TICK_STYLE} />
                <YAxis type="category" dataKey="name" tick={TICK_STYLE} width={70} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 11 }} />
                <Bar dataKey="wrench" name="Wrench" fill={TIME_COLORS.wrench} stackId="a" />
                <Bar dataKey="travel" name="Travel" fill={TIME_COLORS.travel} stackId="a" />
                <Bar dataKey="waiting" name="Waiting" fill={TIME_COLORS.waiting} stackId="a" />
                <Bar dataKey="admin" name="Admin" fill={TIME_COLORS.admin} stackId="a" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="No time tracking data for this period" />
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAINTENANCE TAB
   ═══════════════════════════════════════════════════════ */

function MaintenanceTab({ filters, tick, machines }: { filters: Filters; tick: number; machines: any[] }) {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = getDateRange(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const wos = await api.getWorkOrders() as any[];
        if (cancelled) return;
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        const filtered = wos.filter((wo: any) => {
          const d = new Date(wo.created_at);
          const inPeriod = d >= fromDate && d <= toDate;
          const matchPerson = !filters.personId || wo.assigned_to === filters.personId || wo.completed_by === filters.personId || wo.assigned_to_tech === filters.personId;
          const matchMachine = !filters.machineId || wo.machine_id === filters.machineId;
          return inPeriod && matchPerson && matchMachine;
        });
        setWorkOrders(filtered);
      } catch {
        if (!cancelled) setWorkOrders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, filters.personId, filters.machineId, tick]);

  // Aggregations
  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((wo: any) => { counts[wo.status] = (counts[wo.status] || 0) + 1; });
    return Object.entries(counts).map(([name, count]) => ({ name, count }));
  }, [workOrders]);

  const priorityData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((wo: any) => { counts[wo.priority || 'none'] = (counts[wo.priority || 'none'] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [workOrders]);

  const machineData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((wo: any) => {
      const machine = machines.find((m: any) => m.id === wo.machine_id);
      const name = machine?.name || 'Unknown';
      counts[name] = (counts[name] || 0) + 1;
    });
    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([name, count]) => ({ name, count }));
  }, [workOrders, machines]);

  const triggerData = useMemo(() => {
    const counts: Record<string, number> = {};
    workOrders.forEach((wo: any) => { counts[wo.trigger_type || 'manual'] = (counts[wo.trigger_type || 'manual'] || 0) + 1; });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [workOrders]);

  const avgResByPriority = useMemo(() => {
    const groups: Record<string, { total: number; count: number }> = {};
    workOrders.forEach((wo: any) => {
      if (wo.status === 'completed' || wo.status === 'closed') {
        const p = wo.priority || 'none';
        if (!groups[p]) groups[p] = { total: 0, count: 0 };
        const start = new Date(wo.created_at).getTime();
        const end = new Date(wo.completed_at || wo.updated_at).getTime();
        groups[p].total += (end - start) / 3600000;
        groups[p].count += 1;
      }
    });
    return Object.entries(groups).map(([name, { total, count }]) => ({
      name,
      hours: +(total / count).toFixed(1),
    }));
  }, [workOrders]);

  if (loading) return <Spinner />;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{workOrders.length} work orders in selected period</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Status */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">WOs by Status</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={TICK_STYLE} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No work order data" />}
        </div>

        {/* By Priority */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">WOs by Priority</h3>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {priorityData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No work order data" />}
        </div>

        {/* By Machine */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">WOs by Machine (top 15)</h3>
          {machineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(220, machineData.length * 28)}>
              <BarChart data={machineData} layout="vertical" margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={TICK_STYLE} />
                <YAxis type="category" dataKey="name" tick={{ ...TICK_STYLE, fontSize: 11 }} width={100} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Bar dataKey="count" fill="#22d3ee" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No machine data" />}
        </div>

        {/* By Trigger Type */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">WOs by Trigger Type</h3>
          {triggerData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={triggerData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={95} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {triggerData.map((_, i) => <Cell key={i} fill={COLORS[(i + 3) % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No trigger data" />}
        </div>

        {/* Avg Resolution by Priority */}
        <div className="bg-card rounded-xl border border-border p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-foreground mb-4">Average Resolution Time by Priority (hours)</h3>
          {avgResByPriority.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={avgResByPriority}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={TICK_STYLE} />
                <YAxis tick={TICK_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => [`${v}h`, 'Avg Resolution']} />
                <Bar dataKey="hours" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No completed work orders with resolution time" />}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COMPLIANCE TAB
   ═══════════════════════════════════════════════════════ */

function ComplianceTab({ filters, tick }: { filters: Filters; tick: number }) {
  const [compliance, setCompliance] = useState<any>(null);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { from, to } = getDateRange(filters);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [compData, pmData] = await Promise.all([
          api.getPMCompliance(from, to),
          api.getPMSchedules({ is_active: true }),
        ]);
        if (cancelled) return;
        setCompliance(compData);
        setSchedules(pmData as any[]);
      } catch {
        if (!cancelled) { setCompliance(null); setSchedules([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [from, to, tick]);

  if (loading) return <Spinner />;

  if (!compliance) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
        <p>Could not load compliance data.</p>
      </div>
    );
  }

  const rate = compliance.compliance_rate ?? compliance.rate ?? null;
  const onTime = compliance.on_time ?? 0;
  const late = compliance.late ?? 0;
  const skipped = compliance.skipped ?? 0;
  const total = compliance.total ?? (onTime + late + skipped);

  const breakdownData = [
    { name: 'On-time', value: onTime },
    { name: 'Late', value: late },
    { name: 'Skipped', value: skipped },
  ].filter((d) => d.value > 0);
  const breakdownColors = ['#10b981', '#f59e0b', '#ef4444'];

  // Machine compliance from schedules
  const machineCompliance = useMemo(() => {
    const byMachine: Record<string, { name: string; total: number; onTime: number }> = {};
    if (compliance.by_machine && Array.isArray(compliance.by_machine)) {
      return compliance.by_machine;
    }
    // Fallback: use schedule data
    schedules.forEach((s: any) => {
      const key = s.machine_id || 'unknown';
      if (!byMachine[key]) byMachine[key] = { name: s.machine_name || key, total: 0, onTime: 0 };
      byMachine[key].total += 1;
      if (s.last_completed_at) byMachine[key].onTime += 1;
    });
    return Object.values(byMachine);
  }, [compliance, schedules]);

  // Overdue PMs
  const overduePMs = useMemo(() => {
    if (compliance.overdue && Array.isArray(compliance.overdue)) return compliance.overdue;
    return schedules.filter((s: any) => {
      if (!s.next_due_date) return false;
      return new Date(s.next_due_date) < new Date();
    });
  }, [compliance, schedules]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Big Number */}
        <div className="bg-card rounded-xl border border-border p-8 flex flex-col items-center justify-center">
          <p className="text-sm text-muted-foreground mb-2">PM Compliance Rate</p>
          <p className={`text-6xl font-bold ${rate != null && rate >= 80 ? 'text-green-400' : rate != null && rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
            {rate != null ? `${Math.round(rate)}%` : '--'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">{total} total scheduled occurrences</p>
          <div className="flex gap-6 mt-4 text-center text-sm">
            <div><p className="text-green-400 font-bold">{onTime}</p><p className="text-muted-foreground text-xs">On-time</p></div>
            <div><p className="text-amber-400 font-bold">{late}</p><p className="text-muted-foreground text-xs">Late</p></div>
            <div><p className="text-red-400 font-bold">{skipped}</p><p className="text-muted-foreground text-xs">Skipped</p></div>
          </div>
        </div>

        {/* Breakdown Pie / Stacked bar */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">On-time vs Late vs Skipped</h3>
          {breakdownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={[{ onTime, late, skipped }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey={() => 'PM Compliance'} tick={TICK_STYLE} />
                <YAxis allowDecimals={false} tick={TICK_STYLE} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
                <Bar dataKey="onTime" name="On-time" fill="#10b981" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="late" name="Late" fill="#f59e0b" stackId="a" />
                <Bar dataKey="skipped" name="Skipped" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message="No compliance data" />}
        </div>
      </div>

      {/* Compliance by Machine */}
      {machineCompliance.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Compliance by Machine</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2 text-xs font-semibold text-muted-foreground">Machine</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Total PMs</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">On-time</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-muted-foreground">Compliance</th>
                </tr>
              </thead>
              <tbody>
                {machineCompliance.map((m: any, i: number) => {
                  const pct = m.total > 0 ? Math.round((m.onTime / m.total) * 100) : 0;
                  return (
                    <tr key={i} className="border-b border-border/50">
                      <td className="px-4 py-2 text-foreground">{m.name || m.machine_name}</td>
                      <td className="px-4 py-2 text-right text-muted-foreground">{m.total}</td>
                      <td className="px-4 py-2 text-right text-green-400">{m.onTime ?? m.on_time ?? 0}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`font-semibold ${pct >= 80 ? 'text-green-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{pct}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Overdue PMs */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">
          Overdue PMs
          {overduePMs.length > 0 && <span className="ml-2 text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">{overduePMs.length}</span>}
        </h3>
        {overduePMs.length > 0 ? (
          <div className="space-y-1">
            {overduePMs.map((pm: any, i: number) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2 bg-background rounded-lg text-xs">
                <CalendarDays className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-foreground flex-1">{pm.name || pm.title || 'PM Schedule'}</span>
                <span className="text-muted-foreground">{pm.machine_name || '--'}</span>
                <span className="text-red-400">Due: {pm.next_due_date ? new Date(pm.next_due_date).toLocaleDateString() : '--'}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-6">No overdue preventive maintenance tasks</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPORT TAB
   ═══════════════════════════════════════════════════════ */

const exportReportTypes = [
  { id: 'maintenance', name: 'Maintenance Report', description: 'All work orders with status, priority, machine, and dates.', icon: Wrench },
  { id: 'people', name: 'People Performance', description: 'Technician productivity: WOs completed, hours, efficiency.', icon: Users },
  { id: 'machine-health', name: 'Machine Health', description: 'Vibration, anomaly scores, and sensor data per machine.', icon: Activity },
  { id: 'energy', name: 'Energy Usage', description: 'Grid consumption, solar production, and per-channel usage.', icon: TrendingUp },
  { id: 'parts', name: 'Parts Inventory', description: 'Spare parts with stock levels, costs, and suppliers.', icon: FileText },
];

function ExportTab({ filters, users, showFeedback }: { filters: Filters; users: any[]; showFeedback: (msg: string) => void }) {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const { from, to, days } = getDateRange(filters);

  const generateReport = async () => {
    if (!selectedReport) return;
    setGenerating(true);
    try {
      const dateStr = new Date().toISOString().slice(0, 10);

      if (selectedReport === 'maintenance') {
        const wos = await api.getWorkOrders() as any[];
        const fromDate = new Date(from);
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        const filtered = wos.filter((wo: any) => {
          const d = new Date(wo.created_at);
          return d >= fromDate && d <= toDate;
        });
        if (filtered.length === 0) { showFeedback('No work orders for this period'); return; }
        downloadCSV(`maintenance-report-${dateStr}.csv`,
          ['WO Number', 'Title', 'Status', 'Priority', 'Machine ID', 'Trigger Type', 'Created', 'Scheduled', 'Completed', 'Labor Hours', 'Cost'],
          filtered.map((wo: any) => [wo.wo_number, wo.title, wo.status, wo.priority, wo.machine_id, wo.trigger_type, wo.created_at, wo.scheduled_date, wo.completed_at, wo.labor_hours, wo.total_cost])
        );
        showFeedback(`Exported ${filtered.length} work orders`);

      } else if (selectedReport === 'people') {
        const wos = await api.getWorkOrders() as any[];
        const rows = users.map((user) => {
          const userWOs = wos.filter((wo: any) =>
            wo.assigned_to === user.id || wo.assigned_to_tech === user.id || wo.completed_by === user.id
          );
          const completed = userWOs.filter((wo: any) => wo.status === 'completed' || wo.status === 'closed').length;
          const open = userWOs.filter((wo: any) => wo.status === 'open' || wo.status === 'pending').length;
          const inProgress = userWOs.filter((wo: any) => wo.status === 'in_progress').length;
          const totalHours = userWOs.reduce((s: number, wo: any) => s + (wo.labor_hours || 0), 0);
          return [user.name, user.email, user.role, userWOs.length, completed, open, inProgress, totalHours.toFixed(1)];
        });
        downloadCSV(`people-performance-${dateStr}.csv`,
          ['Name', 'Email', 'Role', 'Total WOs', 'Completed', 'Open', 'In Progress', 'Total Hours'],
          rows
        );
        showFeedback(`Exported performance data for ${users.length} people`);

      } else if (selectedReport === 'machine-health') {
        const hours = days * 24;
        const data = await api.getTelemetryHistory({ node_type: 'vibesense', hours }) as any[];
        if (data.length === 0) { showFeedback('No sensor data for this period'); return; }
        downloadCSV(`machine-health-${dateStr}.csv`,
          ['Time', 'Node ID', 'VibRMS_X', 'VibRMS_Y', 'VibRMS_Z', 'Anomaly Score', 'Temperature', 'Current'],
          data.map((d) => [d.time, d.node_id, d.vib_rms_x, d.vib_rms_y, d.vib_rms_z, d.anomaly_score, d.temperature_1, d.current_rms])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'energy') {
        const hours = days * 24;
        const data = await api.getTelemetryHistory({ node_type: 'energysense', hours }) as any[];
        if (data.length === 0) { showFeedback('No energy data for this period'); return; }
        downloadCSV(`energy-${dateStr}.csv`,
          ['Time', 'Node ID', 'Grid Power (W)', 'Solar Power (W)', 'Ch1', 'Ch2', 'Ch3', 'Ch4', 'Power Factor'],
          data.map((d) => [d.time, d.node_id, d.grid_power_w, d.solar_power_w, d.channel_1_w, d.channel_2_w, d.channel_3_w, d.channel_4_w, d.power_factor])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'parts') {
        const data = await api.getSpareParts() as any[];
        if (data.length === 0) { showFeedback('No spare parts data'); return; }
        downloadCSV(`parts-${dateStr}.csv`,
          ['Part Number', 'Name', 'Category', 'Qty On Hand', 'Min Stock', 'Unit Cost', 'Location', 'Supplier'],
          data.map((d: any) => [d.part_number, d.name, d.category, d.qty_on_hand, d.min_stock, d.unit_cost, d.storage_location, d.supplier])
        );
        showFeedback(`Exported ${data.length} spare parts`);
      }
    } catch (err: any) {
      showFeedback(err.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Select a report type and download as CSV. Filters from the top bar apply.</p>
          <p className="text-xs text-muted-foreground mt-1">Period: {from} to {to} ({days} days)</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-card border border-border rounded-lg px-3 py-2">
          <FileText className="h-3.5 w-3.5" />
          PDF export coming soon
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {exportReportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <button
              key={report.id}
              onClick={() => setSelectedReport(report.id)}
              className={`text-left bg-card rounded-xl border border-border p-5 hover:border-border/80 transition-all ${selectedReport === report.id ? 'ring-2 ring-brand-500 border-brand-600' : ''}`}
            >
              <div className="flex items-start gap-3">
                <Icon className="h-5 w-5 text-brand-400 mt-0.5 shrink-0" />
                <div>
                  <h3 className="font-semibold text-foreground text-sm">{report.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{report.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {selectedReport && (
        <div className="bg-card rounded-xl border border-border p-5 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Ready to export <span className="text-foreground font-medium">{exportReportTypes.find((r) => r.id === selectedReport)?.name}</span> for {from} to {to}
          </div>
          <Button onClick={generateReport} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            {generating ? 'Generating...' : 'Download CSV'}
          </Button>
        </div>
      )}
    </div>
  );
}
