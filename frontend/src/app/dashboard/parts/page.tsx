'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, Trash2, Barcode, Printer, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Database } from 'lucide-react';
import Barcode128 from 'react-barcode';
import { Button } from '@/components/ui/button';
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

type SortField = 'name' | 'quantity_in_stock' | 'unit_cost';
type SortDir = 'asc' | 'desc';

const CATEGORIES = ['All', 'Bearings', 'Belts', 'Filters', 'Seals', 'Electrical', 'Lubrication', 'Fasteners', 'Sensors'];
const STOCK_FILTERS = ['All', 'In Stock', 'Low Stock', 'Out of Stock'];
const PAGE_SIZE = 25;

export default function PartsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'manager';
  const [parts, setParts] = useState<SparePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search & Filters
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);

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

  // Seed state
  const [seeding, setSeeding] = useState(false);

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

  // Filtered + sorted + paginated
  const filtered = useMemo(() => {
    let result = [...parts];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(p =>
        (p.name?.toLowerCase().includes(q)) ||
        (p.part_number?.toLowerCase().includes(q)) ||
        (p.category?.toLowerCase().includes(q)) ||
        (p.supplier?.toLowerCase().includes(q)) ||
        (p.location?.toLowerCase().includes(q))
      );
    }

    // Category
    if (categoryFilter !== 'All') {
      result = result.filter(p => p.category === categoryFilter);
    }

    // Stock status
    if (stockFilter === 'In Stock') {
      result = result.filter(p => p.quantity_in_stock > p.min_stock_level);
    } else if (stockFilter === 'Low Stock') {
      result = result.filter(p => p.quantity_in_stock > 0 && p.quantity_in_stock <= p.min_stock_level);
    } else if (stockFilter === 'Out of Stock') {
      result = result.filter(p => p.quantity_in_stock === 0);
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (sortField === 'quantity_in_stock') {
        cmp = a.quantity_in_stock - b.quantity_in_stock;
      } else if (sortField === 'unit_cost') {
        cmp = (a.unit_cost ?? 0) - (b.unit_cost ?? 0);
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [parts, search, categoryFilter, stockFilter, sortField, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, categoryFilter, stockFilter, sortField, sortDir]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronUp className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ChevronUp className="h-3 w-3 text-brand-400" />
      : <ChevronDown className="h-3 w-3 text-brand-400" />;
  };

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

  const handleSeedDemo = async () => {
    setSeeding(true);
    try {
      const res = await api.seedDemoParts() as { count: number };
      showFeedback(`Seeded ${res.count} demo parts`);
      await loadParts();
    } catch (err: any) {
      showFeedback(err.message || 'Seed failed');
    } finally { setSeeding(false); }
  };

  const stockColor = (part: SparePart) => {
    if (part.quantity_in_stock === 0) return 'text-red-400';
    if (part.quantity_in_stock <= part.min_stock_level) return 'text-amber-400';
    return 'text-emerald-400';
  };

  const stockBg = (part: SparePart) => {
    if (part.quantity_in_stock === 0) return 'bg-red-500/10';
    if (part.quantity_in_stock <= part.min_stock_level) return 'bg-amber-500/10';
    return 'bg-emerald-500/10';
  };

  const rowBorder = (part: SparePart) => {
    if (part.quantity_in_stock === 0) return 'border-l-2 border-l-red-500/60';
    if (part.quantity_in_stock <= part.min_stock_level) return 'border-l-2 border-l-amber-500/60';
    return 'border-l-2 border-l-transparent';
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-brand-600 border-r-transparent" /></div>;

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">{feedback}</div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Spare Parts</h1>
          <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-full">{parts.length}</span>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={handleSeedDemo} disabled={seeding} className="text-xs h-7 px-2">
              <Database className="h-3 w-3 mr-1" />{seeding ? 'Seeding...' : 'Seed Demo'}
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Part</Button>
          )}
        </div>
      </div>

      {/* Search & Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search parts..."
            className="pl-8 h-8 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="h-8 text-xs bg-secondary border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
        </select>
        <select
          value={stockFilter}
          onChange={e => setStockFilter(e.target.value)}
          className="h-8 text-xs bg-secondary border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          {STOCK_FILTERS.map(s => <option key={s} value={s}>{s === 'All' ? 'All Stock' : s}</option>)}
        </select>
        {(search || categoryFilter !== 'All' || stockFilter !== 'All') && (
          <button
            onClick={() => { setSearch(''); setCategoryFilter('All'); setStockFilter('All'); }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >Clear</button>
        )}
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} result{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Table */}
      {parts.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground text-lg">No spare parts yet</p>
          {isAdmin && <Button size="sm" className="mt-3" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> Add Part</Button>}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 bg-card rounded-xl border border-border">
          <p className="text-muted-foreground">No parts match your filters</p>
        </div>
      ) : (
        <div className="bg-card rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2">Part #</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('name')}>
                    <span className="inline-flex items-center gap-1">Name <SortIcon field="name" /></span>
                  </th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 hidden md:table-cell">Category</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Supplier</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('unit_cost')}>
                    <span className="inline-flex items-center justify-end gap-1">Cost <SortIcon field="unit_cost" /></span>
                  </th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2 cursor-pointer select-none hover:text-foreground" onClick={() => toggleSort('quantity_in_stock')}>
                    <span className="inline-flex items-center gap-1">Stock <SortIcon field="quantity_in_stock" /></span>
                  </th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-3 py-2 hidden lg:table-cell">Min</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-3 py-2 hidden xl:table-cell">Location</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-3 py-2 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginated.map((part) => (
                  <tr key={part.id} className={`border-b border-border last:border-0 hover:bg-accent/50 transition-colors ${rowBorder(part)}`}>
                    <td className="px-3 py-1.5 text-xs font-mono text-muted-foreground whitespace-nowrap">{part.part_number || '\u2014'}</td>
                    <td className="px-3 py-1.5">
                      <span className="text-sm font-medium text-foreground">{part.name}</span>
                    </td>
                    <td className="px-3 py-1.5 hidden md:table-cell">
                      <span className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">{part.category || 'General'}</span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground hidden lg:table-cell">{part.supplier || '\u2014'}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground text-right hidden lg:table-cell">{part.unit_cost != null ? `\u20AC${Number(part.unit_cost).toFixed(2)}` : '\u2014'}</td>
                    <td className="px-3 py-1.5 text-center">
                      <span className={`inline-flex items-center justify-center text-xs font-semibold px-1.5 py-0.5 rounded ${stockColor(part)} ${stockBg(part)}`}>
                        {part.quantity_in_stock}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground text-center hidden lg:table-cell">{part.min_stock_level}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground hidden xl:table-cell">{part.location || '\u2014'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <div className="flex items-center justify-end gap-0.5">
                        <button onClick={() => setBarcodePart(part)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Barcode">
                          <Barcode className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => openEdit(part)} className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeletePart(part)} className="p-1 rounded hover:bg-secondary text-red-400/70 hover:text-red-400 transition-colors" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-3 py-2 border-t border-border bg-secondary/30">
              <span className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-muted-foreground px-2">{page + 1} / {totalPages}</span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
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
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="text-sm">Part Label</DialogTitle>
            <DialogDescription className="text-xs">{barcodePart?.name}</DialogDescription>
          </DialogHeader>
          <div id="barcode-print-area" className="flex flex-col items-center py-3 bg-white rounded-lg">
            {barcodePart && (
              <>
                <Barcode128
                  value={barcodePart.part_number || barcodePart.id.slice(0, 12)}
                  width={1.8}
                  height={50}
                  fontSize={11}
                  background="#ffffff"
                  lineColor="#000000"
                />
                <p style={{ color: '#000', fontWeight: 'bold', fontSize: '12px', margin: '6px 0 2px' }}>{barcodePart.name}</p>
                {barcodePart.part_number && <p style={{ color: '#666', fontSize: '10px', margin: 0 }}>{barcodePart.part_number}</p>}
                {barcodePart.location && <p style={{ color: '#666', fontSize: '10px', margin: 0 }}>Loc: {barcodePart.location}</p>}
              </>
            )}
          </div>
          <DialogFooter className="justify-center">
            <Button size="sm" onClick={handlePrintBarcode}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Print Label
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
