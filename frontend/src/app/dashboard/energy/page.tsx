'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { FlexibleChart } from '@/components/dashboard/flexible-chart';
import { DateRangePicker, ComparisonRange } from '@/components/dashboard/date-range-picker';

export default function EnergyPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<Record<string, any>>({});
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
        const [historyData, latestData] = await Promise.all([
          api.getTelemetryHistory({ node_type: 'energysense', start: dateRange.primary.start, end: dateRange.primary.end }),
          api.getLatestTelemetry(),
        ]);
        setHistory(historyData as any[]);
        setLatestTelemetry(latestData as Record<string, any>);
      } catch (err) {
        console.error('Failed to load energy data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [dateRange.primary.start, dateRange.primary.end]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const energyNodes = Object.entries(latestTelemetry).filter(([, v]) => v.node_type === 'energysense');
  const totalGrid = energyNodes.reduce((sum, [, v]) => sum + (v.grid_power_w || 0), 0);
  const totalSolar = energyNodes.reduce((sum, [, v]) => sum + (v.solar_power_w || 0), 0);
  const netPower = totalGrid - totalSolar;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Energy</h1>
      </div>

      <div className="mb-6">
        <DateRangePicker value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
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

      {history.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          <FlexibleChart data={history} chartType="area" dataKeys={[{ key: 'grid_power_w', name: 'Grid', color: '#ef4444' }, { key: 'solar_power_w', name: 'Solar', color: '#22c55e' }]} title="Grid vs Solar" />
          <FlexibleChart data={history} chartType="area" dataKeys={[{ key: 'channel_1_w', name: 'Channel 1', color: '#3b82f6' }, { key: 'channel_2_w', name: 'Channel 2', color: '#f59e0b' }, { key: 'channel_3_w', name: 'Channel 3', color: '#10b981' }, { key: 'channel_4_w', name: 'Channel 4', color: '#8b5cf6' }]} title="Consumption by Channel" stacked />
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
