'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { FlexibleChart } from '@/components/dashboard/flexible-chart';
import { DateRangePicker, ComparisonRange } from '@/components/dashboard/date-range-picker';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  machine_type: string | null;
  manufacturer: string | null;
  model: string | null;
  status: string;
  rated_power_kw: number | null;
  year_installed: number | null;
  specifications: Record<string, any>;
}

interface SensorNode {
  id: string;
  node_type: string;
  firmware_ver: string | null;
  last_seen: string | null;
  is_active: boolean;
}

export default function MachineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const machineId = params.id as string;

  const [machine, setMachine] = useState<Machine | null>(null);
  const [nodes, setNodes] = useState<SensorNode[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<ComparisonRange>({
    primary: {
      start: new Date(Date.now() - 6 * 3600000).toISOString(),
      end: new Date().toISOString(),
    },
  });

  useEffect(() => {
    const load = async () => {
      try {
        const [machineData, nodesData] = await Promise.all([
          api.getMachine(machineId) as Promise<Machine>,
          api.getNodes() as Promise<SensorNode[]>,
        ]);
        setMachine(machineData);
        setNodes(nodesData.filter((n: any) => n.machine_id === machineId));
      } catch {
        router.push('/dashboard/machines');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [machineId, router]);

  useEffect(() => {
    if (nodes.length === 0) return;
    api
      .getTelemetryHistory({
        node_id: nodes[0].id,
        start: dateRange.primary.start,
        end: dateRange.primary.end,
      })
      .then((data) => setTelemetryHistory(data as any[]))
      .catch(console.error);
  }, [nodes, dateRange.primary.start, dateRange.primary.end]);

  if (loading || !machine) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push('/dashboard/machines')} className="text-muted-foreground hover:text-foreground">
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{machine.name}</h1>
          <p className="text-sm text-muted-foreground">
            {machine.asset_tag && `${machine.asset_tag} · `}
            {machine.machine_type || 'Machine'}{' '}
            {machine.manufacturer && `· ${machine.manufacturer} ${machine.model || ''}`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          <p className="text-lg font-semibold text-foreground mt-1 capitalize">{machine.status}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Rated Power</p>
          <p className="text-lg font-semibold text-foreground mt-1">{machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '\u2014'}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Year Installed</p>
          <p className="text-lg font-semibold text-foreground mt-1">{machine.year_installed || '\u2014'}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Sensors</p>
          <p className="text-lg font-semibold text-foreground mt-1">{nodes.length}</p>
        </div>
      </div>

      {nodes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Sensor Nodes</h2>
          <div className="grid grid-cols-3 gap-3">
            {nodes.map((node) => (
              <div key={node.id} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-foreground">{node.id}</p>
                  <span className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-green-500' : 'bg-gray-500'}`} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{node.node_type} · FW {node.firmware_ver || '?'}</p>
                {node.last_seen && (
                  <p className="text-xs text-muted-foreground mt-1">Last seen: {new Date(node.last_seen).toLocaleString('en-GB')}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {telemetryHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Telemetry</h2>
          </div>
          <div className="mb-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FlexibleChart
              data={telemetryHistory}
              chartType="line"
              dataKeys={[
                { key: 'vib_rms_x', name: 'RMS X', color: '#3b82f6' },
                { key: 'vib_rms_y', name: 'RMS Y', color: '#10b981' },
                { key: 'vib_rms_z', name: 'RMS Z', color: '#f59e0b' },
              ]}
              title="Vibration Trend"
            />
            <FlexibleChart
              data={telemetryHistory}
              chartType="area"
              dataKeys={[{ key: 'anomaly_score', name: 'Anomaly', color: '#8b5cf6' }]}
              title="Anomaly Score"
              thresholds={[{ value: 0.5, color: '#ef4444', label: 'Threshold' }]}
            />
          </div>
        </div>
      )}
    </div>
  );
}
