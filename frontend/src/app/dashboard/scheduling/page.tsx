'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface WorkOrder { id: string; wo_number: string; title: string; machine_id: string; priority: string; status: string; scheduled_date: string | null; created_at: string; }
const priorityColors: Record<string, string> = { critical: 'border-l-red-500', high: 'border-l-orange-500', medium: 'border-l-amber-500', low: 'border-l-green-500' };

export default function SchedulingPage() {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getWorkOrders().then((data) => setWorkOrders(data as WorkOrder[])).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const columns = [
    { key: 'pending', label: 'Pending', items: workOrders.filter((w) => ['draft', 'pending'].includes(w.status)) },
    { key: 'assigned', label: 'Assigned', items: workOrders.filter((w) => w.status === 'assigned') },
    { key: 'in_progress', label: 'In Progress', items: workOrders.filter((w) => w.status === 'in_progress') },
    { key: 'completed', label: 'Completed', items: workOrders.filter((w) => w.status === 'completed') },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Scheduling</h1>
      {workOrders.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No work orders</p>
          <p className="text-sm text-muted-foreground mt-2">Work orders are automatically created from maintenance alerts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-4">
          {columns.map((col) => (
            <div key={col.key}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground">{col.label}</h2>
                <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{col.items.length}</span>
              </div>
              <div className="space-y-3">
                {col.items.map((wo) => (
                  <div key={wo.id} className={`bg-card rounded-lg border border-border border-l-4 p-4 ${priorityColors[wo.priority] || priorityColors.medium}`}>
                    <p className="text-xs font-mono text-muted-foreground">{wo.wo_number}</p>
                    <p className="text-sm font-medium text-foreground mt-1">{wo.title}</p>
                    {wo.scheduled_date && <p className="text-xs text-muted-foreground mt-2">{new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</p>}
                  </div>
                ))}
                {col.items.length === 0 && <div className="text-center py-8 border-2 border-dashed border-border rounded-lg"><p className="text-xs text-muted-foreground">Empty</p></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
