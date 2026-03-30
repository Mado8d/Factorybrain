'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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
  created_at: string;
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-100 text-green-800', label: 'Actief' },
  idle: { color: 'bg-gray-100 text-gray-600', label: 'Stil' },
  alarm: { color: 'bg-red-100 text-red-800', label: 'Alarm' },
  maintenance: { color: 'bg-amber-100 text-amber-800', label: 'Onderhoud' },
  inactive: { color: 'bg-gray-100 text-gray-400', label: 'Inactief' },
};

export default function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getMachines()
      .then((data) => setMachines(data as Machine[]))
      .catch(console.error)
      .finally(() => setLoading(false));
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Machines</h1>
        <span className="text-sm text-gray-500">{machines.length} machines</span>
      </div>

      {machines.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <p className="text-gray-500 text-lg">Nog geen machines</p>
          <p className="text-sm text-gray-400 mt-2">
            Voeg machines toe via de API of het instellingen-scherm.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Machine</th>
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Type</th>
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Fabrikant</th>
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Vermogen</th>
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Jaar</th>
                <th className="text-left text-xs font-medium text-gray-500 px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => {
                const config = statusConfig[machine.status] || statusConfig.inactive;
                return (
                  <tr
                    key={machine.id}
                    className="border-b last:border-0 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-4">
                      <Link
                        href={`/dashboard/machines/${machine.id}`}
                        className="hover:text-brand-600"
                      >
                        <p className="font-medium text-gray-900">{machine.name}</p>
                        {machine.asset_tag && (
                          <p className="text-xs text-gray-500">{machine.asset_tag}</p>
                        )}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {machine.machine_type || '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {machine.manufacturer
                        ? `${machine.manufacturer}${machine.model ? ` ${machine.model}` : ''}`
                        : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '—'}
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600">
                      {machine.year_installed || '—'}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}
                      >
                        {config.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
