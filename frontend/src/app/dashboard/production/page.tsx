'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Plus, Upload, Download, Database, RefreshCw, Trash2, X, FileUp,
} from 'lucide-react';

// ─── Types ───
interface ProductionLog {
  id: string;
  machine_id: string | null;
  machine_name: string | null;
  shift_date: string;
  shift_type: string | null;
  planned_units: number;
  actual_units: number;
  defect_units: number;
  planned_runtime_minutes: number;
  actual_runtime_minutes: number | null;
  downtime_minutes: number;
  ideal_cycle_time_seconds: number | null;
  product_type: string | null;
  batch_number: string | null;
  operator_name: string | null;
  source: string;
  performance_rate: number | null;
  quality_rate: number | null;
  availability_rate: number | null;
  oee: number | null;
}

interface Machine {
  id: string;
  name: string;
}

interface Summary {
  total_planned: number;
  total_actual: number;
  total_defects: number;
  avg_availability: number | null;
  avg_performance: number | null;
  avg_quality: number | null;
  avg_oee: number | null;
  log_count: number;
}

interface OEETrend {
  date: string;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  oee: number | null;
}

// ─── Helpers ───
const TOOLTIP_STYLE = {
  fontSize: 12, borderRadius: 8,
  backgroundColor: '#1a1a2e', border: '1px solid #2a2a3e', color: '#e4e4e7',
};

function oeeColor(v: number | null): string {
  if (v === null) return 'text-muted-foreground';
  if (v >= 85) return 'text-green-400';
  if (v >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function oeeBg(v: number | null): string {
  if (v === null) return 'bg-zinc-800';
  if (v >= 85) return 'bg-green-500/10 border-green-500/30';
  if (v >= 60) return 'bg-amber-500/10 border-amber-500/30';
  return 'bg-red-500/10 border-red-500/30';
}

function fmtPct(v: number | null): string {
  return v !== null ? `${v.toFixed(1)}%` : '--';
}

const TABS = ['Production Log', 'OEE Dashboard', 'Import'] as const;
type TabName = typeof TABS[number];

// ─── Page ───
export default function ProductionPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<TabName>('Production Log');
  const [machines, setMachines] = useState<Machine[]>([]);

  useEffect(() => {
    api.getMachines().then((m: any) => setMachines(Array.isArray(m) ? m : [])).catch(() => {});
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Production Data</h1>
          <p className="text-sm text-muted-foreground mt-1">Track output, calculate OEE, import data</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              tab === t
                ? 'border-brand-400 text-brand-400'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Production Log' && <LogTab machines={machines} isAdmin={user?.role === 'admin' || user?.role === 'superadmin'} />}
      {tab === 'OEE Dashboard' && <OEETab machines={machines} />}
      {tab === 'Import' && <ImportTab />}
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 1: Production Log
// ═══════════════════════════════════════════
function LogTab({ machines, isAdmin }: { machines: Machine[]; isAdmin?: boolean }) {
  const [logs, setLogs] = useState<ProductionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterMachine, setFilterMachine] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterMachine) params.machine_id = filterMachine;
      if (filterFrom) params.date_from = filterFrom;
      if (filterTo) params.date_to = filterTo;
      const data = await api.getProductionLogs(params);
      setLogs(data);
    } catch { /* empty */ }
    setLoading(false);
  }, [filterMachine, filterFrom, filterTo]);

  useEffect(() => { load(); }, [load]);

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await api.seedProductionDemo();
      await load();
    } catch { /* empty */ }
    setSeeding(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this production log?')) return;
    try {
      await api.deleteProductionLog(id);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch { /* empty */ }
  };

  return (
    <div className="space-y-4">
      {/* Filters + Actions */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Machine</label>
          <select
            value={filterMachine}
            onChange={(e) => setFilterMachine(e.target.value)}
            className="bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">All machines</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">From</label>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
            className="bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">To</label>
          <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
            className="bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground" />
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-foreground transition-colors">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
        <button onClick={() => setShowForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm text-white transition-colors ml-auto">
          <Plus className="h-3.5 w-3.5" /> Add Entry
        </button>
        {isAdmin && (
          <button onClick={handleSeed} disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-lg text-sm text-white transition-colors disabled:opacity-50">
            <Database className="h-3.5 w-3.5" /> {seeding ? 'Seeding...' : 'Seed Demo Data'}
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Shift</th>
              <th className="px-4 py-3 font-medium">Machine</th>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium text-right">Planned</th>
              <th className="px-4 py-3 font-medium text-right">Actual</th>
              <th className="px-4 py-3 font-medium text-right">Defects</th>
              <th className="px-4 py-3 font-medium text-right">Avail.</th>
              <th className="px-4 py-3 font-medium text-right">Perf.</th>
              <th className="px-4 py-3 font-medium text-right">Quality</th>
              <th className="px-4 py-3 font-medium text-right">OEE</th>
              <th className="px-4 py-3 font-medium w-10"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan={12} className="px-4 py-8 text-center text-muted-foreground">No production data yet. Add an entry or seed demo data.</td></tr>
            ) : logs.map((log) => (
              <tr key={log.id} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                <td className="px-4 py-2.5 text-foreground">{log.shift_date}</td>
                <td className="px-4 py-2.5 text-foreground capitalize">{log.shift_type || '--'}</td>
                <td className="px-4 py-2.5 text-foreground">{log.machine_name || '--'}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{log.product_type || '--'}</td>
                <td className="px-4 py-2.5 text-right text-foreground">{log.planned_units}</td>
                <td className="px-4 py-2.5 text-right text-foreground">{log.actual_units}</td>
                <td className="px-4 py-2.5 text-right text-red-400">{log.defect_units}</td>
                <td className={`px-4 py-2.5 text-right ${oeeColor(log.availability_rate)}`}>{fmtPct(log.availability_rate)}</td>
                <td className={`px-4 py-2.5 text-right ${oeeColor(log.performance_rate)}`}>{fmtPct(log.performance_rate)}</td>
                <td className={`px-4 py-2.5 text-right ${oeeColor(log.quality_rate)}`}>{fmtPct(log.quality_rate)}</td>
                <td className={`px-4 py-2.5 text-right font-semibold ${oeeColor(log.oee)}`}>{fmtPct(log.oee)}</td>
                <td className="px-4 py-2.5">
                  <button onClick={() => handleDelete(log.id)} className="text-muted-foreground hover:text-red-400 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Entry Dialog */}
      {showForm && <AddEntryDialog machines={machines} onClose={() => setShowForm(false)} onSaved={load} />}
    </div>
  );
}

// ─── Add Entry Dialog ───
function AddEntryDialog({ machines, onClose, onSaved }: { machines: Machine[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    machine_id: '', shift_date: new Date().toISOString().slice(0, 10), shift_type: 'morning',
    planned_units: 300, actual_units: 270, defect_units: 5,
    planned_runtime_minutes: 480, actual_runtime_minutes: 450, downtime_minutes: 30,
    ideal_cycle_time_seconds: 60, product_type: '', operator_name: '', notes: '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.createProductionLog({
        ...form,
        machine_id: form.machine_id || undefined,
        product_type: form.product_type || undefined,
        operator_name: form.operator_name || undefined,
        notes: form.notes || undefined,
      });
      onSaved();
      onClose();
    } catch { /* empty */ }
    setSaving(false);
  };

  const field = (label: string, key: string, type: string = 'number') => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input type={type} value={(form as any)[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
        className="w-full bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold text-foreground">Add Production Entry</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Machine</label>
              <select value={form.machine_id} onChange={(e) => setForm((f) => ({ ...f, machine_id: e.target.value }))}
                className="w-full bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground">
                <option value="">Select machine</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            {field('Shift Date', 'shift_date', 'date')}
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Shift Type</label>
              <select value={form.shift_type} onChange={(e) => setForm((f) => ({ ...f, shift_type: e.target.value }))}
                className="w-full bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground">
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="night">Night</option>
              </select>
            </div>
            {field('Product Type', 'product_type', 'text')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('Planned Units', 'planned_units')}
            {field('Actual Units', 'actual_units')}
            {field('Defect Units', 'defect_units')}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {field('Planned Runtime (min)', 'planned_runtime_minutes')}
            {field('Actual Runtime (min)', 'actual_runtime_minutes')}
            {field('Downtime (min)', 'downtime_minutes')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {field('Ideal Cycle Time (sec)', 'ideal_cycle_time_seconds')}
            {field('Operator', 'operator_name', 'text')}
          </div>
          {field('Notes', 'notes', 'text')}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg bg-zinc-800 hover:bg-zinc-700 text-foreground transition-colors">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-500 text-white transition-colors disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 2: OEE Dashboard
// ═══════════════════════════════════════════
function OEETab({ machines }: { machines: Machine[] }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<OEETrend[]>([]);
  const [machineSummaries, setMachineSummaries] = useState<{ name: string; oee: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMachine, setFilterMachine] = useState('');
  const [days, setDays] = useState(30);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (filterMachine) params.machine_id = filterMachine;

      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

      const [summaryData, trendData] = await Promise.all([
        api.getProductionSummary({ ...params, date_from: from, date_to: today }),
        api.getProductionOEETrend({ ...params, days }),
      ]);
      setSummary(summaryData);
      setTrend(trendData);

      // Machine comparison (only when no machine filter)
      if (!filterMachine && machines.length > 0) {
        const comparisons = await Promise.all(
          machines.map(async (m) => {
            try {
              const s = await api.getProductionSummary({ machine_id: m.id, date_from: from, date_to: today });
              return { name: m.name, oee: s.avg_oee ?? 0 };
            } catch {
              return { name: m.name, oee: 0 };
            }
          })
        );
        setMachineSummaries(comparisons.filter((c) => c.oee > 0).sort((a, b) => b.oee - a.oee));
      }
    } catch { /* empty */ }
    setLoading(false);
  }, [filterMachine, days, machines]);

  useEffect(() => { load(); }, [load]);

  const KPICard = ({ label, value, color }: { label: string; value: number | null; color: string }) => (
    <div className={`border rounded-xl p-4 ${oeeBg(value)}`}>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{fmtPct(value)}</p>
    </div>
  );

  if (loading) {
    return <div className="text-center text-muted-foreground py-12">Loading OEE data...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Machine</label>
          <select value={filterMachine} onChange={(e) => setFilterMachine(e.target.value)}
            className="bg-zinc-900 border border-border rounded-lg px-3 py-1.5 text-sm text-foreground">
            <option value="">All machines</option>
            {machines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Period</label>
          <div className="flex gap-1">
            {[7, 30, 90].map((d) => (
              <button key={d} onClick={() => setDays(d)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                  days === d ? 'bg-brand-600 text-white' : 'bg-zinc-800 text-muted-foreground hover:text-foreground'
                }`}>{d}d</button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPICard label="Overall OEE" value={summary.avg_oee} color={oeeColor(summary.avg_oee)} />
          <KPICard label="Availability" value={summary.avg_availability} color={oeeColor(summary.avg_availability)} />
          <KPICard label="Performance" value={summary.avg_performance} color={oeeColor(summary.avg_performance)} />
          <KPICard label="Quality" value={summary.avg_quality} color={oeeColor(summary.avg_quality)} />
        </div>
      )}

      {/* OEE Trend Chart */}
      {trend.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">OEE Trend (last {days} days)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={(v) => v.slice(5)} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#71717a' }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Line type="monotone" dataKey="oee" name="OEE" stroke="#22c55e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="availability" name="Availability" stroke="#3b82f6" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="performance" name="Performance" stroke="#f59e0b" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
              <Line type="monotone" dataKey="quality" name="Quality" stroke="#a855f7" strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Machine Comparison */}
      {machineSummaries.length > 0 && !filterMachine && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h3 className="text-sm font-medium text-foreground mb-4">OEE by Machine</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, machineSummaries.length * 40)}>
            <BarChart data={machineSummaries} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#71717a' }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#a1a1aa' }} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v.toFixed(1)}%`, 'OEE']} />
              <Bar dataKey="oee" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* No data state */}
      {summary && summary.log_count === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No production data for this period. Go to the Production Log tab to add entries or seed demo data.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// Tab 3: Import
// ═══════════════════════════════════════════
function ImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ imported: number; errors: { row: number; error: string }[]; total_rows: number } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && f.name.endsWith('.csv')) setFile(f);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await api.importProductionCSV(file);
      setResult(res);
      setFile(null);
    } catch (err: any) {
      setResult({ imported: 0, errors: [{ row: 0, error: err.message }], total_rows: 0 });
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const headers = 'shift_date,machine_name,shift_type,planned_units,actual_units,defect_units,planned_runtime_minutes,actual_runtime_minutes,downtime_minutes,product_type,batch_number\n';
    const example = '2026-04-01,CNC Mill 01,morning,300,275,5,480,450,30,Type A,BATCH-001\n';
    const blob = new Blob([headers + example], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'production_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Template download */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h3 className="text-sm font-medium text-foreground mb-2">CSV Template</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Download the template, fill in your production data, then upload the CSV below.
        </p>
        <button onClick={downloadTemplate}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-foreground transition-colors">
          <Download className="h-3.5 w-3.5" /> Download Template
        </button>
      </div>

      {/* Upload area */}
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
          dragOver ? 'border-brand-400 bg-brand-600/10' : 'border-border bg-card'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input ref={fileRef} type="file" accept=".csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
        <FileUp className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
        {file ? (
          <div>
            <p className="text-sm text-foreground font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div>
            <p className="text-sm text-foreground">Drag & drop a CSV file here, or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Only .csv files are supported</p>
          </div>
        )}
      </div>

      {file && (
        <div className="flex gap-2">
          <button onClick={handleImport} disabled={importing}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-500 rounded-lg text-sm text-white transition-colors disabled:opacity-50">
            <Upload className="h-3.5 w-3.5" /> {importing ? 'Importing...' : 'Import CSV'}
          </button>
          <button onClick={() => setFile(null)}
            className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm text-foreground transition-colors">
            Cancel
          </button>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground">Import Results</h3>
          <div className="flex gap-4 text-sm">
            <span className="text-green-400">{result.imported} imported</span>
            <span className="text-muted-foreground">{result.total_rows} total rows</span>
            {result.errors.length > 0 && <span className="text-red-400">{result.errors.length} errors</span>}
          </div>
          {result.errors.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {result.errors.map((err, i) => (
                <p key={i} className="text-xs text-red-400">
                  Row {err.row}: {err.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
