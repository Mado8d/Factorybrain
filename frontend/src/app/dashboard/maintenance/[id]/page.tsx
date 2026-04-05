'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { TimerWidget } from '@/components/dashboard/timer-widget';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  ArrowLeft,
  Save,
  Trash2,
  Loader2,
  Wrench,
  Car,
  Clock3,
  FileText,
  User,
  Plus,
  PauseCircle,
  XCircle,
  Link as LinkIcon,
  AlertTriangle,
  Calendar,
  Tag,
  Cpu,
  CheckSquare,
  RotateCw,
} from 'lucide-react';

// --- Types ---

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
  work_performed: string | null;
  root_cause: string | null;
  checklist: { step: string; required: boolean; completed: boolean }[] | null;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

interface TimeSummary {
  total_seconds: number;
  by_category: Record<string, number>;
  by_user: { user_id: string; user_name: string; seconds: number }[];
}

// --- Status flow ---

const STATUS_STEPS = ['draft', 'open', 'in_progress', 'completed', 'verified'] as const;
const SIDE_STATUSES = ['on_hold', 'cancelled'] as const;

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  open: 'Open',
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  completed: 'Completed',
  verified: 'Verified',
  on_hold: 'On Hold',
  cancelled: 'Cancelled',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-zinc-500',
  open: 'bg-blue-500',
  pending: 'bg-blue-500',
  assigned: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  completed: 'bg-green-500',
  verified: 'bg-emerald-600',
  on_hold: 'bg-yellow-600',
  cancelled: 'bg-red-600',
};

const PRIORITY_COLORS: Record<string, 'destructive' | 'warning' | 'info' | 'success'> = {
  critical: 'destructive',
  high: 'warning',
  medium: 'info',
  low: 'success',
};

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  'alert-driven': 'Alert-Driven',
  pm: 'Preventive',
  request: 'Request',
};

const CATEGORY_ICONS: Record<string, typeof Wrench> = {
  wrench: Wrench,
  travel: Car,
  waiting: Clock3,
  admin: FileText,
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// --- Component ---

export default function WorkOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const woId = params.id as string;

  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'superadmin';

  // Data states
  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [timeSummary, setTimeSummary] = useState<TimeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Editable fields
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [workPerformed, setWorkPerformed] = useState('');
  const [rootCause, setRootCause] = useState('');
  const [checklist, setChecklist] = useState<{ step: string; required: boolean; completed: boolean }[]>([]);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Status change confirmation
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState('');

  // Add handler
  const [addHandlerOpen, setAddHandlerOpen] = useState(false);
  const [selectedHandler, setSelectedHandler] = useState('');

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const loadWorkOrder = useCallback(async () => {
    try {
      const [woData, machineData] = await Promise.all([
        api.getWorkOrders() as Promise<WorkOrder[]>,
        api.getMachines() as Promise<Machine[]>,
      ]);
      const found = woData.find((w) => w.id === woId);
      if (!found) {
        router.push('/dashboard/maintenance');
        return;
      }
      setWo(found);
      setMachines(machineData);
      setDescription(found.description || '');
      setPriority(found.priority);
      setScheduledDate(found.scheduled_date ? found.scheduled_date.split('T')[0] : '');
      setWorkPerformed(found.work_performed || '');
      setRootCause(found.root_cause || '');
      setChecklist(found.checklist || []);

      // Load time summary (don't fail if endpoint unavailable)
      try {
        const ts = await api.getWOTimeSummary(woId);
        setTimeSummary(ts);
      } catch { /* ok */ }

      // Load users for assignment
      try {
        const u = await api.getUsers();
        setUsers(u || []);
      } catch { /* ok */ }
    } catch (err) {
      console.error('Failed to load work order:', err);
      router.push('/dashboard/maintenance');
    } finally {
      setLoading(false);
    }
  }, [woId, router]);

  useEffect(() => {
    loadWorkOrder();
  }, [loadWorkOrder]);

  // Refresh time summary periodically
  useEffect(() => {
    if (!woId) return;
    const interval = setInterval(async () => {
      try {
        const ts = await api.getWOTimeSummary(woId);
        setTimeSummary(ts);
      } catch { /* ok */ }
    }, 30000);
    return () => clearInterval(interval);
  }, [woId]);

  const getMachineName = (id: string) => {
    const m = machines.find((m) => m.id === id);
    return m?.asset_tag || m?.name || id.slice(0, 8);
  };

  // --- Status change ---
  const handleStatusClick = (newStatus: string) => {
    if (!wo || wo.status === newStatus) return;
    setPendingStatus(newStatus);
    setStatusConfirmOpen(true);
  };

  const confirmStatusChange = async () => {
    if (!wo || !pendingStatus) return;
    setSaving(true);
    try {
      await api.updateWorkOrder(wo.id, { status: pendingStatus });
      // Create status change event
      await api.createWOEvent(wo.id, {
        event_type: 'comment',
        content: `Status changed from ${STATUS_LABELS[wo.status] || wo.status} to ${STATUS_LABELS[pendingStatus] || pendingStatus}`,
      });
      setStatusConfirmOpen(false);
      setPendingStatus('');
      await loadWorkOrder();
      showFeedback('Status updated');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  // --- Save all changes ---
  const handleSave = async () => {
    if (!wo) return;
    setSaving(true);
    try {
      const data: any = {};
      if (description !== (wo.description || '')) data.description = description;
      if (priority !== wo.priority) data.priority = priority;
      if (scheduledDate !== (wo.scheduled_date ? wo.scheduled_date.split('T')[0] : ''))
        data.scheduled_date = scheduledDate || null;
      if (workPerformed !== (wo.work_performed || '')) data.work_performed = workPerformed;
      if (rootCause !== (wo.root_cause || '')) data.root_cause = rootCause;
      if (JSON.stringify(checklist) !== JSON.stringify(wo.checklist || []))
        data.checklist = checklist;

      if (Object.keys(data).length === 0) {
        showFeedback('No changes to save');
        setSaving(false);
        return;
      }

      await api.updateWorkOrder(wo.id, data);
      await loadWorkOrder();
      showFeedback('Changes saved');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  // --- Auto-save description on blur ---
  const handleDescriptionBlur = async () => {
    if (!wo || description === (wo.description || '')) return;
    try {
      await api.updateWorkOrder(wo.id, { description });
      setWo({ ...wo, description });
    } catch { /* silent */ }
  };

  // --- Checklist toggle ---
  const toggleChecklistItem = async (index: number) => {
    const updated = [...checklist];
    updated[index] = { ...updated[index], completed: !updated[index].completed };
    setChecklist(updated);
    // Auto-save checklist
    if (wo) {
      try {
        await api.updateWorkOrder(wo.id, { checklist: updated });
      } catch { /* silent */ }
    }
  };

  // --- Delete ---
  const handleDelete = async () => {
    if (!wo) return;
    setDeleting(true);
    try {
      await api.updateWorkOrder(wo.id, { status: 'cancelled' });
      setDeleteOpen(false);
      router.push('/dashboard/maintenance');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  // --- Add handler ---
  const handleAddHandler = async () => {
    if (!wo || !selectedHandler) return;
    try {
      const handlerUser = users.find((u) => u.id === selectedHandler);
      await api.createWOEvent(wo.id, {
        event_type: 'comment',
        content: `Assigned ${handlerUser?.name || 'user'} to this work order`,
      });
      setAddHandlerOpen(false);
      setSelectedHandler('');
      showFeedback('Handler added');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to add handler');
    }
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
      </div>
    );
  }

  if (!wo) return null;

  // Status flow index
  const currentStepIndex = STATUS_STEPS.indexOf(wo.status as any);
  const isSideStatus = (SIDE_STATUSES as readonly string[]).includes(wo.status);
  const completedChecklist = checklist.filter((c) => c.completed).length;

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      {/* === HEADER === */}
      <div className="mb-6">
        {/* Back button */}
        <button
          onClick={() => router.push('/dashboard/maintenance')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Maintenance
        </button>

        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="min-w-0">
            {/* WO number + title */}
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono text-muted-foreground">{wo.wo_number}</span>
              <h1 className="text-2xl font-bold text-foreground">{wo.title}</h1>
            </div>

            {/* Badges row */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Status badge */}
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white ${STATUS_COLORS[wo.status] || 'bg-zinc-500'}`}
              >
                {STATUS_LABELS[wo.status] || wo.status}
              </span>

              {/* Priority badge */}
              <Badge variant={PRIORITY_COLORS[wo.priority] || 'info'} className="text-xs">
                {wo.priority}
              </Badge>

              {/* Machine link */}
              <button
                onClick={() => router.push(`/dashboard/machines/${wo.machine_id}`)}
                className="inline-flex items-center gap-1 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Cpu className="h-3 w-3" />
                {getMachineName(wo.machine_id)}
              </button>

              {/* Trigger type — Planned vs Unplanned */}
              {wo.trigger_type && (
                <>
                  {(wo.trigger_type === 'pm-scheduled' || wo.trigger_type === 'preventive' || wo.trigger_type === 'pm') ? (
                    <Badge variant="success" className="text-[10px] px-1.5 py-0.5">
                      <Calendar className="h-3 w-3 mr-0.5" />
                      Planned - Preventive
                    </Badge>
                  ) : (
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">
                      <AlertTriangle className="h-3 w-3 mr-0.5" />
                      Unplanned - Corrective
                    </Badge>
                  )}

                  {/* Sub-badges for specific trigger types */}
                  {(wo.trigger_type === 'pm-scheduled' || wo.trigger_type === 'pm') && (
                    <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                      <RotateCw className="h-3 w-3 mr-0.5" />
                      Recurring
                    </Badge>
                  )}
                  {wo.trigger_type === 'alert-driven' && (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5">
                      <AlertTriangle className="h-3 w-3 mr-0.5" />
                      From Alert
                    </Badge>
                  )}
                  {wo.trigger_type === 'request' && (
                    <Badge variant="info" className="text-[10px] px-1.5 py-0.5">
                      <User className="h-3 w-3 mr-0.5" />
                      From Request
                    </Badge>
                  )}
                </>
              )}

              {/* Created date */}
              <span className="text-xs text-muted-foreground">
                Created {new Date(wo.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* === STATUS FLOW BAR === */}
      <div className="bg-card border border-border rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Status Flow</h3>
          {isSideStatus && (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium text-white ${STATUS_COLORS[wo.status]}`}>
              {wo.status === 'on_hold' && <PauseCircle className="h-3 w-3" />}
              {wo.status === 'cancelled' && <XCircle className="h-3 w-3" />}
              {STATUS_LABELS[wo.status]}
            </span>
          )}
        </div>

        {/* Progress bar with steps */}
        <div className="flex items-center gap-0">
          {STATUS_STEPS.map((step, i) => {
            const isActive = wo.status === step;
            const isCompleted = !isSideStatus && currentStepIndex >= 0 && i < currentStepIndex;
            const isCurrent = !isSideStatus && i === currentStepIndex;
            const isClickable = isAdmin && wo.status !== step;

            return (
              <div key={step} className="flex items-center flex-1 last:flex-initial">
                {/* Step circle */}
                <button
                  onClick={() => isClickable && handleStatusClick(step)}
                  disabled={!isClickable}
                  className={`relative shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                    ${isCompleted ? 'bg-brand-600 text-white' : ''}
                    ${isCurrent ? 'bg-brand-500 text-white ring-2 ring-brand-400/50 ring-offset-2 ring-offset-card' : ''}
                    ${!isCompleted && !isCurrent ? 'bg-secondary text-muted-foreground' : ''}
                    ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-brand-400/30 hover:ring-offset-1 hover:ring-offset-card' : ''}
                    ${isSideStatus && !isCompleted && !isCurrent ? 'opacity-40' : ''}
                  `}
                  title={STATUS_LABELS[step]}
                >
                  {isCompleted ? (
                    <CheckSquare className="h-4 w-4" />
                  ) : (
                    <span>{i + 1}</span>
                  )}
                </button>

                {/* Label below */}
                <span
                  className={`absolute mt-12 text-[10px] whitespace-nowrap -translate-x-1/2
                    ${isCurrent ? 'text-brand-400 font-medium' : 'text-muted-foreground'}
                  `}
                  style={{ position: 'relative', left: '-16px', top: '4px', display: 'none' }}
                >
                  {STATUS_LABELS[step]}
                </span>

                {/* Connector line */}
                {i < STATUS_STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-0.5 mx-1 transition-colors ${
                      isCompleted ? 'bg-brand-600' : 'bg-secondary'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Step labels row */}
        <div className="flex items-center gap-0 mt-1.5">
          {STATUS_STEPS.map((step, i) => {
            const isCurrent = !isSideStatus && i === currentStepIndex;
            return (
              <div key={step} className="flex items-center flex-1 last:flex-initial">
                <span
                  className={`text-[10px] whitespace-nowrap w-8 text-center
                    ${isCurrent ? 'text-brand-400 font-medium' : 'text-muted-foreground'}
                  `}
                >
                  {STATUS_LABELS[step]}
                </span>
                {i < STATUS_STEPS.length - 1 && <div className="flex-1" />}
              </div>
            );
          })}
        </div>

        {/* Side status buttons */}
        {isAdmin && (
          <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
            {SIDE_STATUSES.map((s) => (
              <Button
                key={s}
                size="sm"
                variant={wo.status === s ? 'default' : 'outline'}
                className="h-7 text-xs"
                disabled={wo.status === s}
                onClick={() => handleStatusClick(s)}
              >
                {s === 'on_hold' && <PauseCircle className="h-3 w-3 mr-1" />}
                {s === 'cancelled' && <XCircle className="h-3 w-3 mr-1" />}
                {STATUS_LABELS[s]}
              </Button>
            ))}
          </div>
        )}
      </div>

      {/* === MAIN CONTENT: LEFT + RIGHT === */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">

        {/* === LEFT COLUMN (70%) === */}
        <div className="space-y-6 min-w-0">

          {/* Description */}
          <div className="bg-card border border-border rounded-lg p-4">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              rows={4}
              className="mt-2 font-sans bg-transparent border-border"
              placeholder="Describe the maintenance task..."
            />
          </div>

          {/* Activity Feed */}
          <div className="bg-card border border-border rounded-lg p-4" style={{ minHeight: '400px' }}>
            {user?.tenant_id && (
              <ActivityFeed workOrderId={woId} tenantId={user.tenant_id} />
            )}
          </div>

          {/* Checklist */}
          {checklist.length > 0 && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckSquare className="h-4 w-4 text-brand-400" />
                  <h3 className="text-sm font-semibold text-foreground">Checklist</h3>
                </div>
                <span className="text-xs text-muted-foreground">
                  {completedChecklist}/{checklist.length} completed
                </span>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 bg-secondary rounded-full mb-3 overflow-hidden">
                <div
                  className="h-full bg-brand-500 rounded-full transition-all"
                  style={{ width: `${checklist.length > 0 ? (completedChecklist / checklist.length) * 100 : 0}%` }}
                />
              </div>

              <div className="space-y-1.5">
                {checklist.map((item, i) => (
                  <label key={i} className="flex items-start gap-2.5 cursor-pointer group py-1.5 px-2 rounded-md hover:bg-secondary/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={item.completed}
                      onChange={() => toggleChecklistItem(i)}
                      className="mt-0.5 h-4 w-4 rounded border-border bg-card text-brand-600 focus:ring-brand-500"
                    />
                    <span className={`text-sm ${item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                      {item.step}
                      {item.required && <span className="text-red-400 ml-1">*</span>}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* === RIGHT COLUMN (30%) === */}
        <div className="space-y-4">

          {/* Details Card */}
          <div className="bg-card border border-border rounded-lg p-4 space-y-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Details</h3>

            {/* Status dropdown */}
            <div>
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select
                value={wo.status}
                onValueChange={(val) => handleStatusClick(val)}
                disabled={!isAdmin}
              >
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[...STATUS_STEPS, ...SIDE_STATUSES].map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Priority dropdown */}
            <div>
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="mt-1 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Machine */}
            <div>
              <Label className="text-xs text-muted-foreground">Machine</Label>
              <button
                onClick={() => router.push(`/dashboard/machines/${wo.machine_id}`)}
                className="flex items-center gap-1.5 mt-1 text-sm text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Cpu className="h-3.5 w-3.5" />
                {getMachineName(wo.machine_id)}
                <LinkIcon className="h-3 w-3 opacity-50" />
              </button>
            </div>

            {/* Trigger */}
            <div>
              <Label className="text-xs text-muted-foreground">Trigger</Label>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {(wo.trigger_type === 'pm-scheduled' || wo.trigger_type === 'preventive' || wo.trigger_type === 'pm') ? (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0.5">Preventive</Badge>
                ) : (
                  <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">Corrective</Badge>
                )}
                <span className="text-sm text-foreground">
                  {TRIGGER_LABELS[wo.trigger_type] || wo.trigger_type}
                </span>
              </div>
            </div>

            {/* Created */}
            <div>
              <Label className="text-xs text-muted-foreground">Created</Label>
              <p className="text-sm text-foreground mt-1">
                {new Date(wo.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Scheduled date */}
            <div>
              <Label className="text-xs text-muted-foreground">Scheduled Date</Label>
              <Input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="mt-1 h-8 text-xs"
              />
            </div>
          </div>

          {/* Assignment Card */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Handled By</h3>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5"
                onClick={() => setAddHandlerOpen(true)}
              >
                <Plus className="h-3 w-3 mr-0.5" />
                Add
              </Button>
            </div>

            {timeSummary && timeSummary.by_user && timeSummary.by_user.length > 0 ? (
              <div className="space-y-2">
                {timeSummary.by_user.map((u) => (
                  <div key={u.user_id} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-full bg-brand-600 flex items-center justify-center text-[10px] font-semibold text-white">
                        {u.user_name
                          .split(' ')
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join('')
                          .toUpperCase()}
                      </div>
                      <div>
                        <p className="text-xs font-medium text-foreground">{u.user_name}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{formatDuration(u.seconds)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No one has logged time yet.</p>
            )}
          </div>

          {/* Time Tracking Card */}
          <div className="space-y-3">
            <TimerWidget workOrderId={woId} workOrderTitle={wo.title} />

            {/* Time summary */}
            {timeSummary && timeSummary.total_seconds > 0 && (
              <div className="bg-card border border-border rounded-lg p-4">
                <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">Time Summary</h3>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-muted-foreground">Total</span>
                  <span className="text-sm font-bold text-foreground">{formatDuration(timeSummary.total_seconds)}</span>
                </div>

                {/* By category */}
                {timeSummary.by_category && Object.keys(timeSummary.by_category).length > 0 && (
                  <div className="space-y-1.5 pt-2 border-t border-border">
                    {Object.entries(timeSummary.by_category).map(([cat, seconds]) => {
                      const Icon = CATEGORY_ICONS[cat] || Clock3;
                      return (
                        <div key={cat} className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Icon className="h-3 w-3" />
                            <span className="capitalize">{cat}</span>
                          </div>
                          <span className="text-xs text-foreground">{formatDuration(seconds)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Work Performed Card */}
          {(wo.status === 'in_progress' || wo.status === 'completed' || wo.status === 'verified') && (
            <div className="bg-card border border-border rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Work Performed</h3>
              <div>
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Textarea
                  value={workPerformed}
                  onChange={(e) => setWorkPerformed(e.target.value)}
                  rows={3}
                  className="mt-1 text-xs bg-transparent border-border"
                  placeholder="Describe what was done..."
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Root Cause</Label>
                <Input
                  value={rootCause}
                  onChange={(e) => setRootCause(e.target.value)}
                  className="mt-1 h-8 text-xs"
                  placeholder="e.g. Bearing wear due to misalignment"
                />
              </div>
            </div>
          )}

          {/* Parts Used (placeholder) */}
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Parts Used</h3>
              <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5" disabled>
                <Plus className="h-3 w-3 mr-0.5" />
                Add Part
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">No parts recorded yet.</p>
          </div>
        </div>
      </div>

      {/* === FOOTER === */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t border-border pb-8">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>

        {isAdmin && (
          <Button variant="destructive" size="sm" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Delete WO
          </Button>
        )}
      </div>

      {/* === DIALOGS === */}

      {/* Status change confirmation */}
      <Dialog open={statusConfirmOpen} onOpenChange={setStatusConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Change Status</DialogTitle>
            <DialogDescription>
              Change status from <strong>{STATUS_LABELS[wo.status] || wo.status}</strong> to{' '}
              <strong>{STATUS_LABELS[pendingStatus] || pendingStatus}</strong>?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setStatusConfirmOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirmStatusChange} disabled={saving}>
              {saving ? 'Updating...' : 'Confirm'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Work Order</DialogTitle>
            <DialogDescription>
              This will cancel work order {wo.wo_number}. This action cannot be easily undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add handler dialog */}
      <Dialog open={addHandlerOpen} onOpenChange={setAddHandlerOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Handler</DialogTitle>
            <DialogDescription>Assign a team member to this work order.</DialogDescription>
          </DialogHeader>
          <div>
            <Label>User</Label>
            <Select value={selectedHandler} onValueChange={setSelectedHandler}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select user..." />
              </SelectTrigger>
              <SelectContent>
                {users.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddHandlerOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleAddHandler} disabled={!selectedHandler}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
