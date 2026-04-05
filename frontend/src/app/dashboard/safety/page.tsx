'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import {
  Plus, Shield, Lock, Unlock, CheckCircle, ChevronDown, ChevronUp,
  Zap, Droplets, Wind, Flame, FlaskConical, ArrowDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';

// --- Types ---

interface EnergySource {
  type: string;
  location: string;
  isolation_method: string;
  verification_method: string;
}

interface LOTOProcedure {
  id: string;
  machine_id: string;
  name: string;
  version: number;
  energy_sources: EnergySource[];
  ppe_required: string[];
  special_instructions: string | null;
  is_approved: boolean;
  created_at: string;
}

interface LockStep {
  type: string;
  location: string;
  isolation_method: string;
  verification_method: string;
  locked: boolean;
  lock_id: string | null;
  locked_by: string | null;
  locked_at: string | null;
}

interface LOTOPermit {
  id: string;
  work_order_id: string;
  wo_number: string;
  procedure_id: string;
  procedure_name: string;
  machine_id: string;
  status: string;
  steps: LockStep[];
  authorized_by: string | null;
  authorized_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

// --- Constants ---

const ENERGY_TYPES = ['electrical', 'hydraulic', 'pneumatic', 'thermal', 'chemical', 'gravity'] as const;

const PPE_OPTIONS = ['Safety glasses', 'Gloves', 'Hard hat', 'Face shield', 'Arc flash suit'] as const;

const energyColor: Record<string, string> = {
  electrical: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  hydraulic: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  pneumatic: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
  thermal: 'bg-red-500/20 text-red-400 border-red-500/30',
  chemical: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  gravity: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const energyIcon: Record<string, React.ReactNode> = {
  electrical: <Zap className="h-3.5 w-3.5" />,
  hydraulic: <Droplets className="h-3.5 w-3.5" />,
  pneumatic: <Wind className="h-3.5 w-3.5" />,
  thermal: <Flame className="h-3.5 w-3.5" />,
  chemical: <FlaskConical className="h-3.5 w-3.5" />,
  gravity: <ArrowDown className="h-3.5 w-3.5" />,
};

const statusVariant: Record<string, 'muted' | 'info' | 'warning' | 'success'> = {
  draft: 'muted',
  active: 'info',
  work_in_progress: 'warning',
  completed: 'success',
};

const statusLabel: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  work_in_progress: 'Work In Progress',
  completed: 'Completed',
};

// --- Component ---

export default function SafetyPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'superadmin';

  const [activeTab, setActiveTab] = useState<'procedures' | 'permits'>('procedures');
  const [procedures, setProcedures] = useState<LOTOProcedure[]>([]);
  const [permits, setPermits] = useState<LOTOPermit[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create procedure dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [procName, setProcName] = useState('');
  const [procMachineId, setProcMachineId] = useState('');
  const [procSources, setProcSources] = useState<EnergySource[]>([
    { type: 'electrical', location: '', isolation_method: '', verification_method: '' },
  ]);
  const [procPPE, setProcPPE] = useState<string[]>([]);
  const [procInstructions, setProcInstructions] = useState('');

  // Expanded permit
  const [expandedPermit, setExpandedPermit] = useState<string | null>(null);
  const [lockInputs, setLockInputs] = useState<Record<string, string>>({});

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const getMachineName = (id: string) => {
    const m = machines.find((m) => m.id === id);
    return m?.asset_tag || m?.name || id.slice(0, 8);
  };

  const loadData = async () => {
    try {
      const [procs, m] = await Promise.all([
        api.getLOTOProcedures() as Promise<LOTOProcedure[]>,
        api.getMachines() as Promise<Machine[]>,
      ]);
      setProcedures(procs);
      setMachines(m);

      // Load permits separately (may fail if no permits exist yet)
      try {
        // We don't have a dedicated "get all permits" endpoint, so we get them via work orders
        // For now, attempt to load from the procedures endpoint pattern
        const wo = await api.getWorkOrders() as any[];
        const permitPromises = wo.map(async (w: any) => {
          try {
            const permit = await api.getWOLOTOPermit(w.id);
            return permit ? { ...permit, wo_number: w.wo_number } : null;
          } catch {
            return null;
          }
        });
        const results = await Promise.all(permitPromises);
        setPermits(results.filter(Boolean) as LOTOPermit[]);
      } catch { /* permits may not exist yet */ }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  // --- Create Procedure ---

  const addSource = () => {
    setProcSources([...procSources, { type: 'electrical', location: '', isolation_method: '', verification_method: '' }]);
  };

  const removeSource = (idx: number) => {
    setProcSources(procSources.filter((_, i) => i !== idx));
  };

  const updateSource = (idx: number, field: keyof EnergySource, value: string) => {
    const updated = [...procSources];
    updated[idx] = { ...updated[idx], [field]: value };
    setProcSources(updated);
  };

  const togglePPE = (item: string) => {
    setProcPPE((prev) => prev.includes(item) ? prev.filter((p) => p !== item) : [...prev, item]);
  };

  const handleCreateProcedure = async () => {
    if (!procName.trim() || !procMachineId || procSources.length === 0) return;
    setSubmitting(true);
    try {
      await api.createLOTOProcedure({
        machine_id: procMachineId,
        name: procName.trim(),
        energy_sources: procSources,
        ppe_required: procPPE,
        special_instructions: procInstructions.trim() || null,
      });
      setCreateOpen(false);
      resetCreateForm();
      await loadData();
      showFeedback('LOTO procedure created');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to create procedure');
    } finally {
      setSubmitting(false);
    }
  };

  const resetCreateForm = () => {
    setProcName('');
    setProcMachineId('');
    setProcSources([{ type: 'electrical', location: '', isolation_method: '', verification_method: '' }]);
    setProcPPE([]);
    setProcInstructions('');
  };

  // --- Lock / Unlock / Authorize / Complete ---

  const handleLock = async (permit: LOTOPermit, stepIdx: number) => {
    const key = `${permit.id}-${stepIdx}`;
    const lockId = lockInputs[key];
    if (!lockId?.trim()) {
      showFeedback('Enter a lock ID first');
      return;
    }
    try {
      await api.lockLOTOStep(permit.id, { step_idx: stepIdx, lock_id: lockId.trim() });
      setLockInputs((prev) => ({ ...prev, [key]: '' }));
      await loadData();
      showFeedback('Step locked');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to lock step');
    }
  };

  const handleUnlock = async (permit: LOTOPermit, stepIdx: number) => {
    try {
      await api.unlockLOTOStep(permit.id, { step_idx: stepIdx });
      await loadData();
      showFeedback('Step unlocked');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to unlock step');
    }
  };

  const handleAuthorize = async (permit: LOTOPermit) => {
    try {
      await api.authorizeLOTOPermit(permit.id);
      await loadData();
      showFeedback('Permit authorized — work may begin');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to authorize');
    }
  };

  const handleComplete = async (permit: LOTOPermit) => {
    try {
      await api.completeLOTOPermit(permit.id);
      await loadData();
      showFeedback('Permit completed');
    } catch (err: any) {
      showFeedback(err.message || 'Failed to complete');
    }
  };

  // --- Render ---

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  const activePermits = permits.filter((p) => p.status !== 'completed');

  return (
    <div>
      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Shield className="h-6 w-6 text-brand-400" />
          <h1 className="text-2xl font-bold text-foreground">LOTO / Safety</h1>
        </div>
        {isAdmin && activeTab === 'procedures' && (
          <Button size="sm" onClick={() => { resetCreateForm(); setProcMachineId(machines[0]?.id || ''); setCreateOpen(true); }}>
            <Plus className="h-4 w-4 mr-1" /> Create Procedure
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-secondary rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('procedures')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'procedures' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Procedures ({procedures.length})
        </button>
        <button
          onClick={() => setActiveTab('permits')}
          className={`px-4 py-2 text-sm rounded-md transition-colors ${activeTab === 'permits' ? 'bg-card text-foreground shadow-sm font-medium' : 'text-muted-foreground hover:text-foreground'}`}
        >
          Active Permits {activePermits.length > 0 && <span className="ml-1.5 px-1.5 py-0.5 text-xs bg-amber-500 text-white rounded-full">{activePermits.length}</span>}
        </button>
      </div>

      {/* ===== PROCEDURES TAB ===== */}
      {activeTab === 'procedures' && (
        <div className="space-y-3">
          {procedures.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Shield className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No LOTO procedures defined yet</p>
              <p className="text-sm text-muted-foreground mt-1">Create procedures to define energy isolation steps for each machine.</p>
              {isAdmin && (
                <Button size="sm" className="mt-3" onClick={() => { resetCreateForm(); setProcMachineId(machines[0]?.id || ''); setCreateOpen(true); }}>
                  <Plus className="h-4 w-4 mr-1" /> Create Procedure
                </Button>
              )}
            </div>
          ) : procedures.map((proc) => (
            <div key={proc.id} className="bg-card rounded-xl border border-border p-5">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{proc.name}</p>
                    <Badge variant="muted" className="text-[10px]">v{proc.version}</Badge>
                    {proc.is_approved ? (
                      <Badge variant="success">
                        <CheckCircle className="h-3 w-3 mr-0.5" /> Approved
                      </Badge>
                    ) : (
                      <Badge variant="warning">Pending Approval</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{getMachineName(proc.machine_id)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">{proc.energy_sources.length} energy source{proc.energy_sources.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Energy source badges */}
              <div className="flex flex-wrap gap-1.5 mt-3">
                {proc.energy_sources.map((src, i) => (
                  <div
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${energyColor[src.type] || energyColor.gravity}`}
                  >
                    {energyIcon[src.type]}
                    <span className="capitalize">{src.type}</span>
                    <span className="opacity-60">- {src.location}</span>
                  </div>
                ))}
              </div>

              {/* PPE badges */}
              {proc.ppe_required && proc.ppe_required.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {proc.ppe_required.map((ppe) => (
                    <Badge key={ppe} variant="muted" className="text-[10px]">{ppe}</Badge>
                  ))}
                </div>
              )}

              {/* Special instructions */}
              {proc.special_instructions && (
                <p className="text-xs text-muted-foreground mt-3 border-t border-border pt-3 italic">
                  {proc.special_instructions}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ===== ACTIVE PERMITS TAB ===== */}
      {activeTab === 'permits' && (
        <div className="space-y-3">
          {permits.length === 0 ? (
            <div className="text-center py-12 bg-card rounded-xl border border-border">
              <Lock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">No LOTO permits</p>
              <p className="text-sm text-muted-foreground mt-1">Permits are created from work orders that require energy isolation.</p>
            </div>
          ) : permits.map((permit) => {
            const isExpanded = expandedPermit === permit.id;
            const lockedCount = permit.steps?.filter((s) => s.locked).length || 0;
            const totalSteps = permit.steps?.length || 0;
            const allLocked = totalSteps > 0 && lockedCount === totalSteps;
            const allUnlocked = lockedCount === 0;

            return (
              <div key={permit.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Permit header */}
                <button
                  className="w-full p-5 text-left hover:bg-secondary/30 transition-colors"
                  onClick={() => setExpandedPermit(isExpanded ? null : permit.id)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-muted-foreground">{permit.wo_number}</span>
                        <Badge variant={statusVariant[permit.status] || 'muted'}>
                          {statusLabel[permit.status] || permit.status}
                        </Badge>
                      </div>
                      <p className="font-medium text-foreground mt-1">{permit.procedure_name}</p>
                      <p className="text-xs text-muted-foreground">{getMachineName(permit.machine_id)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium text-foreground">{lockedCount}/{totalSteps} locked</p>
                        {/* Progress bar */}
                        <div className="w-24 h-1.5 bg-secondary rounded-full mt-1">
                          <div
                            className="h-full bg-amber-500 rounded-full transition-all"
                            style={{ width: totalSteps > 0 ? `${(lockedCount / totalSteps) * 100}%` : '0%' }}
                          />
                        </div>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                    </div>
                  </div>
                </button>

                {/* Expanded steps */}
                {isExpanded && permit.steps && (
                  <div className="border-t border-border">
                    <div className="p-5 space-y-3">
                      {permit.steps.map((step, idx) => {
                        const key = `${permit.id}-${idx}`;
                        return (
                          <div
                            key={idx}
                            className={`rounded-lg border p-4 ${step.locked ? 'border-green-500/30 bg-green-500/5' : 'border-border bg-secondary/30'}`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium text-muted-foreground">Step {idx + 1}</span>
                                <div className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${energyColor[step.type] || energyColor.gravity}`}>
                                  {energyIcon[step.type]}
                                  <span className="capitalize">{step.type}</span>
                                </div>
                              </div>
                              {step.locked && (
                                <Badge variant="success" className="text-[10px]">
                                  <Lock className="h-2.5 w-2.5 mr-0.5" />
                                  Locked{step.locked_by ? ` by ${step.locked_by}` : ''}
                                  {step.locked_at ? ` at ${new Date(step.locked_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}
                                </Badge>
                              )}
                            </div>

                            <p className="text-sm text-foreground mt-2">
                              <span className="text-muted-foreground">{step.location}</span> — {step.isolation_method}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Verify: {step.verification_method}
                            </p>

                            {/* Lock / Unlock controls */}
                            <div className="flex items-center gap-2 mt-3">
                              {!step.locked ? (
                                <>
                                  <Input
                                    placeholder="Lock ID (e.g. L-042)"
                                    value={lockInputs[key] || ''}
                                    onChange={(e) => setLockInputs((prev) => ({ ...prev, [key]: e.target.value }))}
                                    className="h-8 w-40 text-xs"
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleLock(permit, idx); }}
                                  />
                                  <Button size="sm" className="h-8 text-xs" onClick={() => handleLock(permit, idx)}>
                                    <Lock className="h-3 w-3 mr-1" /> Lock
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleUnlock(permit, idx)}>
                                  <Unlock className="h-3 w-3 mr-1" /> Unlock
                                </Button>
                              )}
                            </div>

                            {step.locked && step.lock_id && (
                              <p className="text-[10px] text-muted-foreground mt-1.5">Lock ID: {step.lock_id}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="border-t border-border px-5 py-4 flex items-center gap-2">
                      {allLocked && permit.status === 'active' && isAdmin && (
                        <Button size="sm" onClick={() => handleAuthorize(permit)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Authorize &amp; Start Work
                        </Button>
                      )}
                      {allLocked && permit.status === 'draft' && isAdmin && (
                        <Button size="sm" onClick={() => handleAuthorize(permit)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Authorize &amp; Start Work
                        </Button>
                      )}
                      {permit.status === 'work_in_progress' && allUnlocked && (
                        <Button size="sm" variant="outline" onClick={() => handleComplete(permit)}>
                          <CheckCircle className="h-4 w-4 mr-1" /> Complete Permit
                        </Button>
                      )}
                      {!allLocked && permit.status !== 'completed' && (
                        <p className="text-xs text-muted-foreground">
                          {lockedCount === 0 ? 'Lock all energy sources to proceed' : `${totalSteps - lockedCount} source${totalSteps - lockedCount !== 1 ? 's' : ''} remaining`}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ===== CREATE PROCEDURE DIALOG ===== */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create LOTO Procedure</DialogTitle>
            <DialogDescription>
              Define the energy isolation steps for a machine. Each energy source must be locked out before work begins.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Machine */}
            <div>
              <Label>Machine *</Label>
              <Select value={procMachineId} onValueChange={setProcMachineId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Select machine..." /></SelectTrigger>
                <SelectContent>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Procedure name */}
            <div>
              <Label>Procedure Name *</Label>
              <Input
                value={procName}
                onChange={(e) => setProcName(e.target.value)}
                placeholder="e.g. Full Lockout — CNC Mill #2"
                className="mt-1"
              />
            </div>

            {/* Energy Sources */}
            <div>
              <div className="flex items-center justify-between">
                <Label>Energy Sources *</Label>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSource}>
                  <Plus className="h-3 w-3 mr-1" /> Add Source
                </Button>
              </div>

              <div className="space-y-3 mt-2">
                {procSources.map((src, idx) => (
                  <div key={idx} className="bg-secondary/50 rounded-lg border border-border p-4 relative">
                    {procSources.length > 1 && (
                      <button
                        className="absolute top-2 right-2 text-muted-foreground hover:text-red-400 text-xs"
                        onClick={() => removeSource(idx)}
                      >
                        Remove
                      </button>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label className="text-xs">Type</Label>
                        <Select value={src.type} onValueChange={(v) => updateSource(idx, 'type', v)}>
                          <SelectTrigger className="mt-1 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENERGY_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                <span className="capitalize">{t}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-xs">Location</Label>
                        <Input
                          value={src.location}
                          onChange={(e) => updateSource(idx, 'location', e.target.value)}
                          placeholder="e.g. Breaker CB-03"
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Isolation Method</Label>
                        <Input
                          value={src.isolation_method}
                          onChange={(e) => updateSource(idx, 'isolation_method', e.target.value)}
                          placeholder="e.g. Disconnect breaker CB-03"
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Verification Method</Label>
                        <Input
                          value={src.verification_method}
                          onChange={(e) => updateSource(idx, 'verification_method', e.target.value)}
                          placeholder="e.g. Try to start — confirm dead"
                          className="mt-1 h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* PPE Required */}
            <div>
              <Label>PPE Required</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PPE_OPTIONS.map((ppe) => (
                  <label
                    key={ppe}
                    className={`flex items-center gap-2 cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors ${
                      procPPE.includes(ppe)
                        ? 'border-brand-500 bg-brand-600/10 text-foreground'
                        : 'border-border bg-secondary/30 text-muted-foreground hover:border-border/80'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={procPPE.includes(ppe)}
                      onChange={() => togglePPE(ppe)}
                      className="h-3.5 w-3.5 rounded border-border bg-card text-brand-600 focus:ring-brand-500"
                    />
                    {ppe}
                  </label>
                ))}
              </div>
            </div>

            {/* Special Instructions */}
            <div>
              <Label>Special Instructions</Label>
              <Textarea
                value={procInstructions}
                onChange={(e) => setProcInstructions(e.target.value)}
                rows={3}
                className="mt-1 font-sans"
                placeholder="Any additional safety instructions, warnings, or notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={handleCreateProcedure}
              disabled={submitting || !procName.trim() || !procMachineId || procSources.length === 0}
            >
              {submitting ? 'Creating...' : 'Create Procedure'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
