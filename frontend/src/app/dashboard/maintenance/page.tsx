'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, ArrowRight, CheckCircle, AlertTriangle, CalendarCheck, Clock, RotateCcw, ChevronLeft, ChevronRight, Camera, X } from 'lucide-react';
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

const ITEMS_PER_PAGE = 25;

const severityDotColor: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-500',
};

export default function MaintenancePage() {
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [activeTab, setActiveTab] = useState<'alerts' | 'work-orders' | 'pm-schedules'>('alerts');
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  // PM state
  const [pmSchedules, setPmSchedules] = useState<any[]>([]);
  const [pmTemplates, setPmTemplates] = useState<any[]>([]);
  const [pmCompliance, setPmCompliance] = useState<any>(null);
  const [createPmOpen, setCreatePmOpen] = useState(false);
  const [pmTemplateId, setPmTemplateId] = useState('');
  const [pmMachineId, setPmMachineId] = useState('');

  // Create WO state
  const [createWoOpen, setCreateWoOpen] = useState(false);
  const [woFromAlert, setWoFromAlert] = useState<Alert | null>(null);
  const [woTitle, setWoTitle] = useState('');
  const [woDescription, setWoDescription] = useState('');
  const [woMachineId, setWoMachineId] = useState('');
  const [woPriority, setWoPriority] = useState('medium');
  const [woPhotos, setWoPhotos] = useState<File[]>([]);
  const [woPhotoPreviews, setWoPhotoPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Filter state — Alerts
  const [alertStatusFilter, setAlertStatusFilter] = useState('all');
  const [alertSeverityFilter, setAlertSeverityFilter] = useState('all');
  const [alertMachineFilter, setAlertMachineFilter] = useState('all');
  const [alertPage, setAlertPage] = useState(1);

  // Filter state — Work Orders
  const [woStatusFilter, setWoStatusFilter] = useState('all');
  const [woPriorityFilter, setWoPriorityFilter] = useState('all');
  const [woMachineFilter, setWoMachineFilter] = useState('all');
  const [woPage, setWoPage] = useState(1);

  // Filter state — PM Schedules
  const [pmMachineFilter, setPmMachineFilter] = useState('all');
  const [pmOverdueOnly, setPmOverdueOnly] = useState(false);
  const [pmPage, setPmPage] = useState(1);

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
      // Load PM data (don't fail if endpoints not yet available)
      try {
        const [pm, tpl, comp] = await Promise.all([
          api.getPMSchedules({ is_active: true }) as Promise<any[]>,
          api.getPMTemplates() as Promise<any[]>,
          api.getPMCompliance(),
        ]);
        setPmSchedules(pm);
        setPmTemplates(tpl);
        setPmCompliance(comp);
      } catch { /* PM endpoints may not exist yet */ }
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
    setWoPhotos([]);
    setWoPhotoPreviews([]);
    setCreateWoOpen(true);
  };

  const handleWoPhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setWoPhotos(prev => [...prev, ...files]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setWoPhotoPreviews(prev => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeWoPhoto = (index: number) => {
    setWoPhotos(prev => prev.filter((_, i) => i !== index));
    setWoPhotoPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleCreateWo = async () => {
    if (!woTitle.trim() || !woMachineId) return;
    setSubmitting(true);
    try {
      const wo = await api.createWorkOrder({
        machine_id: woMachineId,
        title: woTitle.trim(),
        description: woDescription.trim() || undefined,
        priority: woPriority,
        trigger_type: woFromAlert ? 'alert-driven' : 'manual',
        trigger_alert_id: woFromAlert?.id,
      }) as WorkOrder;
      // If created from alert, acknowledge the alert
      if (woFromAlert && woFromAlert.status === 'open') {
        await api.updateAlert(woFromAlert.id, { status: 'acknowledged' });
      }
      // Upload photos as a WO event
      if (woPhotos.length > 0 && wo?.id) {
        try {
          const attachments: { filename: string; data: string }[] = [];
          for (const file of woPhotos) {
            const data = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = (ev) => resolve(ev.target?.result as string);
              reader.readAsDataURL(file);
            });
            attachments.push({ filename: file.name, data });
          }
          await api.createWOEvent(wo.id, {
            event_type: 'photo',
            content: `${woPhotos.length} photo(s) attached during creation`,
            attachments,
          });
        } catch (photoErr) {
          console.error('Failed to attach photos:', photoErr);
        }
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

  // --- Filtered & paginated data ---

  const filteredAlerts = useMemo(() => {
    let result = alerts;
    if (alertStatusFilter !== 'all') result = result.filter(a => a.status === alertStatusFilter);
    if (alertSeverityFilter !== 'all') result = result.filter(a => a.severity === alertSeverityFilter);
    if (alertMachineFilter !== 'all') result = result.filter(a => a.machine_id === alertMachineFilter);
    return result;
  }, [alerts, alertStatusFilter, alertSeverityFilter, alertMachineFilter]);

  const filteredWorkOrders = useMemo(() => {
    let result = workOrders;
    if (woStatusFilter !== 'all') result = result.filter(w => w.status === woStatusFilter);
    if (woPriorityFilter !== 'all') result = result.filter(w => w.priority === woPriorityFilter);
    if (woMachineFilter !== 'all') result = result.filter(w => w.machine_id === woMachineFilter);
    return result;
  }, [workOrders, woStatusFilter, woPriorityFilter, woMachineFilter]);

  const filteredPmSchedules = useMemo(() => {
    let result = pmSchedules;
    if (pmMachineFilter !== 'all') result = result.filter((p: any) => p.machine_id === pmMachineFilter);
    if (pmOverdueOnly) result = result.filter((p: any) => p.next_due_date && new Date(p.next_due_date) < new Date());
    return result;
  }, [pmSchedules, pmMachineFilter, pmOverdueOnly]);

  // Reset page when filters change
  useEffect(() => { setAlertPage(1); }, [alertStatusFilter, alertSeverityFilter, alertMachineFilter]);
  useEffect(() => { setWoPage(1); }, [woStatusFilter, woPriorityFilter, woMachineFilter]);
  useEffect(() => { setPmPage(1); }, [pmMachineFilter, pmOverdueOnly]);

  const paginate = <T,>(items: T[], page: number) => {
    const start = (page - 1) * ITEMS_PER_PAGE;
    return items.slice(start, start + ITEMS_PER_PAGE);
  };

  const paginatedAlerts = paginate(filteredAlerts, alertPage);
  const paginatedWorkOrders = paginate(filteredWorkOrders, woPage);
  const paginatedPmSchedules = paginate(filteredPmSchedules, pmPage);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const openAlerts = alerts.filter((a) => a.status === 'open').length;

  // Pagination component
  const Pagination = ({ total, page, setPage }: { total: number; page: number; setPage: (p: number) => void }) => {
    const totalPages = Math.max(1, Math.ceil(total / ITEMS_PER_PAGE));
    const start = (page - 1) * ITEMS_PER_PAGE + 1;
    const end = Math.min(page * ITEMS_PER_PAGE, total);
    if (total === 0) return null;
    return (
      <div className="flex items-center justify-between pt-3 border-t border-border mt-1">
        <span className="text-xs text-muted-foreground">
          Showing {start}-{end} of {total}
        </span>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-3.5 w-3.5 mr-0.5" /> Previous
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs px-2" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            Next <ChevronRight className="h-3.5 w-3.5 ml-0.5" />
          </Button>
        </div>
      </div>
    );
  };

  // Filter bar wrapper
  const FilterBar = ({ children }: { children: React.ReactNode }) => (
    <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 bg-card rounded-lg border border-border">
      {children}
    </div>
  );

  // Small inline select for filters
  const FilterSelect = ({ value, onValueChange, placeholder, children }: { value: string; onValueChange: (v: string) => void; placeholder: string; children: React.ReactNode }) => (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-8 w-[150px] text-xs">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>{children}</SelectContent>
    </Select>
  );

  // Machine options for filter dropdowns
  const machineFilterOptions = machines.map(m => (
    <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
  ));

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
      <div className="flex gap-1 mb-4 bg-secondary rounded-lg p-1 w-fit">
        <button onClick={() => setActiveTab('alerts')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'alerts' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Alerts {openAlerts > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">{openAlerts}</span>}
        </button>
        <button onClick={() => setActiveTab('work-orders')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'work-orders' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          Work Orders ({workOrders.length})
        </button>
        <button onClick={() => setActiveTab('pm-schedules')} className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'pm-schedules' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}>
          <CalendarCheck className="h-3.5 w-3.5 inline mr-1" />PM Schedules ({pmSchedules.length})
        </button>
      </div>

      {/* ============ ALERTS TAB ============ */}
      {activeTab === 'alerts' && (
        <div>
          <FilterBar>
            <span className="text-xs text-muted-foreground font-medium mr-1">Filters:</span>
            <FilterSelect value={alertStatusFilter} onValueChange={setAlertStatusFilter} placeholder="Status">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </FilterSelect>
            <FilterSelect value={alertSeverityFilter} onValueChange={setAlertSeverityFilter} placeholder="Severity">
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </FilterSelect>
            <FilterSelect value={alertMachineFilter} onValueChange={setAlertMachineFilter} placeholder="Machine">
              <SelectItem value="all">All Machines</SelectItem>
              {machineFilterOptions}
            </FilterSelect>
            <span className="text-xs text-muted-foreground ml-auto">{filteredAlerts.length} result{filteredAlerts.length !== 1 ? 's' : ''}</span>
          </FilterBar>

          {filteredAlerts.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="text-muted-foreground">No alerts match the current filters</p>
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-[auto_1fr_1fr_100px_140px_auto] gap-3 px-3 py-2 border-b border-border bg-secondary/50 text-xs font-medium text-muted-foreground">
                <span className="w-3" />
                <span>Type</span>
                <span>Machine</span>
                <span>Status</span>
                <span>Date</span>
                <span>Actions</span>
              </div>

              {/* Table rows */}
              {paginatedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`grid grid-cols-1 md:grid-cols-[auto_1fr_1fr_100px_140px_auto] gap-x-3 gap-y-1 items-center px-3 py-2 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors ${alert.status === 'open' && alert.severity === 'critical' ? 'bg-red-500/5' : ''}`}
                >
                  {/* Severity dot */}
                  <div className="hidden md:flex items-center">
                    <span className={`w-2.5 h-2.5 rounded-full ${severityDotColor[alert.severity] || 'bg-blue-500'}`} title={alert.severity} />
                  </div>
                  {/* Type */}
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`md:hidden w-2.5 h-2.5 rounded-full shrink-0 ${severityDotColor[alert.severity] || 'bg-blue-500'}`} />
                    <span className="text-sm text-foreground truncate">{alert.alert_type}</span>
                    {alert.anomaly_score != null && (
                      <span className="text-[10px] text-muted-foreground shrink-0">{(alert.anomaly_score * 100).toFixed(0)}%</span>
                    )}
                  </div>
                  {/* Machine */}
                  <span className="text-sm text-muted-foreground truncate">{getMachineName(alert.machine_id)}</span>
                  {/* Status */}
                  <div>
                    <Badge variant={alert.status === 'open' ? (alert.severity === 'critical' ? 'destructive' : 'warning') : 'muted'} className="text-[10px] px-1.5 py-0.5">
                      {statusLabels[alert.status] || alert.status}
                    </Badge>
                  </div>
                  {/* Date */}
                  <span className="text-xs text-muted-foreground">{new Date(alert.created_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {isAdmin && alert.status === 'open' && (
                      <>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => handleAcknowledge(alert)}>Ack</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => openCreateWo(alert)}>
                          <ArrowRight className="h-3 w-3 mr-0.5" />WO
                        </Button>
                      </>
                    )}
                    {isAdmin && alert.status === 'acknowledged' && (
                      <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={() => handleResolve(alert)}>Resolve</Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Pagination */}
              <div className="px-3 py-2">
                <Pagination total={filteredAlerts.length} page={alertPage} setPage={setAlertPage} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ WORK ORDERS TAB ============ */}
      {activeTab === 'work-orders' && (
        <div>
          <FilterBar>
            <span className="text-xs text-muted-foreground font-medium mr-1">Filters:</span>
            <FilterSelect value={woStatusFilter} onValueChange={setWoStatusFilter} placeholder="Status">
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="in_progress">In Progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </FilterSelect>
            <FilterSelect value={woPriorityFilter} onValueChange={setWoPriorityFilter} placeholder="Priority">
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </FilterSelect>
            <FilterSelect value={woMachineFilter} onValueChange={setWoMachineFilter} placeholder="Machine">
              <SelectItem value="all">All Machines</SelectItem>
              {machineFilterOptions}
            </FilterSelect>
            <span className="text-xs text-muted-foreground ml-auto">{filteredWorkOrders.length} result{filteredWorkOrders.length !== 1 ? 's' : ''}</span>
          </FilterBar>

          {filteredWorkOrders.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <p className="text-muted-foreground">No work orders match the current filters</p>
              {isAdmin && workOrders.length === 0 && (
                <Button size="sm" className="mt-3" onClick={() => openCreateWo()}>
                  <Plus className="h-4 w-4 mr-1" /> Create Work Order
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-[100px_1fr_1fr_90px_100px_120px] gap-3 px-3 py-2 border-b border-border bg-secondary/50 text-xs font-medium text-muted-foreground">
                <span>WO #</span>
                <span>Title</span>
                <span>Machine</span>
                <span>Priority</span>
                <span>Status</span>
                <span>Date</span>
              </div>

              {/* Table rows */}
              {paginatedWorkOrders.map((wo) => (
                <div
                  key={wo.id}
                  className="grid grid-cols-1 md:grid-cols-[100px_1fr_1fr_90px_100px_120px] gap-x-3 gap-y-1 items-center px-3 py-2 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors cursor-pointer"
                  onClick={() => router.push(`/dashboard/maintenance/${wo.id}`)}
                >
                  {/* WO Number */}
                  <span className="text-xs font-mono text-muted-foreground">{wo.wo_number}</span>
                  {/* Title */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-sm text-foreground truncate">{wo.title}</span>
                    {wo.trigger_type === 'alert-driven' && (
                      <AlertTriangle className="h-3 w-3 text-amber-400 shrink-0" />
                    )}
                  </div>
                  {/* Machine */}
                  <span className="text-sm text-muted-foreground truncate">{getMachineName(wo.machine_id)}</span>
                  {/* Priority */}
                  <div>
                    <Badge variant={priorityVariant[wo.priority] || 'info'} className="text-[10px] px-1.5 py-0.5">{wo.priority}</Badge>
                  </div>
                  {/* Status */}
                  <div>
                    <Badge variant="muted" className="text-[10px] px-1.5 py-0.5">{statusLabels[wo.status] || wo.status}</Badge>
                  </div>
                  {/* Date */}
                  <span className="text-xs text-muted-foreground">
                    {wo.scheduled_date
                      ? new Date(wo.scheduled_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                      : new Date(wo.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  </span>
                </div>
              ))}

              {/* Pagination */}
              <div className="px-3 py-2">
                <Pagination total={filteredWorkOrders.length} page={woPage} setPage={setWoPage} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============ PM SCHEDULES TAB ============ */}
      {activeTab === 'pm-schedules' && (
        <div>
          {/* PM Stats */}
          {pmCompliance && (
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="bg-card rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Due / Overdue</p>
                <p className="text-2xl font-bold text-amber-400 mt-1">{pmSchedules.filter(s => s.next_due_date && new Date(s.next_due_date) <= new Date()).length}</p>
              </div>
              <div className="bg-card rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Active Schedules</p>
                <p className="text-2xl font-bold text-foreground mt-1">{pmSchedules.length}</p>
              </div>
              <div className="bg-card rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Compliance (30d)</p>
                <p className={`text-2xl font-bold mt-1 ${pmCompliance.compliance_rate >= 85 ? 'text-green-400' : pmCompliance.compliance_rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>{pmCompliance.compliance_rate}%</p>
              </div>
            </div>
          )}

          <FilterBar>
            <span className="text-xs text-muted-foreground font-medium mr-1">Filters:</span>
            <FilterSelect value={pmMachineFilter} onValueChange={setPmMachineFilter} placeholder="Machine">
              <SelectItem value="all">All Machines</SelectItem>
              {machineFilterOptions}
            </FilterSelect>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pmOverdueOnly}
                onChange={(e) => setPmOverdueOnly(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border bg-card text-brand-600 focus:ring-brand-500"
              />
              <span className="text-xs text-muted-foreground">Overdue only</span>
            </label>
            <span className="text-xs text-muted-foreground ml-auto">{filteredPmSchedules.length} result{filteredPmSchedules.length !== 1 ? 's' : ''}</span>
            {isAdmin && (
              <Button size="sm" className="h-7 text-xs" onClick={() => { setPmMachineId(machines[0]?.id || ''); setCreatePmOpen(true); }}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add PM
              </Button>
            )}
          </FilterBar>

          {filteredPmSchedules.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-lg border border-border">
              <CalendarCheck className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No preventive maintenance schedules match the current filters</p>
              <p className="text-sm text-muted-foreground mt-1">Create from templates or build custom schedules.</p>
              {isAdmin && pmSchedules.length === 0 && (
                <Button size="sm" className="mt-3" onClick={() => setCreatePmOpen(true)}>
                  <Plus className="h-4 w-4 mr-1" /> Add PM Schedule
                </Button>
              )}
            </div>
          ) : (
            <div className="bg-card rounded-lg border border-border overflow-hidden">
              {/* Table header */}
              <div className="hidden md:grid md:grid-cols-[1fr_1fr_100px_120px_80px_80px] gap-3 px-3 py-2 border-b border-border bg-secondary/50 text-xs font-medium text-muted-foreground">
                <span>Name</span>
                <span>Machine</span>
                <span>Trigger</span>
                <span>Next Due</span>
                <span>Status</span>
                <span>Actions</span>
              </div>

              {/* Table rows */}
              {paginatedPmSchedules.map((pm: any) => {
                const isOverdue = pm.next_due_date && new Date(pm.next_due_date) < new Date();
                const isDueToday = pm.next_due_date && new Date(pm.next_due_date).toDateString() === new Date().toDateString();
                return (
                  <div
                    key={pm.id}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_100px_120px_80px_80px] gap-x-3 gap-y-1 items-center px-3 py-2 border-b border-border last:border-b-0 hover:bg-secondary/30 transition-colors"
                  >
                    {/* Name */}
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`w-1.5 h-5 rounded-full shrink-0 ${isOverdue ? 'bg-red-500' : isDueToday ? 'bg-amber-500' : 'bg-green-500'}`} />
                      <span className="text-sm text-foreground truncate">{pm.name}</span>
                      {pm.category && <span className="text-[10px] text-muted-foreground shrink-0">({pm.category})</span>}
                    </div>
                    {/* Machine */}
                    <div className="text-sm text-muted-foreground truncate">
                      {getMachineName(pm.machine_id)}
                      {pm.estimated_duration_minutes && <span className="text-[10px] ml-1">~{pm.estimated_duration_minutes}min</span>}
                    </div>
                    {/* Trigger type */}
                    <div>
                      <Badge variant={pm.trigger_type === 'condition' ? 'warning' : pm.trigger_type === 'hybrid' ? 'info' : 'default'} className="text-[10px] px-1.5 py-0.5">
                        {pm.trigger_type}
                      </Badge>
                    </div>
                    {/* Next due */}
                    <span className={`text-xs font-medium ${isOverdue ? 'text-red-400' : isDueToday ? 'text-amber-400' : 'text-muted-foreground'}`}>
                      {pm.next_due_date
                        ? isOverdue
                          ? 'Overdue'
                          : isDueToday
                          ? 'Due today'
                          : new Date(pm.next_due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
                        : '-'}
                    </span>
                    {/* Status indicator */}
                    <div>
                      <Badge variant={isOverdue ? 'destructive' : isDueToday ? 'warning' : 'success'} className="text-[10px] px-1.5 py-0.5">
                        {isOverdue ? 'Overdue' : isDueToday ? 'Today' : 'OK'}
                      </Badge>
                    </div>
                    {/* Actions */}
                    <div>
                      {isAdmin && (
                        <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" onClick={async () => {
                          try {
                            await api.deletePMSchedule(pm.id);
                            await loadData();
                            showFeedback('Schedule deactivated');
                          } catch { showFeedback('Failed'); }
                        }}>Deactivate</Button>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              <div className="px-3 py-2">
                <Pagination total={filteredPmSchedules.length} page={pmPage} setPage={setPmPage} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create PM Schedule Dialog (from template) */}
      <Dialog open={createPmOpen} onOpenChange={setCreatePmOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create PM Schedule</DialogTitle>
            <DialogDescription>Choose a maintenance template and assign it to a machine.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Machine *</Label>
              <Select value={pmMachineId} onValueChange={setPmMachineId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>PM Template *</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-64 overflow-y-auto">
                {pmTemplates.map((tpl: any) => (
                  <button
                    key={tpl.id}
                    onClick={() => setPmTemplateId(tpl.id)}
                    className={`text-left p-3 rounded-lg border transition-colors ${pmTemplateId === tpl.id ? 'border-brand-500 bg-brand-600/10' : 'border-border hover:border-border/80'}`}
                  >
                    <p className="text-sm font-medium text-foreground">{tpl.name}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Badge variant="muted" className="text-[10px]">{tpl.category}</Badge>
                      <Badge variant="default" className="text-[10px]">{tpl.trigger_type}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {tpl.calendar_interval_days && `Every ${tpl.calendar_interval_days}d`}
                      {tpl.estimated_duration_minutes && ` · ~${tpl.estimated_duration_minutes}min`}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={submitting || !pmMachineId || !pmTemplateId} onClick={async () => {
              setSubmitting(true);
              try {
                await api.createPMFromTemplate(pmTemplateId, pmMachineId);
                setCreatePmOpen(false);
                setPmTemplateId('');
                await loadData();
                showFeedback('PM schedule created');
              } catch (err: any) {
                showFeedback(err.message || 'Failed');
              } finally { setSubmitting(false); }
            }}>
              {submitting ? 'Creating...' : 'Create PM Schedule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            <div>
              <Label>Attach Photos</Label>
              <div className="mt-1">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors">
                  <Camera className="h-3.5 w-3.5" />
                  {woPhotos.length > 0 ? `${woPhotos.length} selected` : 'Choose photos'}
                  <input type="file" accept="image/*" multiple onChange={handleWoPhotoSelect} className="hidden" />
                </label>
              </div>
              {woPhotoPreviews.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {woPhotoPreviews.map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt={`Photo ${i + 1}`} className="h-16 w-16 object-cover rounded-md border border-border" />
                      <button
                        type="button"
                        onClick={() => removeWoPhoto(i)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleCreateWo} disabled={submitting || !woTitle.trim() || !woMachineId}>
              {submitting ? 'Creating...' : 'Create Work Order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
