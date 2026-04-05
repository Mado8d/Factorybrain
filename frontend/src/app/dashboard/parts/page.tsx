'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';
import { Plus, Pencil, Trash2, Barcode, Printer, Search, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Database, ImageIcon, X, ClipboardCheck, ClipboardList } from 'lucide-react';
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
  const [formImage, setFormImage] = useState<string | null>(null);

  // Delete dialog
  const [deletePart, setDeletePart] = useState<SparePart | null>(null);

  // Barcode dialog
  const [barcodePart, setBarcodePart] = useState<SparePart | null>(null);

  // Seed state
  const [seeding, setSeeding] = useState(false);

  // Stock Check state
  const [stockCheckPrintOpen, setStockCheckPrintOpen] = useState(false);
  const [stockCheckCountOpen, setStockCheckCountOpen] = useState(false);
  const [stockCheckCategory, setStockCheckCategory] = useState('All');
  const [stockCheckLocation, setStockCheckLocation] = useState('All');
  const [stockCounts, setStockCounts] = useState<Record<string, string>>({});
  const [stockCountSubmitting, setStockCountSubmitting] = useState(false);
  const [newPartsFound, setNewPartsFound] = useState<{ name: string; part_number: string; location: string; count: string; notes: string }[]>([]);

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
    setFormImage(null);
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
    setFormImage((part as any).image_url || null);
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
      if (formImage) data.image_url = formImage;

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

  // --- Stock Check helpers ---

  const stockCheckFilteredParts = useMemo(() => {
    let result = [...parts];
    if (stockCheckCategory !== 'All') result = result.filter(p => p.category === stockCheckCategory);
    if (stockCheckLocation !== 'All') result = result.filter(p => p.location === stockCheckLocation);
    return result.sort((a, b) => (a.location || '').localeCompare(b.location || '') || (a.name || '').localeCompare(b.name || ''));
  }, [parts, stockCheckCategory, stockCheckLocation]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set(parts.map(p => p.location).filter(Boolean) as string[]);
    return ['All', ...Array.from(locs).sort()];
  }, [parts]);

  const handlePrintStockCheckList = () => {
    const rows = stockCheckFilteredParts.map(p =>
      `<tr>
        <td>${p.location || '\u2014'}</td>
        <td>${p.part_number || '\u2014'}</td>
        <td>${p.name}</td>
        <td style="text-align:center">${p.quantity_in_stock}</td>
        <td></td>
        <td></td>
      </tr>`
    ).join('');

    const emptyRows = Array.from({ length: 8 }, () =>
      `<tr><td></td><td></td><td></td><td></td><td></td></tr>`
    ).join('');

    const html = `
      <html><head><title>Stock Check List</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, sans-serif; color: #000; background: #fff; padding: 20px; font-size: 11px; }
        h1 { font-size: 16px; margin-bottom: 4px; }
        .meta { margin-bottom: 16px; font-size: 12px; }
        .meta span { display: inline-block; margin-right: 30px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        th, td { border: 1px solid #333; padding: 4px 6px; text-align: left; }
        th { background: #eee; font-weight: bold; font-size: 10px; text-transform: uppercase; }
        td:nth-child(4), td:nth-child(5) { text-align: center; width: 80px; }
        td:nth-child(6) { width: 120px; }
        .new-section h2 { font-size: 13px; margin-bottom: 8px; }
        .new-section td { height: 24px; }
        @media print { body { padding: 10px; } }
      </style></head><body>
      <h1>STOCK CHECK LIST &mdash; FactoryBrain</h1>
      <div class="meta">
        <span>Date: ___/___/2026</span>
        <span>Checked by: _______________________</span>
        ${stockCheckCategory !== 'All' ? `<span>Category: ${stockCheckCategory}</span>` : ''}
        ${stockCheckLocation !== 'All' ? `<span>Location: ${stockCheckLocation}</span>` : ''}
      </div>
      <table>
        <thead><tr><th>Location</th><th>Part #</th><th>Name</th><th>Expected</th><th>Actual Count</th><th>Notes</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="new-section">
        <h2>New parts found (not in system):</h2>
        <table>
          <thead><tr><th>Part Name</th><th>Part #</th><th>Location</th><th>Count</th><th>Notes</th></tr></thead>
          <tbody>${emptyRows}</tbody>
        </table>
      </div>
      <script>window.onload=function(){window.print()}</script>
      </body></html>
    `;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
    setStockCheckPrintOpen(false);
  };

  const openStockCountDialog = () => {
    const counts: Record<string, string> = {};
    parts.forEach(p => { counts[p.id] = ''; });
    setStockCounts(counts);
    setNewPartsFound([]);
    setStockCheckCountOpen(true);
  };

  const getDiscrepancy = (part: SparePart): { value: number; label: string; color: string } | null => {
    const countStr = stockCounts[part.id];
    if (countStr === '' || countStr === undefined) return null;
    const actual = parseInt(countStr);
    if (isNaN(actual)) return null;
    const diff = actual - part.quantity_in_stock;
    if (diff === 0) return { value: 0, label: 'Match', color: 'text-green-400' };
    return { value: diff, label: diff > 0 ? `+${diff}` : `${diff}`, color: 'text-red-400' };
  };

  const handleApplyStockCounts = async () => {
    setStockCountSubmitting(true);
    try {
      let updated = 0;
      for (const part of parts) {
        const countStr = stockCounts[part.id];
        if (countStr === '' || countStr === undefined) continue;
        const actual = parseInt(countStr);
        if (isNaN(actual)) continue;
        if (actual !== part.quantity_in_stock) {
          await api.updateSparePart(part.id, { quantity_in_stock: actual });
          updated++;
        }
      }
      // Add new parts found
      for (const np of newPartsFound) {
        if (!np.name.trim()) continue;
        await api.createSparePart({
          name: np.name.trim(),
          part_number: np.part_number.trim() || undefined,
          location: np.location.trim() || undefined,
          quantity_in_stock: parseInt(np.count) || 0,
          min_stock_level: 1,
        } as any);
        updated++;
      }
      setStockCheckCountOpen(false);
      await loadParts();
      showFeedback(`Stock check applied: ${updated} item(s) updated`);
    } catch (err: any) {
      showFeedback(err.message || 'Failed to apply counts');
    } finally {
      setStockCountSubmitting(false);
    }
  };

  const addNewPartRow = () => {
    setNewPartsFound(prev => [...prev, { name: '', part_number: '', location: '', count: '', notes: '' }]);
  };

  const updateNewPart = (index: number, field: string, value: string) => {
    setNewPartsFound(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p));
  };

  const removeNewPart = (index: number) => {
    setNewPartsFound(prev => prev.filter((_, i) => i !== index));
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
            <Button size="sm" variant="outline" onClick={() => setStockCheckPrintOpen(true)} className="text-xs h-8">
              <ClipboardList className="h-3.5 w-3.5 mr-1" /> Stock Check
            </Button>
          )}
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={openStockCountDialog} className="text-xs h-8">
              <ClipboardCheck className="h-3.5 w-3.5 mr-1" /> Enter Stock Count
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
                      <div className="flex items-center gap-2">
                        {(part as any).image_url ? (
                          <img src={(part as any).image_url} alt="" className="h-6 w-6 object-cover rounded shrink-0" />
                        ) : (
                          <div className="h-6 w-6 rounded bg-secondary flex items-center justify-center shrink-0">
                            <ImageIcon className="h-3 w-3 text-muted-foreground" />
                          </div>
                        )}
                        <span className="text-sm font-medium text-foreground">{part.name}</span>
                      </div>
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
            <div className="col-span-2">
              <Label>Image</Label>
              <div className="mt-1 flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border border-border bg-secondary text-muted-foreground hover:text-foreground hover:bg-accent cursor-pointer transition-colors">
                  <ImageIcon className="h-3.5 w-3.5" />
                  {formImage ? 'Change image' : 'Choose image'}
                  <input type="file" accept="image/*" onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (ev) => setFormImage(ev.target?.result as string);
                    reader.readAsDataURL(file);
                    e.target.value = '';
                  }} className="hidden" />
                </label>
                {formImage && (
                  <div className="relative group">
                    <img src={formImage} alt="Part" className="h-16 w-16 object-cover rounded-md border border-border" />
                    <button
                      type="button"
                      onClick={() => setFormImage(null)}
                      className="absolute -top-1.5 -right-1.5 h-4 w-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                )}
              </div>
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

      {/* Stock Check Print Dialog */}
      <Dialog open={stockCheckPrintOpen} onOpenChange={setStockCheckPrintOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generate Printable Stock Check List</DialogTitle>
            <DialogDescription>Filter by category or location, then generate a printable checklist for physical inventory count.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Category</Label>
              <select
                value={stockCheckCategory}
                onChange={e => setStockCheckCategory(e.target.value)}
                className="w-full mt-1 h-9 text-sm bg-secondary border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {CATEGORIES.map(c => <option key={c} value={c}>{c === 'All' ? 'All Categories' : c}</option>)}
              </select>
            </div>
            <div>
              <Label>Location</Label>
              <select
                value={stockCheckLocation}
                onChange={e => setStockCheckLocation(e.target.value)}
                className="w-full mt-1 h-9 text-sm bg-secondary border border-border rounded-md px-2 text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {uniqueLocations.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              {stockCheckFilteredParts.length} part{stockCheckFilteredParts.length !== 1 ? 's' : ''} will be included in the checklist.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockCheckPrintOpen(false)}>Cancel</Button>
            <Button onClick={handlePrintStockCheckList} disabled={stockCheckFilteredParts.length === 0}>
              <Printer className="h-3.5 w-3.5 mr-1" /> Generate & Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stock Count Entry Dialog */}
      <Dialog open={stockCheckCountOpen} onOpenChange={setStockCheckCountOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Enter Stock Count</DialogTitle>
            <DialogDescription>Enter actual counted quantities. Discrepancies are highlighted automatically.</DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto min-h-0">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2">Part #</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2">Name</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-2 py-2 hidden md:table-cell">Location</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-2 py-2 w-20">System</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-2 py-2 w-24">Actual</th>
                  <th className="text-center text-xs font-medium text-muted-foreground px-2 py-2 w-24">Discrepancy</th>
                </tr>
              </thead>
              <tbody>
                {parts.map(part => {
                  const disc = getDiscrepancy(part);
                  return (
                    <tr key={part.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                      <td className="px-2 py-1 text-xs font-mono text-muted-foreground">{part.part_number || '\u2014'}</td>
                      <td className="px-2 py-1 text-sm text-foreground">{part.name}</td>
                      <td className="px-2 py-1 text-xs text-muted-foreground hidden md:table-cell">{part.location || '\u2014'}</td>
                      <td className="px-2 py-1 text-center text-sm text-foreground">{part.quantity_in_stock}</td>
                      <td className="px-2 py-1">
                        <Input
                          type="number"
                          min={0}
                          value={stockCounts[part.id] || ''}
                          onChange={e => setStockCounts(prev => ({ ...prev, [part.id]: e.target.value }))}
                          placeholder="\u2014"
                          className="h-7 text-xs text-center w-20 mx-auto"
                        />
                      </td>
                      <td className="px-2 py-1 text-center">
                        {disc ? (
                          <span className={`text-xs font-semibold ${disc.color}`}>{disc.label}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">\u2014</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* New Parts Found section */}
            <div className="mt-6 border-t border-border pt-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-foreground">Add New Parts Found</h3>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addNewPartRow}>
                  <Plus className="h-3 w-3 mr-1" /> Add Row
                </Button>
              </div>
              {newPartsFound.length === 0 ? (
                <p className="text-xs text-muted-foreground">No new parts to add. Click &quot;Add Row&quot; if you found parts not in the system.</p>
              ) : (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b border-border bg-secondary/50">
                      <th className="text-left text-xs font-medium text-muted-foreground px-2 py-1.5">Name</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-2 py-1.5">Part #</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-2 py-1.5">Location</th>
                      <th className="text-center text-xs font-medium text-muted-foreground px-2 py-1.5 w-20">Count</th>
                      <th className="text-left text-xs font-medium text-muted-foreground px-2 py-1.5">Notes</th>
                      <th className="w-8"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {newPartsFound.map((np, i) => (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="px-2 py-1"><Input value={np.name} onChange={e => updateNewPart(i, 'name', e.target.value)} placeholder="Part name" className="h-7 text-xs" /></td>
                        <td className="px-2 py-1"><Input value={np.part_number} onChange={e => updateNewPart(i, 'part_number', e.target.value)} placeholder="Part #" className="h-7 text-xs" /></td>
                        <td className="px-2 py-1"><Input value={np.location} onChange={e => updateNewPart(i, 'location', e.target.value)} placeholder="Location" className="h-7 text-xs" /></td>
                        <td className="px-2 py-1"><Input type="number" min={0} value={np.count} onChange={e => updateNewPart(i, 'count', e.target.value)} placeholder="0" className="h-7 text-xs text-center" /></td>
                        <td className="px-2 py-1"><Input value={np.notes} onChange={e => updateNewPart(i, 'notes', e.target.value)} placeholder="Notes" className="h-7 text-xs" /></td>
                        <td className="px-2 py-1">
                          <button onClick={() => removeNewPart(i)} className="p-0.5 rounded hover:bg-secondary text-red-400/70 hover:text-red-400 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
          <DialogFooter className="border-t border-border pt-3">
            <Button variant="outline" onClick={() => setStockCheckCountOpen(false)}>Cancel</Button>
            <Button onClick={handleApplyStockCounts} disabled={stockCountSubmitting}>
              {stockCountSubmitting ? 'Applying...' : 'Apply Counts'}
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
