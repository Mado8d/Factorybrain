'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, Trash2, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

interface SensorNode {
  id: string;
  machine_id: string | null;
  node_type: string;
  firmware_ver: string | null;
  hw_revision: string | null;
  last_seen: string | null;
  config: Record<string, any>;
  is_active: boolean;
  created_at: string;
}

interface Machine {
  id: string;
  name: string;
  asset_tag: string | null;
}

const nodeTypeVariant: Record<string, 'default' | 'success' | 'warning' | 'info'> = {
  vibesense: 'default',
  energysense: 'success',
  climatesense: 'info',
  acoustisense: 'warning',
  multisense: 'default',
};

export default function SensorsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager' || user?.role === 'superadmin';
  const [nodes, setNodes] = useState<SensorNode[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [filter, setFilter] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [submitting, setSubmitting] = useState(false);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newId, setNewId] = useState('');
  const [newType, setNewType] = useState('vibesense');
  const [newFw, setNewFw] = useState('');
  const [newMachineId, setNewMachineId] = useState('');
  const [createError, setCreateError] = useState('');

  // Edit dialog
  const [editNode, setEditNode] = useState<SensorNode | null>(null);
  const [editFw, setEditFw] = useState('');
  const [editMachineId, setEditMachineId] = useState('');
  const [editActive, setEditActive] = useState(true);

  // Delete dialog
  const [deleteNode, setDeleteNode] = useState<SensorNode | null>(null);

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  const loadData = async () => {
    try {
      const [n, m] = await Promise.all([
        api.getNodes() as Promise<SensorNode[]>,
        api.getMachines() as Promise<Machine[]>,
      ]);
      setNodes(n);
      setMachines(m);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadData(); }, []);

  const getMachineName = (id: string | null) => {
    if (!id) return null;
    const m = machines.find((m) => m.id === id);
    return m?.asset_tag || m?.name || id.slice(0, 8);
  };

  const filteredNodes = nodes.filter((n) => {
    if (filter === 'assigned' && !n.machine_id) return false;
    if (filter === 'unassigned' && n.machine_id) return false;
    if (typeFilter !== 'all' && n.node_type !== typeFilter) return false;
    return true;
  });

  const nodeTypes = Array.from(new Set(nodes.map((n) => n.node_type)));

  const handleCreate = async () => {
    if (!newId.trim()) { setCreateError('Sensor ID is required'); return; }
    setSubmitting(true);
    setCreateError('');
    try {
      await api.createNode({
        id: newId.trim(),
        node_type: newType,
        firmware_ver: newFw || undefined,
        machine_id: newMachineId && newMachineId !== 'none' ? newMachineId : undefined,
      });
      setCreateOpen(false);
      setNewId(''); setNewFw(''); setNewMachineId('');
      await loadData();
      showFeedback('Sensor created');
    } catch (err: any) {
      setCreateError(err.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  const openEdit = (node: SensorNode) => {
    setEditNode(node);
    setEditFw(node.firmware_ver || '');
    setEditMachineId(node.machine_id || '');
    setEditActive(node.is_active);
  };

  const handleEdit = async () => {
    if (!editNode) return;
    setSubmitting(true);
    try {
      // Update node properties
      await api.updateNode(editNode.id, {
        firmware_ver: editFw || undefined,
        is_active: editActive,
      });
      // Handle machine reassignment
      const currentMachine = editNode.machine_id || '';
      if (editMachineId !== currentMachine) {
        await api.assignNodeToMachine(editNode.id, editMachineId && editMachineId !== 'none' ? editMachineId : null);
      }
      setEditNode(null);
      await loadData();
      showFeedback('Sensor updated');
    } catch (err: any) {
      showFeedback(err.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deleteNode) return;
    setSubmitting(true);
    try {
      await api.deleteNode(deleteNode.id);
      setDeleteNode(null);
      await loadData();
      showFeedback('Sensor deleted');
    } catch (err: any) {
      showFeedback(err.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Sensors</h1>
          <span className="text-sm text-muted-foreground">{nodes.length} nodes</span>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Sensor
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {['all', 'assigned', 'unassigned'].map((f) => (
          <button key={f} onClick={() => setFilter(f as any)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${filter === f ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}>
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
        <div className="w-px bg-border mx-1" />
        <button onClick={() => setTypeFilter('all')}
          className={`px-3 py-1.5 text-xs rounded-md transition-colors ${typeFilter === 'all' ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}>
          All Types
        </button>
        {nodeTypes.map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${typeFilter === t ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent'}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredNodes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No sensors found</p>
          {isAdmin && (
            <Button size="sm" className="mt-3" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Sensor
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Sensor ID</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Type</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Machine</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Firmware</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Last Seen</th>
                {isAdmin && <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {filteredNodes.map((node) => (
                <tr key={node.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${node.is_active ? 'bg-green-500' : 'bg-gray-500'}`} />
                      <span className="font-medium text-foreground font-mono text-sm">{node.id}</span>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={nodeTypeVariant[node.node_type] || 'default'}>{node.node_type}</Badge>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    {node.machine_id ? (
                      <span className="text-foreground">{getMachineName(node.machine_id)}</span>
                    ) : (
                      <span className="text-muted-foreground italic">Unassigned</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-muted-foreground font-mono">{node.firmware_ver || '\u2014'}</td>
                  <td className="px-5 py-4">
                    <Badge variant={node.is_active ? 'success' : 'muted'}>{node.is_active ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td className="px-5 py-4 text-xs text-muted-foreground">
                    {node.last_seen ? new Date(node.last_seen).toLocaleString('en-GB') : '\u2014'}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(node)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeleteNode(node)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Sensor Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Sensor</DialogTitle>
            <DialogDescription>Register a new sensor node.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Sensor ID *</Label>
              <Input value={newId} onChange={(e) => setNewId(e.target.value)} placeholder="e.g. VS-004" className="mt-1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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
              <Label>Firmware Version</Label>
              <Input value={newFw} onChange={(e) => setNewFw(e.target.value)} placeholder="e.g. 1.0.0" className="mt-1" />
            </div>
            <div>
              <Label>Assign to Machine</Label>
              <Select value={newMachineId} onValueChange={setNewMachineId}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="None (unassigned)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (unassigned)</SelectItem>
                  {machines.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createError && <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm px-3 py-2 rounded-lg">{createError}</div>}
          </div>
          <DialogFooter>
            <Button onClick={handleCreate} disabled={submitting}>{submitting ? 'Adding...' : 'Add Sensor'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Sensor Dialog */}
      <Dialog open={!!editNode} onOpenChange={(open) => { if (!open) setEditNode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Sensor: {editNode?.id}</DialogTitle>
            <DialogDescription>Update sensor properties or reassign to another machine.</DialogDescription>
          </DialogHeader>
          {editNode && (
            <div className="space-y-4">
              <div>
                <Label>Type</Label>
                <Input value={editNode.node_type} disabled className="mt-1" />
              </div>
              <div>
                <Label>Firmware Version</Label>
                <Input value={editFw} onChange={(e) => setEditFw(e.target.value)} placeholder="e.g. 1.0.0" className="mt-1" />
              </div>
              <div>
                <Label>Assign to Machine</Label>
                <Select value={editMachineId} onValueChange={setEditMachineId}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="None (unassigned)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (unassigned)</SelectItem>
                    {machines.map((m) => (
                      <SelectItem key={m.id} value={m.id}>{m.asset_tag || m.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label>Active</Label>
                <button onClick={() => setEditActive(!editActive)}
                  className={`w-10 h-6 rounded-full transition-colors ${editActive ? 'bg-green-500' : 'bg-gray-500'}`}>
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${editActive ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                <span className="text-sm text-muted-foreground">{editActive ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={handleEdit} disabled={submitting}>{submitting ? 'Saving...' : 'Save Changes'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteNode} onOpenChange={(open) => { if (!open) setDeleteNode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Sensor</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete sensor <strong>{deleteNode?.id}</strong>? This will remove all associated data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting ? 'Deleting...' : 'Delete Sensor'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
