'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, Trash2, AlertTriangle, Barcode, Printer } from 'lucide-react';
import Barcode128 from 'react-barcode';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from '@/components/ui/alert-dialog';

interface SparePart {
  id: string;
  name: string;
  part_number: string | null;
  description: string | null;
  category: string | null;
  supplier: string | null;
  unit_cost: number | null;
  quantity_in_stock: number;
  min_stock_level: number;
  location: string | null;
  machine_ids: string[] | null;
  is_active: boolean;
}

export default function PartsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Create/Edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPart, setEditPart] = useState<SparePart | null>(null);
  const [formName, setFormName] = useState('');
  const [formPartNo, setFormPartNo] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formSupplier, setFormSupplier] = useState('');
  const [formCost, setFormCost] = useState('');
  const [formQty, setFormQty] = useState('0');
  const [formMinStock, setFormMinStock] = useState('1');
  const [formLocation, setFormLocation] = useState('');

  // Delete dialog
  const [deletePart, setDeletePart] = useState<SparePart | null>(null);

  // Barcode dialog
  const [barcodePart, setBarcodePart] = useState<SparePart | null>(null);

  const handlePrintBarcode = () => {
    const el = document.getElementById('barcode-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=400,height=300');
    if (!win) return;
    win.document.write(`
      <html><head><title>Print Label</title>
      <style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif}
      .label{text-align:center;padding:10px}
      .label p{margin:4px 0;font-size:12px}
      .label .name{font-weight:bold;font-size:14px}
      @media print{body{margin:0}}</style></head>
      <body><div class="label">${el.innerHTML}</div>
      <script>window.onload=function(){window.print();window.close()}</script></body></html>
    `);
    win.document.close();
  };

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  const loadParts = async () => {
    try {
      const data = await api.getSpareParts() as SparePart[];
      setParts(data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadParts(); }, []);

  const openCreate = () => {
    setEditPart(null);
    setFormName(''); setFormPartNo(''); setFormCategory(''); setFormSupplier('');
    setFormCost(''); setFormQty('0'); setFormMinStock('1'); setFormLocation('');
    setDialogOpen(true);
  };

  const openEdit = (part: SparePart) => {
    setEditPart(part);
    setFormName(part.name);
    setFormPartNo(part.part_number || '');
    setFormCategory(part.category || '');
    setFormSupplier(part.supplier || '');
    setFormCost(part.unit_cost?.toString() || '');
    setFormQty(part.quantity_in_stock.toString());
    setFormMinStock(part.min_stock_level.toString());
    setFormLocation(part.location || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) return;
    setSubmitting(true);
    try {
      const data: any = { name: formName.trim() };
      if (formPartNo.trim()) data.part_number = formPartNo.trim();
      if (formCategory.trim()) data.category = formCategory.trim();
      if (formSupplier.trim()) data.supplier = formSupplier.trim();
      if (formCost) data.unit_cost = parseFloat(formCost);
      data.quantity_in_stock = parseInt(formQty) || 0;
      data.min_stock_level = parseInt(formMinStock) || 1;
      if (formLocation.trim()) data.location = formLocation.trim();

      if (editPart) {
        await api.updateSparePart(editPart.id, data);
        showFeedback('Part updated');
      } else {
        await api.createSparePart(data);
        showFeedback('Part added');
      }
      setDialogOpen(false);
      await loadParts();
    } catch (err: any) {
      showFeedback(err.message || 'Failed');
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!deletePart) return;
    setSubmitting(true);
    try {
      await api.deleteSparePart(deletePart.id);
      setDeletePart(null);
      await loadParts();
      showFeedback('Part removed');
    } catch { showFeedback('Failed'); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  const lowStock = parts.filter(p => p.quantity_in_stock <= p.min_stock_level);

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">{feedback}</div>
      )}

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Spare Parts</h1>
          <span className="text-sm text-muted-foreground">{parts.length} items</span>
        </div>
        {isAdmin && (
          <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Part</Button>
        )}
      </div>

      {/* Low stock warning */}
      {lowStock.length > 0 && (
        <div className="mb-4 bg-amber-500/10 border border-amber-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            <p className="text-sm font-medium text-amber-400">Low Stock Alert ({lowStock.length} items)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {lowStock.map(p => (
              <Badge key={p.id} variant="warning">{p.name}: {p.quantity_in_stock}/{p.min_stock_level}</Badge>
            ))}
          </div>
        </div>
      )}

      {/* Parts table */}
      {parts.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No spare parts yet</p>
          {isAdmin && <Button size="sm" className="mt-3" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Part</Button>}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-secondary">
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Part</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Part #</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Category</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Supplier</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Stock</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Cost</th>
                <th className="text-left text-xs font-medium text-muted-foreground px-5 py-3">Location</th>
                {isAdmin && <th className="text-right text-xs font-medium text-muted-foreground px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => {
                const isLow = part.quantity_in_stock <= part.min_stock_level;
                return (
                  <tr key={part.id} className="border-b border-border last:border-0 hover:bg-accent transition-colors group">
                    <td className="px-5 py-4">
                      <p className="font-medium text-foreground">{part.name}</p>
                      {part.description && <p className="text-xs text-muted-foreground">{part.description}</p>}
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground font-mono">{part.part_number || '\u2014'}</td>
                    <td className="px-5 py-4"><Badge variant="muted">{part.category || 'General'}</Badge></td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{part.supplier || '\u2014'}</td>
                    <td className="px-5 py-4">
                      <span className={`text-sm font-medium ${isLow ? 'text-red-400' : 'text-foreground'}`}>
                        {part.quantity_in_stock}
                      </span>
                      <span className="text-xs text-muted-foreground"> / min {part.min_stock_level}</span>
                    </td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{part.unit_cost != null ? `€${part.unit_cost}` : '\u2014'}</td>
                    <td className="px-5 py-4 text-sm text-muted-foreground">{part.location || '\u2014'}</td>
                    {isAdmin && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setBarcodePart(part)} title="Barcode"><Barcode className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(part)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300" onClick={() => setDeletePart(part)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPart ? 'Edit Part' : 'Add Spare Part'}</DialogTitle>
            <DialogDescription>{editPart ? 'Update part details.' : 'Add a new spare part to inventory.'}</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>Name *</Label>
              <Input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="e.g. Bearing SKF 6205" className="mt-1" />
            </div>
            <div>
              <Label>Part Number</Label>
              <Input value={formPartNo} onChange={(e) => setFormPartNo(e.target.value)} placeholder="e.g. SKF-6205-2RS" className="mt-1" />
            </div>
            <div>
              <Label>Category</Label>
              <Input value={formCategory} onChange={(e) => setFormCategory(e.target.value)} placeholder="e.g. Bearings" className="mt-1" />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={formSupplier} onChange={(e) => setFormSupplier(e.target.value)} placeholder="e.g. SKF" className="mt-1" />
            </div>
            <div>
              <Label>Unit Cost (€)</Label>
              <Input type="number" step="0.01" value={formCost} onChange={(e) => setFormCost(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
            <div>
              <Label>Quantity in Stock</Label>
              <Input type="number" value={formQty} onChange={(e) => setFormQty(e.target.value)} className="mt-1" />
            </div>
            <div>
              <Label>Min Stock Level</Label>
              <Input type="number" value={formMinStock} onChange={(e) => setFormMinStock(e.target.value)} className="mt-1" />
            </div>
            <div className="col-span-2">
              <Label>Storage Location</Label>
              <Input value={formLocation} onChange={(e) => setFormLocation(e.target.value)} placeholder="e.g. Warehouse A, Shelf 3" className="mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={submitting || !formName.trim()}>
              {submitting ? 'Saving...' : editPart ? 'Save Changes' : 'Add Part'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Barcode Label Dialog */}
      <Dialog open={!!barcodePart} onOpenChange={(open) => { if (!open) setBarcodePart(null); }}>
        <DialogContent className="max-w-sm text-center">
          <DialogHeader>
            <DialogTitle>Part Label</DialogTitle>
            <DialogDescription>{barcodePart?.name}</DialogDescription>
          </DialogHeader>
          <div id="barcode-print-area" className="flex flex-col items-center py-4 bg-white rounded-lg">
            {barcodePart && (
              <>
                <Barcode128
                  value={barcodePart.part_number || barcodePart.id.slice(0, 12)}
                  width={2}
                  height={60}
                  fontSize={12}
                  background="#ffffff"
                  lineColor="#000000"
                />
                <p style={{ color: '#000', fontWeight: 'bold', fontSize: '14px', margin: '8px 0 2px' }}>{barcodePart.name}</p>
                {barcodePart.part_number && <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>{barcodePart.part_number}</p>}
                {barcodePart.location && <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>Loc: {barcodePart.location}</p>}
              </>
            )}
          </div>
          <DialogFooter className="justify-center">
            <Button onClick={handlePrintBarcode}>
              <Printer className="h-4 w-4 mr-1" /> Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletePart} onOpenChange={(open) => { if (!open) setDeletePart(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Part</AlertDialogTitle>
            <AlertDialogDescription>Remove <strong>{deletePart?.name}</strong> from inventory?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={submitting}>
              {submitting ? 'Removing...' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
