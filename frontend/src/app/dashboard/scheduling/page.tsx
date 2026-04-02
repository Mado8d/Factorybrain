'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ChevronRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  machine_id: string;
  priority: string;
  status: string;
  trigger_type: string;
  scheduled_date: string | null;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

const priorityBorder: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-amber-500',
  low: 'border-l-green-500',
};

const nextStatus: Record<string, { label: string; status: string }> = {
  draft: { label: 'Start', status: 'pending' },
  pending: { label: 'Assign', status: 'assigned' },
  assigned: { label: 'Begin Work', status: 'in_progress' },
  in_progress: { label: 'Complete', status: 'completed' },
};

export default function SchedulingPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const loadData = async () => {
    try {
      const [w, m] = await Promise.all([
        api.getWorkOrders() as Promise<WorkOrder[]>,
        api.getMachines() as Promise<Machine[]>,
      ]);
      setWorkOrders(w);
      setMachines(m);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const getMachineName = (id: string) => {
    const m = machines.find((m) => m.id === id);
    return m?.asset_tag || m?.name || id.slice(0, 8);
  };

  const handleAdvance = async (wo: WorkOrder) => {
    const next = nextStatus[wo.status];
    if (!next) return;
    try {
      await api.updateWorkOrder(wo.id, { status: next.status });
      await loadData();
      showFeedback(`${wo.wo_number} → ${next.status.replace('_', ' ')}`);
    } catch { showFeedback('Failed to update'); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const columns = [
    { key: 'pending', label: 'Pending', items: workOrders.filter((w) => ['draft', 'pending'].includes(w.status)) },
    { key: 'assigned', label: 'Assigned', items: workOrders.filter((w) => w.status === 'assigned') },
    { key: 'in_progress', label: 'In Progress', items: workOrders.filter((w) => w.status === 'in_progress') },
    { key: 'completed', label: 'Completed', items: workOrders.filter((w) => w.status === 'completed') },
  ];

  return (
    <div>
      {/* Feedback */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Scheduling</h1>
        <span className="text-sm text-muted-foreground">{workOrders.length} work orders</span>
      </div>

      {workOrders.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No work orders</p>
          <p className="text-sm text-muted-foreground mt-2">Create work orders from the Maintenance page or from alerts.</p>
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
                {col.items.map((wo) => {
                  const next = nextStatus[wo.status];
                  return (
                    <div key={wo.id} className={`bg-card rounded-lg border border-border border-l-4 p-4 ${priorityBorder[wo.priority] || priorityBorder.medium}`}>
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-mono text-muted-foreground">{wo.wo_number}</p>
                        {wo.trigger_type === 'alert-driven' && <Badge variant="warning" className="text-[10px] px-1 py-0">Alert</Badge>}
                      </div>
                      <p className="text-sm font-medium text-foreground mt-1">{wo.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{getMachineName(wo.machine_id)}</p>
                      {wo.scheduled_date && <p className="text-xs text-muted-foreground mt-1">{new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</p>}
                      {isAdmin && next && (
                        <Button size="sm" variant="outline" className="h-7 text-xs mt-2 w-full" onClick={() => handleAdvance(wo)}>
                          {next.label} <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {col.items.length === 0 && (
                  <div className="text-center py-8 border-2 border-dashed border-border rounded-lg">
                    <p className="text-xs text-muted-foreground">Empty</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
