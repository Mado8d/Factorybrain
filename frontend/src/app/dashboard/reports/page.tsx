'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import {
  Cog, Zap, Wrench, BarChart3, Download, Loader2, TrendingUp,
  Clock, CheckCircle2, DollarSign, AlertTriangle, FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import * as Tabs from '@radix-ui/react-tabs';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';

/* ───── helpers ───── */

const COLORS = ['#6366f1', '#22d3ee', '#f59e0b', '#ef4444', '#10b981', '#8b5cf6', '#f97316'];

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

function SummaryCard({ label, value, sub, icon: Icon, color }: { label: string; value: string | number; sub?: string; icon: any; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${color}`}><Icon className="h-5 w-5" /></div>
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

/* ───── report types for Export tab ───── */

const reportTypes = [
  { id: 'machine-health', name: 'Machine Health', description: 'Vibration, anomaly scores, and sensor data per machine.', icon: Cog },
  { id: 'energy', name: 'Energy Usage', description: 'Grid consumption, solar production, and per-channel usage.', icon: Zap },
  { id: 'maintenance', name: 'Maintenance History', description: 'All alerts and work orders with status and severity.', icon: Wrench },
  { id: 'oee', name: 'OEE', description: 'Machine availability calculated from energy sensor data.', icon: BarChart3 },
  { id: 'parts', name: 'Parts Usage', description: 'Spare parts inventory snapshot and usage history.', icon: FileText },
];

const exportPeriods = [
  { value: '6', label: 'Last 6 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '48', label: 'Last 48 hours' },
  { value: '168', label: 'Last 7 days' },
  { value: '720', label: 'Last 30 days' },
];

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════ */

export default function ReportsPage() {
  const [feedback, setFeedback] = useState('');
  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <h1 className="text-2xl font-bold text-foreground mb-6">Reports</h1>

      <Tabs.Root defaultValue="overview">
        <Tabs.List className="flex gap-1 bg-card border border-border rounded-lg p-1 mb-6">
          {[
            { value: 'overview', label: 'Overview' },
            { value: 'maintenance', label: 'Maintenance' },
            { value: 'energy', label: 'Energy' },
            { value: 'compliance', label: 'Compliance' },
            { value: 'export', label: 'Export' },
          ].map((t) => (
            <Tabs.Trigger
              key={t.value}
              value={t.value}
              className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground rounded-md transition-colors data-[state=active]:bg-brand-600 data-[state=active]:text-white hover:text-foreground"
            >
              {t.label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        <Tabs.Content value="overview"><OverviewTab /></Tabs.Content>
        <Tabs.Content value="maintenance"><MaintenanceTab /></Tabs.Content>
        <Tabs.Content value="energy"><EnergyTab /></Tabs.Content>
        <Tabs.Content value="compliance"><ComplianceTab /></Tabs.Content>
        <Tabs.Content value="export"><ExportTab showFeedback={showFeedback} /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   OVERVIEW TAB
   ═══════════════════════════════════════════════════════ */

function OverviewTab() {
  const [days, setDays] = useState(30);
  const [kpi, setKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getKPIDashboard(days);
      setKpi(data);
    } catch {
      setKpi(null);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Period:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${days === d ? 'bg-brand-600 text-white border-brand-600' : 'border-border text-muted-foreground hover:text-foreground'}`}
          >
            {d}d
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : kpi ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            label="Work Orders Completed"
            value={kpi.work_orders_completed ?? 0}
            sub={`Last ${days} days`}
            icon={CheckCircle2}
            color="bg-green-500/20 text-green-400"
          />
          <SummaryCard
            label="Average MTTR"
            value={kpi.avg_mttr_hours != null ? `${Number(kpi.avg_mttr_hours).toFixed(1)}h` : '--'}
            sub="Mean time to repair"
            icon={Clock}
            color="bg-blue-500/20 text-blue-400"
          />
          <SummaryCard
            label="PM Compliance"
            value={kpi.pm_compliance_rate != null ? `${Math.round(kpi.pm_compliance_rate)}%` : '--'}
            sub="On-time preventive maintenance"
            icon={TrendingUp}
            color="bg-indigo-500/20 text-indigo-400"
          />
          <SummaryCard
            label="Total Maintenance Cost"
            value={kpi.total_cost != null ? `$${Number(kpi.total_cost).toLocaleString()}` : '--'}
            sub={`Last ${days} days`}
            icon={DollarSign}
            color="bg-amber-500/20 text-amber-400"
          />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-400" />
          <p>Could not load KPI data. Make sure the backend is running and the endpoint is available.</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAINTENANCE TAB
   ═══════════════════════════════════════════════════════ */

function MaintenanceTab() {
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getWorkOrders() as any[];
        setWorkOrders(data);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Aggregate by status
  const statusCounts: Record<string, number> = {};
  const priorityCounts: Record<string, number> = {};
  workOrders.forEach((wo) => {
    statusCounts[wo.status] = (statusCounts[wo.status] || 0) + 1;
    priorityCounts[wo.priority || 'none'] = (priorityCounts[wo.priority || 'none'] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, count]) => ({ name, count }));
  const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{workOrders.length} total work orders</p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart - by status */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Work Orders by Status</h3>
          {statusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={statusData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-12">No work order data</p>
          )}
        </div>

        {/* Pie chart - by priority */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Work Orders by Priority</h3>
          {priorityData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={priorityData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {priorityData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-12">No work order data</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   ENERGY TAB
   ═══════════════════════════════════════════════════════ */

function EnergyTab() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const raw = await api.getTelemetryHistory({ node_type: 'energysense', hours: 24 }) as any[];
        setData(raw);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  // Aggregate power by hour
  const hourly: Record<string, { grid: number; solar: number; count: number }> = {};
  data.forEach((d) => {
    const h = d.time?.slice(0, 13) || 'unknown';
    if (!hourly[h]) hourly[h] = { grid: 0, solar: 0, count: 0 };
    hourly[h].grid += Number(d.grid_power_w || 0);
    hourly[h].solar += Number(d.solar_power_w || 0);
    hourly[h].count += 1;
  });
  const chartData = Object.entries(hourly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, v]) => ({
      hour: hour.slice(11) || hour,
      grid: Math.round(v.grid / v.count),
      solar: Math.round(v.solar / v.count),
    }));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">{data.length} telemetry points (last 24h)</p>

      <div className="bg-card rounded-xl border border-border p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Average Power by Hour (W)</h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="hour" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
              <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              <Bar dataKey="grid" name="Grid (W)" fill="#6366f1" radius={[4, 4, 0, 0]} />
              <Bar dataKey="solar" name="Solar (W)" fill="#22d3ee" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-muted-foreground text-sm text-center py-12">No energy data for the last 24 hours</p>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   COMPLIANCE TAB
   ═══════════════════════════════════════════════════════ */

function ComplianceTab() {
  const [compliance, setCompliance] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.getPMCompliance();
        setCompliance(data);
      } catch { /* empty */ }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="flex items-center justify-center h-40"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

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

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Big number */}
        <div className="bg-card rounded-xl border border-border p-8 flex flex-col items-center justify-center">
          <p className="text-sm text-muted-foreground mb-2">PM Compliance Rate</p>
          <p className={`text-6xl font-bold ${rate != null && rate >= 80 ? 'text-green-400' : rate != null && rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
            {rate != null ? `${Math.round(rate)}%` : '--'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">{total} total scheduled occurrences</p>
        </div>

        {/* Breakdown pie */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Breakdown</h3>
          {breakdownData.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={breakdownData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {breakdownData.map((_, i) => (
                    <Cell key={i} fill={breakdownColors[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: 8, color: '#e5e7eb' }} />
                <Legend wrapperStyle={{ color: '#9ca3af', fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-12">No compliance data</p>
          )}

          {/* Numbers below */}
          <div className="flex justify-around mt-4 text-center text-sm">
            <div><p className="text-green-400 font-bold">{onTime}</p><p className="text-muted-foreground text-xs">On-time</p></div>
            <div><p className="text-amber-400 font-bold">{late}</p><p className="text-muted-foreground text-xs">Late</p></div>
            <div><p className="text-red-400 font-bold">{skipped}</p><p className="text-muted-foreground text-xs">Skipped</p></div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   EXPORT TAB
   ═══════════════════════════════════════════════════════ */

function ExportTab({ showFeedback }: { showFeedback: (msg: string) => void }) {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [period, setPeriod] = useState('24');
  const [generating, setGenerating] = useState(false);

  const generateReport = async () => {
    if (!selectedReport) return;
    setGenerating(true);
    try {
      const hours = parseInt(period);
      const now = new Date().toISOString();
      const start = new Date(Date.now() - hours * 3600000).toISOString();
      const dateStr = new Date().toISOString().slice(0, 10);

      if (selectedReport === 'machine-health') {
        const data = await api.getTelemetryHistory({ node_type: 'vibesense', start, end: now }) as any[];
        if (data.length === 0) { showFeedback('No data for this period'); return; }
        downloadCSV(`machine-health-${dateStr}.csv`,
          ['Time', 'Node ID', 'VibRMS_X', 'VibRMS_Y', 'VibRMS_Z', 'Anomaly Score', 'Temperature', 'Current'],
          data.map((d) => [d.time, d.node_id, d.vib_rms_x, d.vib_rms_y, d.vib_rms_z, d.anomaly_score, d.temperature_1, d.current_rms])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'energy') {
        const data = await api.getTelemetryHistory({ node_type: 'energysense', start, end: now }) as any[];
        if (data.length === 0) { showFeedback('No data for this period'); return; }
        downloadCSV(`energy-${dateStr}.csv`,
          ['Time', 'Node ID', 'Grid Power (W)', 'Solar Power (W)', 'Ch1 (W)', 'Ch2 (W)', 'Ch3 (W)', 'Ch4 (W)', 'Power Factor'],
          data.map((d) => [d.time, d.node_id, d.grid_power_w, d.solar_power_w, d.channel_1_w, d.channel_2_w, d.channel_3_w, d.channel_4_w, d.power_factor])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'maintenance') {
        const [alerts, workOrders] = await Promise.all([
          api.getAlerts() as Promise<any[]>,
          api.getWorkOrders() as Promise<any[]>,
        ]);
        const alertRows = alerts.map((a: any) => ['Alert', a.created_at, a.alert_type, a.severity, a.status, a.anomaly_score, '', '']);
        const woRows = workOrders.map((w: any) => ['Work Order', w.created_at, w.wo_number, w.priority, w.status, '', w.title, w.scheduled_date]);
        downloadCSV(`maintenance-${dateStr}.csv`,
          ['Type', 'Created', 'ID/Type', 'Severity/Priority', 'Status', 'Anomaly Score', 'Title', 'Scheduled Date'],
          [...alertRows, ...woRows]
        );
        showFeedback(`Exported ${alerts.length} alerts + ${workOrders.length} work orders`);

      } else if (selectedReport === 'oee') {
        const data = await api.getOEE(parseInt(period)) as any[];
        if (data.length === 0) { showFeedback('No OEE data available'); return; }
        downloadCSV(`oee-${dateStr}.csv`,
          ['Machine', 'Asset Tag', 'Sensor Node', 'Availability (%)', 'Active Buckets', 'Total Buckets', 'Period (hours)'],
          data.map((d: any) => [d.machine_name, d.asset_tag, d.node_id, d.availability, d.active_buckets, d.total_buckets, d.hours])
        );
        showFeedback(`Exported OEE for ${data.length} machines`);

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
      <p className="text-sm text-muted-foreground">Select a report type and date range, then download as CSV.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportTypes.map((report) => {
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
        <div className="bg-card rounded-xl border border-border p-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {exportPeriods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateReport} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {generating ? 'Generating...' : 'Download CSV'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
