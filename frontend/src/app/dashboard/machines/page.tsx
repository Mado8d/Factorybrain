'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { MachineForm, MachineFormData } from '@/components/dashboard/machine-form';

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

const statusConfig: Record<string, { color: string; label: string }> = {
  active: { color: 'bg-green-500/20 text-green-400', label: 'Running' },
  idle: { color: 'bg-muted text-muted-foreground', label: 'Idle' },
  alarm: { color: 'bg-red-500/20 text-red-400', label: 'Alarm' },
  maintenance: { color: 'bg-amber-500/20 text-amber-400', label: 'Maintenance' },
  inactive: { color: 'bg-muted text-muted-foreground/50', label: 'Inactive' },
};

export default function MachinesPage() {
  const { user } = useAuth();
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editMachine, setEditMachine] = useState<Machine | null>(null);
  const [deleteMachine, setDeleteMachine] = useState<Machine | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  const loadMachines = () => {
    api.getMachines()
      .then((data) => setMachines(data as Machine[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMachines(); }, []);

  const showFeedback = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(''), 3000);
  };

  const handleCreate = async (data: MachineFormData) => {
    setSubmitting(true);
    try {
      await api.createMachine(data);
      setAddOpen(false);
      loadMachines();
      showFeedback('Machine added successfully');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = async (data: MachineFormData) => {
    if (!editMachine) return;
    setSubmitting(true);
    try {
      await api.updateMachine(editMachine.id, data);
      setEditMachine(null);
      loadMachines();
      showFeedback('Machine updated successfully');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteMachine) return;
    setSubmitting(true);
    try {
      await api.deleteMachine(deleteMachine.id);
      setDeleteMachine(null);
      loadMachines();
      showFeedback('Machine deleted');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Machines</h1>
          <span className="text-sm text-muted-foreground">{machines.length} machines</span>
        </div>
        {isAdmin && (
          <Button onClick={() => setAddOpen(true)} size="sm">
            <Plus className="h-4 w-4 mr-1" /> Add Machine
          </Button>
        )}
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

      {machines.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No machines yet</p>
          <p className="text-sm text-muted-foreground mt-2">Add your first machine to get started.</p>
          {isAdmin && (
            <Button onClick={() => setAddOpen(true)} className="mt-4">
              <Plus className="h-4 w-4 mr-1" /> Add Machine
            </Button>
          )}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {/* Desktop table */}
          <div className="hidden md:block">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary">
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Machine</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Type</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Manufacturer</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Power</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Year</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Status</th>
                  {isAdmin && <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {machines.map((machine) => {
                  const config = statusConfig[machine.status] || statusConfig.inactive;
                  return (
                    <tr key={machine.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors group">
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/machines/${machine.id}`} className="hover:text-brand-400">
                          <p className="font-medium text-foreground">{machine.name}</p>
                          {machine.asset_tag && <p className="text-xs text-muted-foreground">{machine.asset_tag}</p>}
                        </Link>
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{machine.machine_type || '\u2014'}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">
                        {machine.manufacturer ? `${machine.manufacturer}${machine.model ? ` ${machine.model}` : ''}` : '\u2014'}
                      </td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{machine.rated_power_kw != null ? `${machine.rated_power_kw} kW` : '\u2014'}</td>
                      <td className="px-5 py-4 text-sm text-muted-foreground">{machine.year_installed || '\u2014'}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                      </td>
                      {isAdmin && (
                        <td className="px-5 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setEditMachine(machine)} title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeleteMachine(machine)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* Mobile card layout */}
          <div className="md:hidden divide-y divide-border">
            {machines.map((machine) => {
              const config = statusConfig[machine.status] || statusConfig.inactive;
              return (
                <Link key={machine.id} href={`/dashboard/machines/${machine.id}`} className="block p-4 hover:bg-accent transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <p className="font-medium text-foreground">{machine.name}</p>
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${config.color}`}>{config.label}</span>
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground">
                    {machine.machine_type && <span>{machine.machine_type}</span>}
                    {machine.manufacturer && <span>{machine.manufacturer}</span>}
                    {machine.rated_power_kw != null && <span>{machine.rated_power_kw} kW</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Add Machine Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Machine</DialogTitle>
            <DialogDescription>Add a new machine to your factory.</DialogDescription>
          </DialogHeader>
          <MachineForm mode="create" onSubmit={handleCreate} isSubmitting={submitting} />
        </DialogContent>
      </Dialog>

      {/* Edit Machine Dialog */}
      <Dialog open={!!editMachine} onOpenChange={(open) => { if (!open) setEditMachine(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Machine</DialogTitle>
            <DialogDescription>Update machine details.</DialogDescription>
          </DialogHeader>
          {editMachine && (
            <MachineForm
              mode="edit"
              defaultValues={{
                name: editMachine.name,
                asset_tag: editMachine.asset_tag || '',
                machine_type: editMachine.machine_type || '',
                manufacturer: editMachine.manufacturer || '',
                model: editMachine.model || '',
                year_installed: editMachine.year_installed || undefined,
                rated_power_kw: editMachine.rated_power_kw || undefined,
                status: editMachine.status,
                specifications: editMachine.specifications,
              }}
              onSubmit={handleEdit}
              isSubmitting={submitting}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteMachine} onOpenChange={(open) => { if (!open) setDeleteMachine(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Machine</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteMachine?.name}</strong>? This will also unassign all sensor nodes from this machine. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting ? 'Deleting...' : 'Delete Machine'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
