'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { useDashboard } from '@/store/dashboard';
import { WidgetGrid } from '@/components/dashboard/widget-grid';

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
  machine_type: string | null;
  status: string;
  rated_power_kw: number | null;
}

interface DashboardKPIs {
  active_machines: number;
  total_machines: number;
  open_alerts: number;
  critical_alerts: number;
  avg_oee: number | null;
  total_power_kw: number | null;
  solar_power_kw: number | null;
}

interface TelemetryData {
  [nodeId: string]: {
    time: string;
    node_type: string;
    vib_rms_x: number | null;
    vib_rms_y: number | null;
    vib_rms_z: number | null;
    anomaly_score: number | null;
    dominant_freq: number | null;
    temperature_1: number | null;
    current_rms: number | null;
    grid_power_w: number | null;
    solar_power_w: number | null;
  };
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-100 text-green-800 border-green-200', label: 'Actief' },
  idle: { color: 'bg-gray-100 text-gray-600 border-gray-200', label: 'Stil' },
  alarm: { color: 'bg-red-100 text-red-800 border-red-200', label: 'Alarm' },
  maintenance: { color: 'bg-amber-100 text-amber-800 border-amber-200', label: 'Onderhoud' },
  inactive: { color: 'bg-gray-100 text-gray-400 border-gray-200', label: 'Inactief' },
};

export default function DashboardPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryData>({});
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const { loadAll, getThreshold, getRefreshInterval, isLoading: dashLoading } = useDashboard();

  // Load dashboard config (widgets + tenant settings)
  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const fetchData = useCallback(async () => {
    try {
      const [machinesData, kpisData, telemetryData] = await Promise.all([
        api.getMachines() as Promise<Machine[]>,
        api.getDashboardKPIs() as Promise<DashboardKPIs>,
        api.getLatestTelemetry() as Promise<TelemetryData>,
      ]);
      setMachines(machinesData);
      setKpis(kpisData);
      setTelemetry(telemetryData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = getRefreshInterval();
    const refreshInterval = setInterval(fetchData, interval);
    return () => clearInterval(refreshInterval);
  }, [fetchData, getRefreshInterval]);

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    const ws = api.connectLive((data) => {
      if (data.type === 'telemetry') {
        setTelemetry((prev) => ({
          ...prev,
          [data.node_id]: {
            ...prev[data.node_id],
            time: data.time,
            node_type: data.node_type,
            ...data.data,
          },
        }));
      }
    });
    return () => ws.close();
  }, []);

  if (loading || dashLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  // Thresholds from tenant settings (not hardcoded!)
  const vibWarning = getThreshold('vibration_warning');
  const vibCritical = getThreshold('vibration_critical');
  const anomalyWarning = getThreshold('anomaly_warning');
  const anomalyCritical = getThreshold('anomaly_critical');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Fabrieksoverzicht</h1>
          <p className="text-sm text-gray-500 mt-1">
            {time.toLocaleDateString('nl-BE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
            {' — '}
            {time.toLocaleTimeString('nl-BE')}
          </p>
        </div>
      </div>

      {/* Configurable widget grid (KPIs + charts) */}
      <WidgetGrid kpis={kpis || {}} />

      {/* Machine grid (structural, not a widget) */}
      <h2 className="text-lg font-semibold text-gray-900 mt-2 mb-4">Machines</h2>
      {machines.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">Nog geen machines geconfigureerd.</p>
          <p className="text-sm text-gray-400 mt-1">
            Voeg machines toe via Instellingen of de API.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          {machines.map((machine) => {
            const config = statusConfig[machine.status] || statusConfig.inactive;
            const nodeEntry = Object.entries(telemetry).find(
              ([nodeId]) =>
                nodeId.toLowerCase().includes(machine.asset_tag?.toLowerCase() ?? '')
            );
            const nodeData = nodeEntry?.[1];

            return (
              <div
                key={machine.id}
                className={`bg-white rounded-xl border p-5 hover:shadow-md transition-shadow cursor-pointer ${
                  machine.status === 'alarm' ? 'border-red-300 ring-1 ring-red-100' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-gray-900">
                      {machine.asset_tag || machine.id.slice(0, 8)}
                    </p>
                    <p className="text-sm text-gray-500">{machine.name}</p>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}
                  >
                    {config.label}
                  </span>
                </div>

                {nodeData && machine.status !== 'maintenance' && (
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-gray-100">
                    {nodeData.node_type === 'vibesense' && (
                      <>
                        <div>
                          <p className="text-xs text-gray-400">Vibratie RMS</p>
                          <p
                            className={`text-sm font-medium ${
                              (nodeData.vib_rms_x ?? 0) > vibCritical
                                ? 'text-red-600'
                                : (nodeData.vib_rms_x ?? 0) > vibWarning
                                ? 'text-amber-600'
                                : 'text-gray-900'
                            }`}
                          >
                            {nodeData.vib_rms_x?.toFixed(1) ?? '—'} g
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Anomalie</p>
                          <p
                            className={`text-sm font-medium ${
                              (nodeData.anomaly_score ?? 0) > anomalyCritical
                                ? 'text-red-600'
                                : (nodeData.anomaly_score ?? 0) > anomalyWarning
                                ? 'text-amber-600'
                                : 'text-gray-900'
                            }`}
                          >
                            {nodeData.anomaly_score != null
                              ? `${(nodeData.anomaly_score * 100).toFixed(0)}%`
                              : '—'}
                          </p>
                        </div>
                      </>
                    )}
                    {nodeData.node_type === 'energysense' && (
                      <>
                        <div>
                          <p className="text-xs text-gray-400">Grid</p>
                          <p className="text-sm font-medium text-gray-900">
                            {nodeData.grid_power_w != null
                              ? `${(nodeData.grid_power_w / 1000).toFixed(1)} kW`
                              : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Solar</p>
                          <p className="text-sm font-medium text-green-600">
                            {nodeData.solar_power_w != null
                              ? `${(nodeData.solar_power_w / 1000).toFixed(1)} kW`
                              : '—'}
                          </p>
                        </div>
                      </>
                    )}
                    {nodeData.temperature_1 != null && (
                      <div>
                        <p className="text-xs text-gray-400">Temperatuur</p>
                        <p className="text-sm font-medium text-gray-900">
                          {nodeData.temperature_1.toFixed(0)}°C
                        </p>
                      </div>
                    )}
                    {nodeData.current_rms != null && (
                      <div>
                        <p className="text-xs text-gray-400">Stroom</p>
                        <p className="text-sm font-medium text-gray-900">
                          {nodeData.current_rms.toFixed(1)} A
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
