'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { VibrationChart } from '@/components/dashboard/vibration-chart';
import { AnomalyChart } from '@/components/dashboard/anomaly-chart';

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
  const [hours, setHours] = useState(6);

  useEffect(() => {
    const load = async () => {
      try {
        const [machineData, nodesData] = await Promise.all([
          api.getMachine(machineId) as Promise<Machine>,
          api.getNodes() as Promise<SensorNode[]>,
        ]);
        setMachine(machineData);
        // Filter nodes for this machine
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
    // Load telemetry for the first node
    api
      .getTelemetryHistory({ node_id: nodes[0].id, hours })
      .then((data) => setTelemetryHistory(data as any[]))
      .catch(console.error);
  }, [nodes, hours]);

  if (loading || !machine) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/machines')}
          className="text-gray-400 hover:text-gray-600"
        >
          ←
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{machine.name}</h1>
          <p className="text-sm text-gray-500">
            {machine.asset_tag && `${machine.asset_tag} · `}
            {machine.machine_type || 'Machine'}{' '}
            {machine.manufacturer && `· ${machine.manufacturer} ${machine.model || ''}`}
          </p>
        </div>
      </div>

      {/* Machine info cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Status</p>
          <p className="text-lg font-semibold text-gray-900 mt-1 capitalize">{machine.status}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Vermogen</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Bouwjaar</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">
            {machine.year_installed || '—'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-gray-500">Sensoren</p>
          <p className="text-lg font-semibold text-gray-900 mt-1">{nodes.length}</p>
        </div>
      </div>

      {/* Sensor nodes */}
      {nodes.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Sensor nodes</h2>
          <div className="grid grid-cols-3 gap-3">
            {nodes.map((node) => (
              <div key={node.id} className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-gray-900">{node.id}</p>
                  <span
                    className={`w-2 h-2 rounded-full ${
                      node.is_active ? 'bg-green-500' : 'bg-gray-300'
                    }`}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {node.node_type} · FW {node.firmware_ver || '?'}
                </p>
                {node.last_seen && (
                  <p className="text-xs text-gray-400 mt-1">
                    Laatst gezien: {new Date(node.last_seen).toLocaleString('nl-BE')}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Telemetry charts */}
      {telemetryHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900">Telemetrie</h2>
            <div className="flex gap-2">
              {[6, 12, 24, 48].map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    hours === h
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {h}u
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <VibrationChart data={telemetryHistory} />
            <AnomalyChart data={telemetryHistory} />
          </div>
        </div>
      )}
    </div>
  );
}
