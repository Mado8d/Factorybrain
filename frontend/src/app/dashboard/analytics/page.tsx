'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import {
  BarChart3,
  Clock,
  Wrench,
  AlertTriangle,
  DollarSign,
  CheckCircle2,
  XCircle,
  Timer,
} from 'lucide-react';

interface KPIData {
  mttr: { mttr_seconds: number; mttr_formatted: string; completed_wos: number };
  mtbf: { mtbf_seconds: number; mtbf_formatted: string; failure_count: number; machines_with_failures: number };
  pm_compliance: { total: number; on_time: number; late: number; skipped: number; compliance_rate: number };
  planned_vs_unplanned: { planned: number; unplanned: number; total: number; planned_percentage: number };
  backlog: { total: number; by_priority: Record<string, { count: number; oldest_days: number }> };
  cost: { total_cost: number; total_labor_hours: number; completed_wos: number };
  wrench_time: { wrench_time_percentage: number; total_seconds: number; by_category: Record<string, any> };
  period_days: number;
}

const PERIOD_OPTIONS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
];

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
};

const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  backgroundColor: '#1a1a2e',
  border: '1px solid #2a2a3e',
  color: '#e4e4e7',
};

function complianceColor(rate: number): string {
  if (rate >= 80) return 'text-green-400';
  if (rate >= 60) return 'text-amber-400';
  return 'text-red-400';
}

function isEmpty(data: KPIData): boolean {
  return (
    data.mttr.completed_wos === 0 &&
    data.mtbf.failure_count === 0 &&
    data.pm_compliance.total === 0 &&
    data.planned_vs_unplanned.total === 0 &&
    data.backlog.total === 0 &&
    data.cost.completed_wos === 0
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

export default function AnalyticsPage() {
  const [data, setData] = useState<KPIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api
      .getKPIDashboard(days)
      .then((res) => setData(res as KPIData))
      .catch((err) => setError(err.message || 'Failed to load KPI data'))
      .finally(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 bg-card rounded-xl border border-border">
        <AlertTriangle className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-foreground font-medium">Failed to load analytics</p>
        <p className="text-sm text-muted-foreground mt-1">{error}</p>
      </div>
    );
  }

  if (!data || isEmpty(data)) {
    return (
      <div>
        <Header days={days} setDays={setDays} />
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-foreground font-medium text-lg">No data yet</p>
          <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
            Complete some work orders and PM tasks to see your maintenance KPIs here.
            Data will appear once work orders are created and resolved.
          </p>
        </div>
      </div>
    );
  }

  // Wrench time donut data
  const wrenchPct = data.wrench_time.wrench_time_percentage;
  const wrenchDonutData = [
    { name: 'Wrench Time', value: wrenchPct },
    { name: 'Other', value: 100 - wrenchPct },
  ];
  const wrenchTarget = 55;

  // Planned vs Unplanned pie data
  const pvuData = [
    { name: 'Planned', value: data.planned_vs_unplanned.planned },
    { name: 'Unplanned', value: data.planned_vs_unplanned.unplanned },
  ];

  // PM compliance bar data
  const pmBarData = [
    {
      name: 'PM Compliance',
      on_time: data.pm_compliance.on_time,
      late: data.pm_compliance.late,
      skipped: data.pm_compliance.skipped,
    },
  ];

  return (
    <div>
      <Header days={days} setDays={setDays} />

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KPICard
          icon={<Clock className="h-5 w-5 text-brand-400" />}
          label="Avg repair time"
          value={data.mttr.mttr_formatted}
          subtitle={`${data.mttr.completed_wos} completed WOs`}
          valueColor="text-foreground"
        />
        <KPICard
          icon={<Timer className="h-5 w-5 text-blue-400" />}
          label="Mean time between failures"
          value={data.mtbf.mtbf_formatted}
          subtitle={`${data.mtbf.failure_count} failures across ${data.mtbf.machines_with_failures} machines`}
          valueColor="text-foreground"
        />
        <KPICard
          icon={<CheckCircle2 className="h-5 w-5 text-green-400" />}
          label="On-time completion"
          value={`${data.pm_compliance.compliance_rate.toFixed(1)}%`}
          subtitle={`${data.pm_compliance.on_time}/${data.pm_compliance.total} on time`}
          valueColor={complianceColor(data.pm_compliance.compliance_rate)}
        />
        <KPICard
          icon={<BarChart3 className="h-5 w-5 text-amber-400" />}
          label="Planned vs reactive"
          value={`${data.planned_vs_unplanned.planned_percentage.toFixed(0)}%`}
          subtitle={`${data.planned_vs_unplanned.planned} planned, ${data.planned_vs_unplanned.unplanned} reactive`}
          valueColor={data.planned_vs_unplanned.planned_percentage >= 60 ? 'text-green-400' : 'text-amber-400'}
        />
      </div>

      {/* Row 2: Wrench Time / Backlog / Cost */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Wrench Time Gauge */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-foreground">Wrench Time</h3>
          </div>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={wrenchDonutData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  startAngle={90}
                  endAngle={-270}
                  dataKey="value"
                  strokeWidth={0}
                >
                  <Cell fill={wrenchPct >= wrenchTarget ? '#22c55e' : '#f59e0b'} />
                  <Cell fill="#2a2a3e" />
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val: number) => `${val.toFixed(1)}%`} />
              </PieChart>
            </ResponsiveContainer>
            <div className="-mt-24 text-center mb-6">
              <p className={`text-2xl font-bold ${wrenchPct >= wrenchTarget ? 'text-green-400' : 'text-amber-400'}`}>
                {wrenchPct.toFixed(1)}%
              </p>
              <p className="text-xs text-muted-foreground">Target: {wrenchTarget}%</p>
            </div>
          </div>
        </div>

        {/* WO Backlog */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">WO Backlog</h3>
          </div>
          <p className="text-3xl font-bold text-foreground mb-4">{data.backlog.total}</p>
          {Object.keys(data.backlog.by_priority).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(data.backlog.by_priority).map(([priority, info]) => (
                <div key={priority} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: PRIORITY_COLORS[priority] || '#6b7280' }}
                    />
                    <span className="text-sm text-foreground capitalize">{priority}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-medium text-foreground">{info.count}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      oldest {info.oldest_days}d
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No open backlog items</p>
          )}
        </div>

        {/* Cost */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-semibold text-foreground">Maintenance Cost</h3>
          </div>
          <p className="text-3xl font-bold text-foreground mb-1">
            {formatCurrency(data.cost.total_cost)}
          </p>
          <p className="text-sm text-muted-foreground mb-4">
            across {data.cost.completed_wos} work orders
          </p>
          <div className="flex items-center gap-2 pt-3 border-t border-border">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-foreground">
              {data.cost.total_labor_hours.toFixed(1)} labor hours
            </span>
          </div>
        </div>
      </div>

      {/* Row 3: PM Compliance Breakdown + Planned vs Unplanned */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* PM Compliance Breakdown */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="h-4 w-4 text-green-400" />
            <h3 className="text-sm font-semibold text-foreground">PM Compliance Breakdown</h3>
          </div>
          {data.pm_compliance.total > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={60}>
                <BarChart data={pmBarData} layout="vertical" barSize={24}>
                  <XAxis type="number" hide domain={[0, data.pm_compliance.total]} />
                  <YAxis type="category" dataKey="name" hide />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="on_time" name="On Time" stackId="a" fill="#22c55e" radius={[4, 0, 0, 4]} />
                  <Bar dataKey="late" name="Late" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="skipped" name="Skipped" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-4">
                <Legend color="#22c55e" label={`On Time (${data.pm_compliance.on_time})`} />
                <Legend color="#f59e0b" label={`Late (${data.pm_compliance.late})`} />
                <Legend color="#ef4444" label={`Skipped (${data.pm_compliance.skipped})`} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No PM tasks in this period</p>
          )}
        </div>

        {/* Planned vs Unplanned */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-4 w-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-foreground">Planned vs Unplanned</h3>
          </div>
          {data.planned_vs_unplanned.total > 0 ? (
            <div className="flex items-center">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie
                    data={pvuData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="#7c3aed" />
                    <Cell fill="#ef4444" />
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-[#7c3aed]" />
                  <span className="text-sm text-foreground">
                    Planned: {data.planned_vs_unplanned.planned}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-sm text-foreground">
                    Unplanned: {data.planned_vs_unplanned.unplanned}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No work orders in this period</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Header({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
      <div className="flex items-center gap-1 bg-card border border-border rounded-lg p-1">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.days}
            onClick={() => setDays(opt.days)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              days === opt.days
                ? 'bg-brand-600 text-white'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function KPICard({
  icon,
  label,
  value,
  subtitle,
  valueColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  valueColor: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className={`text-3xl font-bold ${valueColor} mt-1`}>{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
