'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import {
  Plus, ArrowLeft, Lock, CheckCircle2, AlertTriangle, Info, AlertCircle,
  Trash2, Calendar, Sun, Moon, Sunset, ClipboardList, Shield, FileText,
  PenLine, User, Clock,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// --- Types ---

interface ShiftEvent {
  description: string;
  severity: 'info' | 'warning' | 'critical';
}

interface OpenItem {
  description: string;
  owner: string;
  deadline: string;
  completed: boolean;
}

interface Handover {
  id: string;
  shift_date: string;
  shift_type: string;
  status: string;
  outgoing_user_id?: string;
  outgoing_user_name?: string;
  incoming_user_id?: string;
  incoming_user_name?: string;
  outgoing_signed_at?: string;
  incoming_signed_at?: string;
  active_work_orders?: any[];
  active_alerts?: any[];
  shift_events?: ShiftEvent[];
  open_items?: OpenItem[];
  safety_notes?: string;
  production_notes?: string;
  created_at?: string;
}

// --- Helpers ---

const statusConfig: Record<string, { label: string; color: string; variant: string }> = {
  draft:    { label: 'Draft',    color: 'bg-gray-500/20 text-gray-400 border-gray-500/30',   variant: 'muted' },
  signed:   { label: 'Signed',   color: 'bg-amber-500/20 text-amber-400 border-amber-500/30', variant: 'warning' },
  complete: { label: 'Complete', color: 'bg-green-500/20 text-green-400 border-green-500/30', variant: 'success' },
  locked:   { label: 'Locked',  color: 'bg-blue-500/20 text-blue-400 border-blue-500/30',    variant: 'info' },
};

const shiftIcons: Record<string, React.ReactNode> = {
  Morning:   <Sun className="h-4 w-4" />,
  Afternoon: <Sunset className="h-4 w-4" />,
  Night:     <Moon className="h-4 w-4" />,
};

const severityIcons: Record<string, React.ReactNode> = {
  info:     <Info className="h-4 w-4 text-blue-400" />,
  warning:  <AlertTriangle className="h-4 w-4 text-amber-400" />,
  critical: <AlertCircle className="h-4 w-4 text-red-400" />,
};

const woStatusDot: Record<string, string> = {
  draft: 'bg-gray-400', pending: 'bg-amber-400', assigned: 'bg-blue-400',
  in_progress: 'bg-brand-400', completed: 'bg-green-400', open: 'bg-red-400',
};

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] || statusConfig.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {status === 'locked' && <Lock className="h-3 w-3" />}
      {cfg.label}
    </span>
  );
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTimestamp(dateStr: string) {
  return new Date(dateStr).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// --- Main Component ---

export default function ShiftHandoverPage() {
  const { user } = useAuth();

  // View state
  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // List state
  const [handovers, setHandovers] = useState<Handover[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail state
  const [handover, setHandover] = useState<Handover | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Editable fields
  const [shiftEvents, setShiftEvents] = useState<ShiftEvent[]>([]);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [safetyNotes, setSafetyNotes] = useState('');
  const [productionNotes, setProductionNotes] = useState('');

  // Inline add forms
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventSeverity, setNewEventSeverity] = useState<'info' | 'warning' | 'critical'>('info');
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemOwner, setNewItemOwner] = useState('');
  const [newItemDeadline, setNewItemDeadline] = useState('');

  // New handover dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newDate, setNewDate] = useState(new Date().toISOString().slice(0, 10));
  const [newShiftType, setNewShiftType] = useState('Morning');
  const [submitting, setSubmitting] = useState(false);

  // Feedback
  const [feedback, setFeedback] = useState('');
  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  // Auto-save debounce ref
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isReadOnly = handover?.status === 'complete' || handover?.status === 'locked';

  // --- Data Loading ---

  const loadList = async () => {
    try {
      const data = await api.getHandovers({ limit: 50 }) as Handover[];
      setHandovers(data);
    } catch (err) {
      console.error('Failed to load handovers:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const data = await api.getHandover(id) as Handover;
      setHandover(data);
      setShiftEvents(data.shift_events || []);
      setOpenItems(data.open_items || []);
      setSafetyNotes(data.safety_notes || '');
      setProductionNotes(data.production_notes || '');
    } catch (err) {
      console.error('Failed to load handover:', err);
      showFeedback('Failed to load handover');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => { loadList(); }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId]);

  // --- Auto-save ---

  const triggerSave = useCallback((events: ShiftEvent[], items: OpenItem[], safety: string, production: string) => {
    if (!selectedId || isReadOnly) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await api.updateHandover(selectedId, {
          shift_events: events,
          open_items: items,
          safety_notes: safety,
          production_notes: production,
        });
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 1000);
  }, [selectedId, isReadOnly]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, []);

  // Wrappers that set state + trigger save
  const updateEvents = (next: ShiftEvent[]) => { setShiftEvents(next); triggerSave(next, openItems, safetyNotes, productionNotes); };
  const updateItems = (next: OpenItem[]) => { setOpenItems(next); triggerSave(shiftEvents, next, safetyNotes, productionNotes); };
  const updateSafety = (val: string) => { setSafetyNotes(val); triggerSave(shiftEvents, openItems, val, productionNotes); };
  const updateProduction = (val: string) => { setProductionNotes(val); triggerSave(shiftEvents, openItems, safetyNotes, val); };

  // --- Actions ---

  const handleCreate = async () => {
    if (!newDate || !newShiftType) return;
    setSubmitting(true);
    try {
      const created = await api.createHandover({ shift_date: newDate, shift_type: newShiftType }) as Handover;
      setCreateOpen(false);
      await loadList();
      setSelectedId(created.id);
      setView('detail');
      showFeedback('Handover created');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to create handover');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOutgoing = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const updated = await api.signOutgoing(selectedId) as Handover;
      setHandover(updated);
      await loadList();
      showFeedback('Signed off as outgoing');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to sign off');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      const updated = await api.acknowledgeIncoming(selectedId) as Handover;
      setHandover(updated);
      await loadList();
      showFeedback('Acknowledged as incoming');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to acknowledge');
    } finally {
      setSubmitting(false);
    }
  };

  const addEvent = () => {
    if (!newEventDesc.trim()) return;
    const next = [...shiftEvents, { description: newEventDesc.trim(), severity: newEventSeverity }];
    updateEvents(next);
    setNewEventDesc('');
    setNewEventSeverity('info');
    setShowAddEvent(false);
  };

  const removeEvent = (idx: number) => {
    updateEvents(shiftEvents.filter((_, i) => i !== idx));
  };

  const addItem = () => {
    if (!newItemDesc.trim()) return;
    const next = [...openItems, { description: newItemDesc.trim(), owner: newItemOwner.trim(), deadline: newItemDeadline, completed: false }];
    updateItems(next);
    setNewItemDesc('');
    setNewItemOwner('');
    setNewItemDeadline('');
    setShowAddItem(false);
  };

  const toggleItemComplete = (idx: number) => {
    const next = openItems.map((item, i) => i === idx ? { ...item, completed: !item.completed } : item);
    updateItems(next);
  };

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const backToList = () => {
    // Flush any pending save
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      if (selectedId && !isReadOnly) {
        api.updateHandover(selectedId, {
          shift_events: shiftEvents,
          open_items: openItems,
          safety_notes: safetyNotes,
          production_notes: productionNotes,
        }).catch(() => {});
      }
    }
    setView('list');
    setSelectedId(null);
    setHandover(null);
    setShowAddEvent(false);
    setShowAddItem(false);
    loadList();
  };

  // --- Loading spinner ---
  if (loading && view === 'list') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  // ========== LIST VIEW ==========
  if (view === 'list') {
    return (
      <div>
        {feedback && (
          <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
            {feedback}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-foreground">Shift Handover</h1>
          <Button size="sm" onClick={() => { setNewDate(new Date().toISOString().slice(0, 10)); setNewShiftType('Morning'); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> New Handover
          </Button>
        </div>

        {handovers.length === 0 ? (
          <div className="text-center py-12 bg-card rounded-xl border border-border">
            <ClipboardList className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-muted-foreground">No shift handovers yet</p>
            <p className="text-sm text-muted-foreground mt-1">Create your first handover to get started.</p>
            <Button size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> New Handover
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {handovers.map((h) => (
              <div
                key={h.id}
                onClick={() => openDetail(h.id)}
                className="bg-card rounded-xl border border-border p-5 hover:border-brand-600/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      {shiftIcons[h.shift_type] || <Sun className="h-4 w-4" />}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-foreground">{formatDate(h.shift_date)}</p>
                        <span className="text-sm text-muted-foreground">{h.shift_type}</span>
                      </div>
                      {h.outgoing_user_name && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <User className="h-3 w-3 inline mr-1" />
                          {h.outgoing_user_name}
                        </p>
                      )}
                    </div>
                  </div>
                  <StatusBadge status={h.status} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create Handover Dialog */}
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New Shift Handover</DialogTitle>
              <DialogDescription>Select the date and shift type for the handover.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Date *</Label>
                <Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Shift Type *</Label>
                <Select value={newShiftType} onValueChange={setNewShiftType}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select shift..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Morning">Morning</SelectItem>
                    <SelectItem value="Afternoon">Afternoon</SelectItem>
                    <SelectItem value="Night">Night</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate} disabled={submitting || !newDate}>
                {submitting ? 'Creating...' : 'Create Handover'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ========== DETAIL VIEW ==========

  if (detailLoading || !handover) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  const activeWOs = handover.active_work_orders || [];
  const activeAlerts = handover.active_alerts || [];

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={backToList}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            {shiftIcons[handover.shift_type] || <Sun className="h-4 w-4 text-muted-foreground" />}
            <h1 className="text-2xl font-bold text-foreground">{formatDate(handover.shift_date)}</h1>
            <span className="text-lg text-muted-foreground">{handover.shift_type}</span>
          </div>
          <StatusBadge status={handover.status} />
        </div>
      </div>

      <div className="space-y-6">
        {/* ========== Equipment Status ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Equipment Status
          </h2>

          {/* Active Work Orders */}
          {activeWOs.length > 0 && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">Active Work Orders ({activeWOs.length})</p>
              <div className="space-y-2">
                {activeWOs.map((wo: any, i: number) => (
                  <div key={wo.id || i} className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                    <div className={`h-2.5 w-2.5 rounded-full ${woStatusDot[wo.status] || 'bg-gray-400'}`} />
                    <span className="text-xs font-mono text-muted-foreground">{wo.wo_number}</span>
                    <span className="text-sm text-foreground flex-1">{wo.title}</span>
                    <Badge variant="muted">{wo.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Alerts */}
          {activeAlerts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Active Alerts ({activeAlerts.length})</p>
              <div className="space-y-2">
                {activeAlerts.map((alert: any, i: number) => (
                  <div key={alert.id || i} className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                    {severityIcons[alert.severity] || severityIcons.info}
                    <span className="text-sm text-foreground flex-1">{alert.alert_type}</span>
                    <span className="text-xs text-muted-foreground">{alert.machine_name || alert.machine_id?.slice(0, 8)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeWOs.length === 0 && activeAlerts.length === 0 && (
            <div className="text-center py-6">
              <CheckCircle2 className="h-6 w-6 text-green-400 mx-auto mb-1" />
              <p className="text-sm text-muted-foreground">No active work orders or alerts</p>
            </div>
          )}
        </section>

        {/* ========== Shift Events ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Shift Events
            </h2>
            {!isReadOnly && (
              <Button size="sm" variant="outline" onClick={() => setShowAddEvent(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Event
              </Button>
            )}
          </div>

          {shiftEvents.length === 0 && !showAddEvent && (
            <p className="text-sm text-muted-foreground text-center py-4">No events recorded this shift.</p>
          )}

          <div className="space-y-2">
            {shiftEvents.map((evt, idx) => (
              <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-secondary rounded-lg group">
                {severityIcons[evt.severity]}
                <p className="text-sm text-foreground flex-1">{evt.description}</p>
                {!isReadOnly && (
                  <button onClick={() => removeEvent(idx)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {showAddEvent && (
            <div className="mt-3 p-3 bg-secondary rounded-lg space-y-3">
              <div>
                <Input
                  placeholder="Describe the event..."
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addEvent(); }}
                  autoFocus
                />
              </div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1">
                  {(['info', 'warning', 'critical'] as const).map((sev) => (
                    <button
                      key={sev}
                      onClick={() => setNewEventSeverity(sev)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        newEventSeverity === sev
                          ? sev === 'info' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : sev === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : 'bg-card text-muted-foreground border border-border hover:text-foreground'
                      }`}
                    >
                      {severityIcons[sev]}
                      {sev}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <Button size="sm" variant="ghost" onClick={() => { setShowAddEvent(false); setNewEventDesc(''); }}>Cancel</Button>
                <Button size="sm" onClick={addEvent} disabled={!newEventDesc.trim()}>Add</Button>
              </div>
            </div>
          )}
        </section>

        {/* ========== Open Items ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
              <FileText className="h-4 w-4" /> Open Items
            </h2>
            {!isReadOnly && (
              <Button size="sm" variant="outline" onClick={() => setShowAddItem(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Item
              </Button>
            )}
          </div>

          {openItems.length === 0 && !showAddItem && (
            <p className="text-sm text-muted-foreground text-center py-4">No open items.</p>
          )}

          <div className="space-y-2">
            {openItems.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 px-3 py-2.5 bg-secondary rounded-lg">
                <input
                  type="checkbox"
                  checked={item.completed}
                  onChange={() => !isReadOnly && toggleItemComplete(idx)}
                  disabled={isReadOnly}
                  className="mt-0.5 h-4 w-4 rounded border-border bg-card text-brand-600 focus:ring-brand-500"
                />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${item.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
                    {item.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    {item.owner && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <User className="h-3 w-3" /> {item.owner}
                      </span>
                    )}
                    {item.deadline && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> {formatDate(item.deadline)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {showAddItem && (
            <div className="mt-3 p-3 bg-secondary rounded-lg space-y-3">
              <Input
                placeholder="Item description..."
                value={newItemDesc}
                onChange={(e) => setNewItemDesc(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <Input
                  placeholder="Owner name"
                  value={newItemOwner}
                  onChange={(e) => setNewItemOwner(e.target.value)}
                  className="flex-1"
                />
                <Input
                  type="date"
                  value={newItemDeadline}
                  onChange={(e) => setNewItemDeadline(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => { setShowAddItem(false); setNewItemDesc(''); setNewItemOwner(''); setNewItemDeadline(''); }}>Cancel</Button>
                <Button size="sm" onClick={addItem} disabled={!newItemDesc.trim()}>Add</Button>
              </div>
            </div>
          )}
        </section>

        {/* ========== Safety Notes ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <Shield className="h-4 w-4" /> Safety Notes
          </h2>
          <Textarea
            value={safetyNotes}
            onChange={(e) => updateSafety(e.target.value)}
            rows={3}
            disabled={isReadOnly}
            placeholder="Record any safety concerns, incidents, or observations..."
            className="font-sans resize-none"
          />
        </section>

        {/* ========== Production Notes ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
            <PenLine className="h-4 w-4" /> Production Notes
          </h2>
          <Textarea
            value={productionNotes}
            onChange={(e) => updateProduction(e.target.value)}
            rows={3}
            disabled={isReadOnly}
            placeholder="Production status, throughput, quality issues, notes for next shift..."
            className="font-sans resize-none"
          />
        </section>

        {/* ========== Sign-off Section ========== */}
        <section className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" /> Sign-off
          </h2>

          {/* Handover complete */}
          {(handover.status === 'complete' || handover.status === 'locked') && (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg mb-4">
              <Lock className="h-5 w-5 text-green-400" />
              <p className="text-sm font-medium text-green-400">Handover Complete</p>
            </div>
          )}

          {/* Signature info */}
          <div className="space-y-3">
            {handover.outgoing_signed_at && (
              <div className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                <div className="h-8 w-8 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Outgoing: {handover.outgoing_user_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Signed {formatTimestamp(handover.outgoing_signed_at)}
                  </p>
                </div>
              </div>
            )}

            {handover.incoming_signed_at && (
              <div className="flex items-center gap-3 px-3 py-2 bg-secondary rounded-lg">
                <div className="h-8 w-8 rounded-full bg-green-500/20 flex items-center justify-center">
                  <User className="h-4 w-4 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Incoming: {handover.incoming_user_name || 'Unknown'}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Acknowledged {formatTimestamp(handover.incoming_signed_at)}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="mt-4">
            {handover.status === 'draft' && !handover.outgoing_signed_at && (
              <Button onClick={handleSignOutgoing} disabled={submitting} className="w-full">
                <PenLine className="h-4 w-4 mr-2" />
                {submitting ? 'Signing...' : 'Sign Off as Outgoing'}
              </Button>
            )}

            {handover.status === 'signed' && !handover.incoming_signed_at && (
              <Button onClick={handleAcknowledge} disabled={submitting} className="w-full">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {submitting ? 'Acknowledging...' : 'Acknowledge as Incoming'}
              </Button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
