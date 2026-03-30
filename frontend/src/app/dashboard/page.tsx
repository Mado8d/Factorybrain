'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { VibrationChart } from '@/components/dashboard/vibration-chart';
import { AnomalyChart } from '@/components/dashboard/anomaly-chart';
import { EnergyChart } from '@/components/dashboard/energy-chart';

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
  const [vibrationHistory, setVibrationHistory] = useState<any[]>([]);
  const [energyHistory, setEnergyHistory] = useState<any[]>([]);
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [machinesData, kpisData, telemetryData, vibData, energyData] =
        await Promise.all([
          api.getMachines() as Promise<Machine[]>,
          api.getDashboardKPIs() as Promise<DashboardKPIs>,
          api.getLatestTelemetry() as Promise<TelemetryData>,
          api.getTelemetryHistory({ node_type: 'vibesense', hours: 6 }) as Promise<any[]>,
          api.getTelemetryHistory({ node_type: 'energysense', hours: 6 }) as Promise<any[]>,
        ]);
      setMachines(machinesData);
      setKpis(kpisData);
      setTelemetry(telemetryData);
      setVibrationHistory(vibData);
      setEnergyHistory(energyData);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    // Refresh data every 30 seconds
    const refreshInterval = setInterval(fetchData, 30000);
    return () => clearInterval(refreshInterval);
  }, [fetchData]);

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

    return () => {
      ws.close();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

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

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Machines actief</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {kpis?.active_machines ?? '-'}/{kpis?.total_machines ?? '-'}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Plant OEE</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {kpis?.avg_oee != null ? `${kpis.avg_oee.toFixed(1)}%` : '—'}
          </p>
        </div>
        <div
          className={`rounded-xl border p-5 ${
            (kpis?.open_alerts ?? 0) > 0 ? 'bg-red-50 border-red-200' : 'bg-white'
          }`}
        >
          <p className="text-sm text-gray-500">Open alerts</p>
          <p
            className={`text-3xl font-bold mt-1 ${
              (kpis?.open_alerts ?? 0) > 0 ? 'text-red-700' : 'text-gray-900'
            }`}
          >
            {kpis?.open_alerts ?? 0}
          </p>
          {(kpis?.critical_alerts ?? 0) > 0 && (
            <p className="text-xs text-red-500 mt-1">
              {kpis!.critical_alerts} kritiek
            </p>
          )}
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Energieverbruik</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {kpis?.total_power_kw != null ? kpis.total_power_kw.toFixed(1) : '—'}
            <span className="text-base font-normal text-gray-400"> kW</span>
          </p>
          {kpis?.solar_power_kw != null && kpis.solar_power_kw > 0 && (
            <p className="text-xs text-green-600 mt-1">
              ☀ {kpis.solar_power_kw.toFixed(1)} kW solar
            </p>
          )}
        </div>
      </div>

      {/* Machine grid */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Machines</h2>
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
            // Find telemetry for any node on this machine (simplified: match by machine name prefix)
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
                              (nodeData.vib_rms_x ?? 0) > 3 ? 'text-red-600' : 'text-gray-900'
                            }`}
                          >
                            {nodeData.vib_rms_x?.toFixed(1) ?? '—'} g
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-gray-400">Anomalie</p>
                          <p
                            className={`text-sm font-medium ${
                              (nodeData.anomaly_score ?? 0) > 0.5
                                ? 'text-red-600'
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

      {/* Charts */}
      {(vibrationHistory.length > 0 || energyHistory.length > 0) && (
        <>
          <h2 className="text-lg font-semibold text-gray-900 mt-8 mb-4">
            Trends (afgelopen 6 uur)
          </h2>
          <div className="grid grid-cols-2 gap-4">
            {vibrationHistory.length > 0 && (
              <>
                <VibrationChart data={vibrationHistory} title="Vibratie trend" />
                <AnomalyChart data={vibrationHistory} title="Anomalie score" />
              </>
            )}
            {energyHistory.length > 0 && (
              <>
                <EnergyChart
                  data={energyHistory}
                  title="Grid vs Solar"
                  mode="overview"
                />
                <EnergyChart
                  data={energyHistory}
                  title="Verbruik per kanaal"
                  mode="channels"
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
