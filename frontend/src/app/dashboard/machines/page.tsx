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
}

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-500/20 text-green-400', label: 'Running' },
  idle: { color: 'bg-muted text-muted-foreground', label: 'Idle' },
  alarm: { color: 'bg-red-500/20 text-red-400', label: 'Alarm' },
  maintenance: { color: 'bg-amber-500/20 text-amber-400', label: 'Maintenance' },
  inactive: { color: 'bg-muted text-muted-foreground/50', label: 'Inactive' },
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
        <h1 className="text-2xl font-bold text-foreground">Machines</h1>
        <span className="text-sm text-muted-foreground">{machines.length} machines</span>
      </div>

      {machines.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No machines yet</p>
          <p className="text-sm text-muted-foreground mt-2">Add machines via the API or settings page.</p>
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Machine</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Type</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Manufacturer</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Power</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Year</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => {
                const config = statusConfig[machine.status] || statusConfig.inactive;
                return (
                  <tr key={machine.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors">
                    <td className="px-5 py-4">
                      <Link href={`/dashboard/machines/${machine.id}`} className="hover:text-brand-400">
                        <p className="font-medium text-foreground">{machine.name}</p>
                        {machine.asset_tag && <p className="text-xs text-muted-foreground">{machine.asset_tag}</p>}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{machine.machine_type || '\u2014'}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">
                      {machine.manufacturer ? `${machine.manufacturer}${machine.model ? ` ${machine.model}` : ''}` : '\u2014'}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '\u2014'}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{machine.year_installed || '\u2014'}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
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
