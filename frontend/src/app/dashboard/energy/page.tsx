'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FlexibleChart } from '@/components/dashboard/flexible-chart';
import { DateRangePicker, ComparisonRange } from '@/components/dashboard/date-range-picker';
import { Activity } from 'lucide-react';

interface OEEData {
  machine_id: string;
  machine_name: string;
  asset_tag: string | null;
  node_id: string;
  availability: number;
  total_buckets: number;
  active_buckets: number;
  hours: number;
}

function AvailabilityGauge({ value, label }: { value: number; label: string }) {
  const color = value >= 85 ? 'text-green-400' : value >= 60 ? 'text-amber-400' : 'text-red-400';
  const bgColor = value >= 85 ? 'bg-green-500/20' : value >= 60 ? 'bg-amber-500/20' : 'bg-red-500/20';
  const strokeColor = value >= 85 ? '#22c55e' : value >= 60 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 40;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="bg-card rounded-xl border border-border p-5 flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#2a2a3e" strokeWidth="8" />
          <circle cx="50" cy="50" r="40" fill="none" stroke={strokeColor} strokeWidth="8"
            strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
            className="transition-all duration-700" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-lg font-bold ${color}`}>{value}%</span>
        </div>
      </div>
      <p className="text-sm font-medium text-foreground mt-2">{label}</p>
      <p className="text-xs text-muted-foreground">Availability</p>
    </div>
  );
}

export default function EnergyPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [compareHistory, setCompareHistory] = useState<any[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<Record<string, any>>({});
  const [oeeData, setOeeData] = useState<OEEData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ComparisonRange>({
    primary: {
      start: new Date(Date.now() - 24 * 3600000).toISOString(),
      end: new Date().toISOString(),
    },
  });

  useEffect(() => {
    const load = async () => {
      try {
        const spanHours = Math.round((new Date(dateRange.primary.end).getTime() - new Date(dateRange.primary.start).getTime()) / 3600000);
        const fetches: Promise<any>[] = [
          api.getTelemetryHistory({ node_type: 'energysense', start: dateRange.primary.start, end: dateRange.primary.end }),
          api.getLatestTelemetry(),
          api.getOEE(Math.min(168, Math.max(1, spanHours))),
        ];

        // Fetch comparison data if a compare range is set
        if (dateRange.compare) {
          fetches.push(
            api.getTelemetryHistory({ node_type: 'energysense', start: dateRange.compare.start, end: dateRange.compare.end })
          );
        }

        const results = await Promise.all(fetches);
        setHistory(results[0] as any[]);
        setLatestTelemetry(results[1] as Record<string, any>);
        setOeeData(results[2] as OEEData[]);
        setCompareHistory(dateRange.compare ? (results[3] as any[]) : []);
      } catch (err) {
        console.error('Failed to load energy data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateRange.primary.start, dateRange.primary.end, dateRange.compare?.start, dateRange.compare?.end]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const energyNodes = Object.entries(latestTelemetry).filter(([, v]) => v.node_type === 'energysense');
  const totalGrid = energyNodes.reduce((sum, [, v]) => sum + (v.grid_power_w || 0), 0);
  const totalSolar = energyNodes.reduce((sum, [, v]) => sum + (v.solar_power_w || 0), 0);
  const netPower = totalGrid - totalSolar;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Energy & OEE</h1>
      </div>

      <div className="mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Grid Consumption</p>
          <p className="text-3xl font-bold text-foreground mt-1">{(totalGrid / 1000).toFixed(1)}<span className="text-base font-normal text-muted-foreground"> kW</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Solar Production</p>
          <p className="text-3xl font-bold text-green-400 mt-1">{(totalSolar / 1000).toFixed(1)}<span className="text-base font-normal text-green-500"> kW</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">Net Consumption</p>
          <p className={`text-3xl font-bold mt-1 ${netPower < 0 ? 'text-green-400' : 'text-foreground'}`}>{(netPower / 1000).toFixed(1)}<span className="text-base font-normal text-muted-foreground"> kW</span></p>
        </div>
        <div className="bg-card rounded-xl border border-border p-5">
          <p className="text-sm text-muted-foreground">EnergySense Nodes</p>
          <p className="text-3xl font-bold text-foreground mt-1">{energyNodes.length}</p>
        </div>
      </div>

      {/* OEE / Availability Gauges */}
      {oeeData.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="h-5 w-5 text-brand-400" />
            <h2 className="text-lg font-semibold text-foreground">Machine Availability (OEE)</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {oeeData.map((d) => (
              <AvailabilityGauge key={d.machine_id} value={d.availability} label={d.asset_tag || d.machine_name} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Based on energy consumption over the selected period. Machine is &quot;active&quot; when grid power &gt; 500W.</p>
        </div>
      )}

      {history.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          <FlexibleChart data={history} compareData={compareHistory.length > 0 ? compareHistory : undefined} chartType="area" dataKeys={[{ key: 'grid_power_w', name: 'Grid', color: '#ef4444' }, { key: 'solar_power_w', name: 'Solar', color: '#22c55e' }]} title="Grid vs Solar" />
          <FlexibleChart data={history} compareData={compareHistory.length > 0 ? compareHistory : undefined} chartType="area" dataKeys={[{ key: 'channel_1_w', name: 'Channel 1', color: '#3b82f6' }, { key: 'channel_2_w', name: 'Channel 2', color: '#f59e0b' }, { key: 'channel_3_w', name: 'Channel 3', color: '#10b981' }, { key: 'channel_4_w', name: 'Channel 4', color: '#8b5cf6' }]} title="Consumption by Channel" stacked />
        </div>
      ) : (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">No energy data available</p>
          <p className="text-sm text-muted-foreground mt-1">Connect an EnergySense node or run the simulator.</p>
        </div>
      )}
    </div>
  );
}
