'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Alert { id: string; machine_id: string; alert_type: string; severity: string; anomaly_score: number | null; status: string; created_at: string; details: Record<string, any>; }
interface WorkOrder { id: string; wo_number: string; title: string; machine_id: string; priority: string; status: string; trigger_type: string; scheduled_date: string | null; created_at: string; }

const severityColors: Record<string, string> = { critical: 'bg-red-500/20 text-red-400', warning: 'bg-amber-500/20 text-amber-400', info: 'bg-blue-500/20 text-blue-400' };
const priorityColors: Record<string, string> = { critical: 'bg-red-500/20 text-red-400', high: 'bg-orange-500/20 text-orange-400', medium: 'bg-amber-500/20 text-amber-400', low: 'bg-green-500/20 text-green-400' };
const statusLabels: Record<string, string> = { open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved', draft: 'Draft', pending: 'Pending', assigned: 'Assigned', in_progress: 'In Progress', completed: 'Completed' };

export default function MaintenancePage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [activeTab, setActiveTab] = useState<'alerts' | 'work-orders'>('alerts');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.getAlerts() as Promise<Alert[]>, api.getWorkOrders() as Promise<WorkOrder[]>])
      .then(([a, w]) => { setAlerts(a); setWorkOrders(w); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const openAlerts = alerts.filter((a) => a.status === 'open').length;

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Maintenance</h1>
      <div className="flex gap-1 mb-6 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('alerts')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'alerts' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Alerts {openAlerts > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{openAlerts}</span>}
        </button>
        <button onClick={() => setActiveTab('work-orders')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'work-orders' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Work Orders ({workOrders.length})
        </button>
      </div>

      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? <div className="text-center py-12 bg-card rounded-xl border border-border"><p className="text-muted-foreground">No alerts</p></div> :
            alerts.map((alert) => (
              <div key={alert.id} className={`bg-card rounded-xl border border-border p-5 ${alert.status === 'open' && alert.severity === 'critical' ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityColors[alert.severity] || severityColors.info}`}>{alert.severity}</span>
                    <p className="font-medium text-foreground">{alert.alert_type}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground">{statusLabels[alert.status] || alert.status}</span>
                    <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString('en-GB')}</span>
                  </div>
                </div>
                {alert.anomaly_score != null && <p className="text-sm text-muted-foreground mt-2">Anomaly score: {(alert.anomaly_score * 100).toFixed(0)}%</p>}
              </div>
            ))}
        </div>
      )}

      {activeTab === 'work-orders' && (
        <div className="space-y-3">
          {workOrders.length === 0 ? <div className="text-center py-12 bg-card rounded-xl border border-border"><p className="text-muted-foreground">No work orders</p></div> :
            workOrders.map((wo) => (
              <div key={wo.id} className="bg-card rounded-xl border border-border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{wo.wo_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[wo.priority] || priorityColors.medium}`}>{wo.priority}</span>
                    </div>
                    <p className="font-medium text-foreground mt-1">{wo.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{statusLabels[wo.status] || wo.status}</p>
                    {wo.scheduled_date && <p className="text-xs text-muted-foreground mt-1">Scheduled: {new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</p>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
