'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

interface Alert {
  id: string;
  machine_id: string;
  node_id: string | null;
  alert_type: string;
  severity: string;
  anomaly_score: number | null;
  status: string;
  created_at: string;
  details: Record<string, any>;
}

interface WorkOrder {
  id: string;
  wo_number: string;
  title: string;
  machine_id: string;
  trigger_type: string;
  trigger_alert_id: string | null;
  priority: string;
  status: string;
  description: string | null;
  scheduled_date: string | null;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

const severityVariant: Record<string, 'destructive' | 'warning' | 'info'> = {
  critical: 'destructive',
  warning: 'warning',
  info: 'info',
};

const priorityVariant: Record<string, 'destructive' | 'warning' | 'info' | 'success'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'success',
};

const statusLabels: Record<string, string> = {
  open: 'Open', acknowledged: 'Acknowledged', resolved: 'Resolved',
  draft: 'Draft', pending: 'Pending', assigned: 'Assigned',
  in_progress: 'In Progress', completed: 'Completed',
};

export default function MaintenancePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<'alerts' | 'work-orders'>('alerts');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // Create WO state
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [woFromAlert, setWoFromAlert] = useState<Alert | null>(null);
  const [woTitle, setWoTitle] = useState('');
  const [woDescription, setWoDescription] = useState('');
  const [woMachineId, setWoMachineId] = useState('');
  const [woPriority, setWoPriority] = useState('medium');
  const [submitting, setSubmitting] = useState(false);

  // Edit WO state
  const [editWo, setEditWo] = useState<WorkOrder | null>(null);
  const [editStatus, setEditStatus] = useState('');
  const [editWorkPerformed, setEditWorkPerformed] = useState('');
  const [editRootCause, setEditRootCause] = useState('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const loadData = async () => {
    try {
      const [a, w, m] = await Promise.all([
        api.getAlerts() as Promise<Alert[]>,
        api.getWorkOrders() as Promise<WorkOrder[]>,
        api.getMachines() as Promise<Machine[]>,
      ]);
      setAlerts(a);
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

  const openCreateWo = (alert?: Alert) => {
    if (alert) {
      setWoFromAlert(alert);
      setWoTitle(`Fix: ${alert.alert_type}`);
      setWoMachineId(alert.machine_id);
      setWoPriority(alert.severity === 'critical' ? 'critical' : alert.severity === 'warning' ? 'high' : 'medium');
      setWoDescription(`Auto-generated from alert.\nAnomaly score: ${alert.anomaly_score != null ? (alert.anomaly_score * 100).toFixed(0) + '%' : 'N/A'}`);
    } else {
      setWoFromAlert(null);
      setWoTitle('');
      setWoMachineId(machines[0]?.id || '');
      setWoPriority('medium');
      setWoDescription('');
    }
    setCreateWoOpen(true);
  };

  const handleCreateWo = async () => {
    if (!woTitle.trim() || !woMachineId) return;
    setSubmitting(true);
    try {
      await api.createWorkOrder({
        machine_id: woMachineId,
        title: woTitle.trim(),
        description: woDescription.trim() || undefined,
        priority: woPriority,
        trigger_type: woFromAlert ? 'alert-driven' : 'manual',
        trigger_alert_id: woFromAlert?.id,
      });
      // If created from alert, acknowledge the alert
      if (woFromAlert && woFromAlert.status === 'open') {
        await api.updateAlert(woFromAlert.id, { status: 'acknowledged' });
      }
      setCreateWoOpen(false);
      await loadData();
      showFeedback('Work order created');
      setActiveTab('work-orders');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async (alert: Alert) => {
    try {
      await api.updateAlert(alert.id, { status: 'acknowledged' });
      await loadData();
      showFeedback('Alert acknowledged');
    } catch { showFeedback('Failed'); }
  };

  const handleResolve = async (alert: Alert) => {
    try {
      await api.updateAlert(alert.id, { status: 'resolved' });
      await loadData();
      showFeedback('Alert resolved');
    } catch { showFeedback('Failed'); }
  };

  const openEditWo = (wo: WorkOrder) => {
    setEditWo(wo);
    setEditStatus(wo.status);
    setEditWorkPerformed('');
    setEditRootCause('');
  };

  const handleUpdateWo = async () => {
    if (!editWo) return;
    setSubmitting(true);
    try {
      const data: any = { status: editStatus };
      if (editWorkPerformed.trim()) data.work_performed = editWorkPerformed.trim();
      if (editRootCause.trim()) data.root_cause = editRootCause.trim();
      await api.updateWorkOrder(editWo.id, data);
      setEditWo(null);
      await loadData();
      showFeedback('Work order updated');
    } catch (err: any) {
      showFeedback(err.message || 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const openAlerts = alerts.filter((a) => a.status === 'open').length;

  return (
    <div>
      {/* Feedback */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Maintenance</h1>
        {isAdmin && (
          <Button size="sm" onClick={() => openCreateWo()}>
            <Plus className="h-4 w-4 mr-1" /> Create Work Order
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('alerts')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'alerts' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Alerts {openAlerts > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{openAlerts}</span>}
        </button>
        <button onClick={() => setActiveTab('work-orders')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'work-orders' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Work Orders ({workOrders.length})
        </button>
      </div>

      {/* Alerts Tab */}
      {activeTab === 'alerts' && (
        <div className="space-y-3">
          {alerts.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="text-muted-foreground">No alerts — all systems healthy</p>
            </div>
          ) : alerts.map((alert) => (
            <div key={alert.id} className={`bg-card rounded-xl border border-border p-5 ${alert.status === 'open' && alert.severity === 'critical' ? 'border-red-500/50 ring-1 ring-red-500/20' : ''}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Badge variant={severityVariant[alert.severity] || 'info'}>{alert.severity}</Badge>
                  <p className="font-medium text-foreground">{alert.alert_type}</p>
                  <span className="text-xs text-muted-foreground">{getMachineName(alert.machine_id)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="muted">{statusLabels[alert.status] || alert.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString('en-GB')}</span>
                  {isAdmin && alert.status === 'open' && (
                    <div className="flex gap-1 ml-2">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleAcknowledge(alert)}>Acknowledge</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openCreateWo(alert)}>
                        <ArrowRight className="h-3 w-3 mr-1" /> Create WO
                      </Button>
                    </div>
                  )}
                  {isAdmin && alert.status === 'acknowledged' && (
                    <Button size="sm" variant="outline" className="h-7 text-xs ml-2" onClick={() => handleResolve(alert)}>Resolve</Button>
                  )}
                </div>
              </div>
              {alert.anomaly_score != null && <p className="text-sm text-muted-foreground mt-2">Anomaly score: {(alert.anomaly_score * 100).toFixed(0)}%</p>}
            </div>
          ))}
        </div>
      )}

      {/* Work Orders Tab */}
      {activeTab === 'work-orders' && (
        <div className="space-y-3">
          {workOrders.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <p className="text-muted-foreground">No work orders yet</p>
              {isAdmin && (
                <Button size="sm" className="mt-3" onClick={() => openCreateWo()}>
                  <Plus className="h-4 w-4 mr-1" /> Create Work Order
                </Button>
              )}
            </div>
          ) : workOrders.map((wo) => (
            <div key={wo.id} className="bg-card rounded-xl border border-border p-5 hover:border-border/80 transition-colors cursor-pointer" onClick={() => isAdmin && openEditWo(wo)}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">{wo.wo_number}</span>
                    <Badge variant={priorityVariant[wo.priority] || 'info'}>{wo.priority}</Badge>
                    {wo.trigger_type === 'alert-driven' && (
                      <Badge variant="warning" className="text-[10px]">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" /> Alert-driven
                      </Badge>
                    )}
                  </div>
                  <p className="font-medium text-foreground mt-1">{wo.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{getMachineName(wo.machine_id)}</p>
                </div>
                <div className="text-right">
                  <Badge variant="muted">{statusLabels[wo.status] || wo.status}</Badge>
                  {wo.scheduled_date && <p className="text-xs text-muted-foreground mt-1">Scheduled: {new Date(wo.scheduled_date).toLocaleDateString('en-GB')}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Work Order Dialog */}
      <Dialog open={createWoOpen} onOpenChange={setCreateWoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{woFromAlert ? 'Create Work Order from Alert' : 'Create Work Order'}</DialogTitle>
            <DialogDescription>
              {woFromAlert ? `Converting ${woFromAlert.severity} alert: ${woFromAlert.alert_type}` : 'Create a manual work order for maintenance.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title *</Label>
              <Input value={woTitle} onChange={(e) => setWoTitle(e.target.value)} placeholder="e.g. Replace bearing on Motor #3" className="mt-1" />
            </div>
            <div>
              <Label>Machine *</Label>
              <Select value={woMachineId} onValueChange={setWoMachineId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Priority</Label>
              <Select value={woPriority} onValueChange={setWoPriority}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={woDescription} onChange={(e) => setWoDescription(e.target.value)} rows={3} className="mt-1 font-sans" placeholder="Describe the maintenance task..." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateWo} disabled={submitting || !woTitle.trim() || !woMachineId}>
              {submitting ? 'Creating...' : 'Create Work Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Work Order Dialog */}
      <Dialog open={!!editWo} onOpenChange={(open) => { if (!open) setEditWo(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Work Order {editWo?.wo_number}</DialogTitle>
            <DialogDescription>{editWo?.title}</DialogDescription>
          </DialogHeader>
          {editWo && (
            <div className="space-y-4">
              <div>
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="assigned">Assigned</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(editStatus === 'completed' || editStatus === 'in_progress') && (
                <>
                  <div>
                    <Label>Work Performed</Label>
                    <Textarea value={editWorkPerformed} onChange={(e) => setEditWorkPerformed(e.target.value)} rows={3} className="mt-1 font-sans" placeholder="Describe what was done..." />
                  </div>
                  <div>
                    <Label>Root Cause</Label>
                    <Input value={editRootCause} onChange={(e) => setEditRootCause(e.target.value)} placeholder="e.g. Bearing wear due to misalignment" className="mt-1" />
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleUpdateWo} disabled={submitting}>
              {submitting ? 'Saving...' : 'Update Work Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
