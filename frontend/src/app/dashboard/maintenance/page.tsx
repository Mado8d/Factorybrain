'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

interface Alert { id: string; machine_id: string; alert_type: string; severity: string; anomaly_score: number | null; status: string; created_at: string; details: Record<string, any>; }
interface WorkOrder { id: string; wo_number: string; title: string; machine_id: string; priority: string; status: string; trigger_type: string; scheduled_date: string | null; created_at: string; }

const severityColors: Record<string, string> = { critical: 'bg-red-100 text-red-800', warning: 'bg-amber-100 text-amber-800', info: 'bg-blue-100 text-blue-800' };
const priorityColors: Record<string, string> = { critical: 'bg-red-100 text-red-800', high: 'bg-orange-100 text-orange-800', medium: 'bg-amber-100 text-amber-800', low: 'bg-green-100 text-green-800' };
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Maintenance</h1>
      <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('alerts')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'alerts' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
          Alerts {openAlerts > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{openAlerts}</span>}
        </button>
        <button onClick={() => setActiveTab('work-orders')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'work-orders' ? 'bg-white text-gray-900 shadow-sm font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
          Work Orders ({workOrders.length})
        </button>
      </div>

      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? <div className="text-center py-12 bg-white rounded-xl border"><p className="text-gray-500">No alerts</p></div> :
            alerts.map((alert) => (
              <div key={alert.id} className={`bg-white rounded-xl border p-5 ${alert.status === 'open' && alert.severity === 'critical' ? 'border-red-300 ring-1 ring-red-100' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${severityColors[alert.severity] || severityColors.info}`}>{alert.severity}</span>
                    <p className="font-medium text-gray-900">{alert.alert_type}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">{statusLabels[alert.status] || alert.status}</span>
                    <span className="text-xs text-gray-400">{new Date(alert.created_at).toLocaleString('en-GB')}</span>
                  </div>
                </div>
                {alert.anomaly_score != null && <p className="text-sm text-gray-500 mt-2">Anomaly score: {(alert.anomaly_score * 100).toFixed(0)}%</p>}
              </div>
            ))}
        </div>
      )}

      {activeTab === 'work-orders' && (
        <div className="space-y-3">
          {workOrders.length === 0 ? <div className="text-center py-12 bg-white rounded-xl border"><p className="text-gray-500">No work orders</p></div> :
            workOrders.map((wo) => (
              <div key={wo.id} className="bg-white rounded-xl border p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-gray-400">{wo.wo_number}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColors[wo.priority] || priorityColors.medium}`}>{wo.priority}</span>
                    </div>
                    <p className="font-medium text-gray-900 mt-1">{wo.title}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">{statusLabels[wo.status] || wo.status}</p>
                    {wo.scheduled_date && <p className="text-xs text-gray-400 mt-1">Scheduled: {new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</p>}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
