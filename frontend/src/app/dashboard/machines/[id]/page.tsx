'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { FlexibleChart } from '@/components/dashboard/flexible-chart';
import { DateRangePicker, ComparisonRange } from '@/components/dashboard/date-range-picker';
import { Pencil, Plus, Unplug, Power, PowerOff, ArrowLeft, QrCode, Download } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { MachineForm, MachineFormData } from '@/components/dashboard/machine-form';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  specifications: Record<string, any>;
}

interface SensorNode {
  id: string;
  machine_id: string | null;
  node_type: string;
  firmware_ver: string | null;
  hw_revision: string | null;
  last_seen: string | null;
  config: Record<string, any>;
  is_active: boolean;
}

const statusBadge: Record<string, { variant: 'success' | 'warning' | 'destructive' | 'muted'; label: string }> = {
  active: { variant: 'success', label: 'Running' },
  idle: { variant: 'muted', label: 'Idle' },
  alarm: { variant: 'destructive', label: 'Alarm' },
  maintenance: { variant: 'warning', label: 'Maintenance' },
  inactive: { variant: 'muted', label: 'Inactive' },
};

export default function MachineDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const machineId = params.id as string;
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const [machine, setMachine] = useState<Machine | null>(null);
  const [nodes, setNodes] = useState<SensorNode[]>([]);
  const [allNodes, setAllNodes] = useState<SensorNode[]>([]);
  const [telemetryHistory, setTelemetryHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [addSensorOpen, setAddSensorOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [unassignNode, setUnassignNode] = useState<SensorNode | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [thresholds, setThresholds] = useState<Record<string, { value: number; is_custom: boolean; default: number }> | null>(null);
  const [editingThresholds, setEditingThresholds] = useState<Record<string, string>>({});

  // Add sensor form state
  const [newNodeId, setNewNodeId] = useState('');
  const [newNodeType, setNewNodeType] = useState('vibesense');
  const [newNodeFw, setNewNodeFw] = useState('');
  const [newNodeError, setNewNodeError] = useState('');

  const [dateRange, setDateRange] = useState<ComparisonRange>({
    primary: {
      start: new Date(Date.now() - 6 * 3600000).toISOString(),
      end: new Date().toISOString(),
    },
  });

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const loadData = async () => {
    try {
      const [machineData, nodesData] = await Promise.all([
        api.getMachine(machineId) as Promise<Machine>,
        api.getNodes() as Promise<SensorNode[]>,
      ]);
      setMachine(machineData);
      setAllNodes(nodesData);
      setNodes(nodesData.filter((n: any) => n.machine_id === machineId));
      // Load thresholds
      try {
        const t = await api.getMachineThresholds(machineId) as Record<string, { value: number; is_custom: boolean; default: number }>;
        setThresholds(t);
      } catch { /* ignore if endpoint not available yet */ }
    } catch {
      router.push('/dashboard/machines');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, [machineId]);

  useEffect(() => {
    if (nodes.length === 0) return;
    api
      .getTelemetryHistory({
        node_id: nodes[0].id,
        start: dateRange.primary.start,
        end: dateRange.primary.end,
      })
      .then((data) => setTelemetryHistory(data as any[]))
      .catch(console.error);
  }, [nodes, dateRange.primary.start, dateRange.primary.end]);

  const handleEdit = async (data: MachineFormData) => {
    setSubmitting(true);
    try {
      await api.updateMachine(machineId, data);
      setEditOpen(false);
      await loadData();
      showFeedback('Machine updated');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    try {
      await api.updateMachine(machineId, { status: newStatus });
      setMachine((m) => m ? { ...m, status: newStatus } : m);
      showFeedback('Status updated');
    } catch (err: any) {
      showFeedback('Failed to update status');
    }
  };

  const handleAddSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewNodeError('');
    if (!newNodeId.trim()) { setNewNodeError('Sensor ID is required'); return; }
    setSubmitting(true);
    try {
      await api.createNode({
        id: newNodeId.trim(),
        machine_id: machineId,
        node_type: newNodeType,
        firmware_ver: newNodeFw || undefined,
      });
      setAddSensorOpen(false);
      setNewNodeId('');
      setNewNodeFw('');
      await loadData();
      showFeedback('Sensor added');
    } catch (err: any) {
      setNewNodeError(err.message || 'Failed to add sensor');
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssign = async (nodeId: string) => {
    setSubmitting(true);
    try {
      await api.assignNodeToMachine(nodeId, machineId);
      setAssignOpen(false);
      await loadData();
      showFeedback('Sensor assigned');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassign = async () => {
    if (!unassignNode) return;
    setSubmitting(true);
    try {
      await api.assignNodeToMachine(unassignNode.id, null);
      setUnassignNode(null);
      await loadData();
      showFeedback('Sensor unassigned');
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleActive = async (node: SensorNode) => {
    try {
      await api.updateNode(node.id, { is_active: !node.is_active });
      await loadData();
      showFeedback(`Sensor ${node.is_active ? 'deactivated' : 'activated'}`);
    } catch {
      showFeedback('Failed to update sensor');
    }
  };

  if (loading || !machine) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  const unassignedNodes = allNodes.filter((n) => !n.machine_id);
  const sb = statusBadge[machine.status] || statusBadge.inactive;

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
          <button onClick={() => router.push('/dashboard/machines')} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-foreground">{machine.name}</h1>
              <Badge variant={sb.variant}>{sb.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {machine.asset_tag && `${machine.asset_tag} · `}
              {machine.machine_type || 'Machine'}{' '}
              {machine.manufacturer && `· ${machine.manufacturer} ${machine.model || ''}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setQrOpen(true)}>
            <QrCode className="h-3.5 w-3.5 mr-1" /> QR
          </Button>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Status</p>
          {isAdmin ? (
            <Select value={machine.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="mt-1 h-8 text-sm border-0 bg-transparent p-0 focus:ring-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="idle">Idle</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <p className="text-lg font-semibold text-foreground mt-1 capitalize">{machine.status}</p>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Rated Power</p>
          <p className="text-lg font-semibold text-foreground mt-1">{machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '\u2014'}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Year Installed</p>
          <p className="text-lg font-semibold text-foreground mt-1">{machine.year_installed || '\u2014'}</p>
        </div>
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground">Sensors</p>
          <p className="text-lg font-semibold text-foreground mt-1">{nodes.length}</p>
        </div>
      </div>

      {/* Specifications */}
      {machine.specifications && Object.keys(machine.specifications).length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Specifications</h2>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(machine.specifications).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground">{key}</p>
                  <p className="text-sm font-medium text-foreground">{String(value)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Thresholds */}
      {thresholds && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground mb-3">Thresholds</h2>
          <div className="bg-card rounded-xl border border-border p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(thresholds).map(([key, t]) => {
                const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                const isEditing = editingThresholds[key] !== undefined;
                return (
                  <div key={key} className={`p-3 rounded-lg ${t.is_custom ? 'bg-brand-600/10 border border-brand-600/30' : 'bg-secondary'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {t.is_custom && <Badge variant="default" className="text-[10px] px-1.5 py-0">Custom</Badge>}
                    </div>
                    {isAdmin && isEditing ? (
                      <div className="flex items-center gap-1 mt-1">
                        <Input
                          type="number"
                          step="0.1"
                          value={editingThresholds[key]}
                          onChange={(e) => setEditingThresholds({ ...editingThresholds, [key]: e.target.value })}
                          className="h-7 text-sm w-20"
                        />
                        <Button size="sm" className="h-7 px-2 text-xs" onClick={async () => {
                          const val = parseFloat(editingThresholds[key]);
                          if (isNaN(val)) return;
                          try {
                            const result = await api.updateMachineThresholds(machineId, { [key]: val }) as any;
                            setThresholds(result);
                            showFeedback('Threshold updated');
                          } catch { showFeedback('Failed'); }
                          setEditingThresholds(prev => { const n = { ...prev }; delete n[key]; return n; });
                        }}>OK</Button>
                        {t.is_custom && (
                          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={async () => {
                            try {
                              const result = await api.updateMachineThresholds(machineId, { [key]: null }) as any;
                              setThresholds(result);
                              showFeedback('Reset to default');
                            } catch { showFeedback('Failed'); }
                            setEditingThresholds(prev => { const n = { ...prev }; delete n[key]; return n; });
                          }}>Reset</Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 px-1 text-xs" onClick={() => {
                          setEditingThresholds(prev => { const n = { ...prev }; delete n[key]; return n; });
                        }}>X</Button>
                      </div>
                    ) : (
                      <p
                        className={`text-lg font-semibold mt-1 ${isAdmin ? 'cursor-pointer hover:text-brand-400' : ''} ${t.is_custom ? 'text-brand-400' : 'text-foreground'}`}
                        onClick={() => isAdmin && setEditingThresholds({ ...editingThresholds, [key]: String(t.value) })}
                      >
                        {t.value}
                        {!t.is_custom && <span className="text-xs font-normal text-muted-foreground ml-1">(default)</span>}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            {isAdmin && <p className="text-xs text-muted-foreground mt-3">Click a value to customize. Custom thresholds override tenant defaults for this machine.</p>}
          </div>
        </div>
      )}

      {/* Sensor Nodes */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-foreground">Sensor Nodes</h2>
          {isAdmin && (
            <div className="flex gap-2">
              {unassignedNodes.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setAssignOpen(true)}>
                  <Unplug className="h-3.5 w-3.5 mr-1" /> Assign Existing
                </Button>
              )}
              <Button size="sm" onClick={() => setAddSensorOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Sensor
              </Button>
            </div>
          )}
        </div>

        {nodes.length === 0 ? (
          <div className="text-center py-8 bg-card rounded-xl border border-border">
            <p className="text-muted-foreground">No sensors assigned to this machine.</p>
            {isAdmin && (
              <Button size="sm" className="mt-3" onClick={() => setAddSensorOpen(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Sensor
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {nodes.map((node) => (
              <div key={node.id} className="bg-card rounded-xl border border-border p-4 group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-green-500' : 'bg-gray-500'}`} />
                    <p className="font-medium text-foreground font-mono text-sm">{node.id}</p>
                  </div>
                  {isAdmin && (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => handleToggleActive(node)}
                        title={node.is_active ? 'Deactivate' : 'Activate'}
                      >
                        {node.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5 text-green-400" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-400 hover:text-red-300"
                        onClick={() => setUnassignNode(node)}
                        title="Unassign"
                      >
                        <Unplug className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <Badge variant="default" className="text-xs">{node.node_type}</Badge>
                  <p className="text-xs text-muted-foreground">FW {node.firmware_ver || '?'}{node.hw_revision ? ` · HW ${node.hw_revision}` : ''}</p>
                  {node.last_seen && (
                    <p className="text-xs text-muted-foreground">Last seen: {new Date(node.last_seen).toLocaleString('en-GB')}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Telemetry Charts */}
      {telemetryHistory.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-foreground">Telemetry</h2>
          </div>
          <div className="mb-4">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FlexibleChart
              data={telemetryHistory}
              chartType="line"
              dataKeys={[
                { key: 'vib_rms_x', name: 'RMS X', color: '#3b82f6' },
                { key: 'vib_rms_y', name: 'RMS Y', color: '#10b981' },
                { key: 'vib_rms_z', name: 'RMS Z', color: '#f59e0b' },
              ]}
              title="Vibration Trend"
            />
            <FlexibleChart
              data={telemetryHistory}
              chartType="area"
              dataKeys={[{ key: 'anomaly_score', name: 'Anomaly', color: '#8b5cf6' }]}
              title="Anomaly Score"
              thresholds={[{ value: 0.5, color: '#ef4444', label: 'Threshold' }]}
            />
          </div>
        </div>
      )}

      {/* QR Code Dialog */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>QR Code — {machine.name}</DialogTitle>
            <DialogDescription>Scan to open this machine&apos;s detail page.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center py-4">
            <div className="bg-white p-4 rounded-lg" id="qr-container">
              <QRCodeSVG
                value={typeof window !== 'undefined' ? window.location.href : `${machineId}`}
                size={200}
                level="M"
              />
              <p className="text-xs text-gray-600 mt-2 font-mono">{machine.asset_tag || machine.name}</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => {
            const svg = document.querySelector('#qr-container svg');
            if (!svg) return;
            const svgData = new XMLSerializer().serializeToString(svg);
            const canvas = document.createElement('canvas');
            canvas.width = 250; canvas.height = 280;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, 250, 280);
            const img = new Image();
            img.onload = () => {
              ctx.drawImage(img, 25, 10, 200, 200);
              ctx.fillStyle = 'black';
              ctx.font = '12px monospace';
              ctx.textAlign = 'center';
              ctx.fillText(machine.asset_tag || machine.name, 125, 240);
              ctx.fillText(machine.machine_type || '', 125, 258);
              const link = document.createElement('a');
              link.download = `qr-${machine.asset_tag || machine.id}.png`;
              link.href = canvas.toDataURL('image/png');
              link.click();
            };
            img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
          }}>
            <Download className="h-3.5 w-3.5 mr-1" /> Download PNG
          </Button>
        </DialogContent>
      </Dialog>

      {/* Edit Machine Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Machine</DialogTitle>
            <DialogDescription>Update machine details.</DialogDescription>
          </DialogHeader>
          <MachineForm
            mode="edit"
            defaultValues={{
              name: machine.name,
              asset_tag: machine.asset_tag || '',
              machine_type: machine.machine_type || '',
              manufacturer: machine.manufacturer || '',
              model: machine.model || '',
              year_installed: machine.year_installed || undefined,
              rated_power_kw: machine.rated_power_kw || undefined,
              status: machine.status,
              specifications: machine.specifications,
            }}
            onSubmit={handleEdit}
            isSubmitting={submitting}
          />
        </DialogContent>
      </Dialog>

      {/* Add Sensor Dialog */}
      <Dialog open={addSensorOpen} onOpenChange={setAddSensorOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Sensor</DialogTitle>
            <DialogDescription>Create a new sensor node for this machine.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddSensor} className="space-y-4">
            <div>
              <Label htmlFor="node_id">Sensor ID *</Label>
              <Input id="node_id" value={newNodeId} onChange={(e) => setNewNodeId(e.target.value)} placeholder="e.g. VS-004" className="mt-1" />
            </div>
            <div>
              <Label htmlFor="node_type">Sensor Type</Label>
              <Select value={newNodeType} onValueChange={setNewNodeType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vibesense">VibeSense</SelectItem>
                  <SelectItem value="energysense">EnergySense</SelectItem>
                  <SelectItem value="climatesense">ClimateSense</SelectItem>
                  <SelectItem value="acoustisense">AcoustiSense</SelectItem>
                  <SelectItem value="multisense">MultiSense</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="firmware">Firmware Version</Label>
              <Input id="firmware" value={newNodeFw} onChange={(e) => setNewNodeFw(e.target.value)} placeholder="e.g. 1.0.0" className="mt-1" />
            </div>
            {newNodeError && (
              <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm px-3 py-2 rounded-lg">{newNodeError}</div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Adding...' : 'Add Sensor'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Assign Existing Sensor Dialog */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Existing Sensor</DialogTitle>
            <DialogDescription>Assign an unassigned sensor node to this machine.</DialogDescription>
          </DialogHeader>
          {unassignedNodes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No unassigned sensors available.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {unassignedNodes.map((node) => (
                <div key={node.id} className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-foreground font-mono">{node.id}</p>
                    <p className="text-xs text-muted-foreground">{node.node_type} · FW {node.firmware_ver || '?'}</p>
                  </div>
                  <Button size="sm" onClick={() => handleAssign(node.id)} disabled={submitting}>
                    Assign
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Unassign Confirmation */}
      <AlertDialog open={!!unassignNode} onOpenChange={(open) => { if (!open) setUnassignNode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unassign Sensor</AlertDialogTitle>
            <AlertDialogDescription>
              Unassign sensor <strong>{unassignNode?.id}</strong> from this machine? The sensor will remain in the system but won&apos;t be linked to any machine.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUnassign} disabled={submitting}>
              {submitting ? 'Unassigning...' : 'Unassign'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
