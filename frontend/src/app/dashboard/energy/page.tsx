'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { EnergyChart } from '@/components/dashboard/energy-chart';

export default function EnergyPage() {
  const [history, setHistory] = useState<any[]>([]);
  const [latestTelemetry, setLatestTelemetry] = useState<Record<string, any>>({});
  const [hours, setHours] = useState(24);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [historyData, latestData] = await Promise.all([
          api.getTelemetryHistory({ node_type: 'energysense', hours }),
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
  }, [hours]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  // Aggregate latest energy data
  const energyNodes = Object.entries(latestTelemetry).filter(
    ([, v]) => v.node_type === 'energysense'
  );
  const totalGrid = energyNodes.reduce((sum, [, v]) => sum + (v.grid_power_w || 0), 0);
  const totalSolar = energyNodes.reduce((sum, [, v]) => sum + (v.solar_power_w || 0), 0);
  const netPower = totalGrid - totalSolar;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Energie</h1>
        <div className="flex gap-2">
          {[6, 12, 24, 48, 168].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                hours === h
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {h <= 48 ? `${h}u` : `${h / 24}d`}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Grid verbruik</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">
            {(totalGrid / 1000).toFixed(1)}
            <span className="text-base font-normal text-gray-400"> kW</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Solar productie</p>
          <p className="text-3xl font-bold text-green-600 mt-1">
            {(totalSolar / 1000).toFixed(1)}
            <span className="text-base font-normal text-green-400"> kW</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">Netto verbruik</p>
          <p className={`text-3xl font-bold mt-1 ${netPower < 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {(netPower / 1000).toFixed(1)}
            <span className="text-base font-normal text-gray-400"> kW</span>
          </p>
        </div>
        <div className="bg-white rounded-xl border p-5">
          <p className="text-sm text-gray-500">EnergySense nodes</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{energyNodes.length}</p>
        </div>
      </div>

      {/* Charts */}
      {history.length > 0 ? (
        <div className="grid grid-cols-2 gap-4">
          <EnergyChart data={history} title="Grid vs Solar" mode="overview" />
          <EnergyChart data={history} title="Verbruik per kanaal" mode="channels" />
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-xl border">
          <p className="text-gray-500">Geen energiedata beschikbaar</p>
          <p className="text-sm text-gray-400 mt-1">
            Sluit een EnergySense node aan of start de simulator.
          </p>
        </div>
      )}
    </div>
  );
}
