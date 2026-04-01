'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const MACHINE_TYPES = [
  'CNC', 'Press', 'Conveyor', 'Robot', 'Pump', 'Compressor',
  'Motor', 'Fan', 'Mixer', 'Packaging', 'Welding', 'Other',
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'idle', label: 'Idle' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'inactive', label: 'Inactive' },
];

export interface MachineFormData {
  name: string;
  asset_tag?: string;
  machine_type?: string;
  manufacturer?: string;
  model?: string;
  year_installed?: number;
  rated_power_kw?: number;
  status?: string;
  specifications?: Record<string, any>;
}

interface MachineFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<MachineFormData>;
  onSubmit: (data: MachineFormData) => Promise<void>;
  isSubmitting: boolean;
}

export function MachineForm({ mode, defaultValues, onSubmit, isSubmitting }: MachineFormProps) {
  const [name, setName] = useState(defaultValues?.name || '');
  const [assetTag, setAssetTag] = useState(defaultValues?.asset_tag || '');
  const [machineType, setMachineType] = useState(defaultValues?.machine_type || '');
  const [manufacturer, setManufacturer] = useState(defaultValues?.manufacturer || '');
  const [model, setModel] = useState(defaultValues?.model || '');
  const [yearInstalled, setYearInstalled] = useState(defaultValues?.year_installed?.toString() || '');
  const [ratedPower, setRatedPower] = useState(defaultValues?.rated_power_kw?.toString() || '');
  const [status, setStatus] = useState(defaultValues?.status || 'active');
  const [specsJson, setSpecsJson] = useState(
    defaultValues?.specifications ? JSON.stringify(defaultValues.specifications, null, 2) : '{}'
  );
  const [specsError, setSpecsError] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSpecsError('');

    if (!name.trim()) {
      setError('Machine name is required');
      return;
    }

    let specs: Record<string, any> = {};
    try {
      specs = JSON.parse(specsJson);
    } catch {
      setSpecsError('Invalid JSON');
      return;
    }

    const data: MachineFormData = { name: name.trim() };
    if (assetTag.trim()) data.asset_tag = assetTag.trim();
    if (machineType) data.machine_type = machineType;
    if (manufacturer.trim()) data.manufacturer = manufacturer.trim();
    if (model.trim()) data.model = model.trim();
    if (yearInstalled) data.year_installed = parseInt(yearInstalled);
    if (ratedPower) data.rated_power_kw = parseFloat(ratedPower);
    if (mode === 'edit') data.status = status;
    if (Object.keys(specs).length > 0) data.specifications = specs;

    try {
      await onSubmit(data);
    } catch (err: any) {
      setError(err.message || 'Operation failed');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <Label htmlFor="name">Machine Name *</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CNC Mill #3" className="mt-1" />
        </div>

        <div>
          <Label htmlFor="asset_tag">Asset Tag</Label>
          <Input id="asset_tag" value={assetTag} onChange={(e) => setAssetTag(e.target.value)} placeholder="e.g. M-001" className="mt-1" />
        </div>

        <div>
          <Label htmlFor="machine_type">Machine Type</Label>
          <Select value={machineType} onValueChange={setMachineType}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Select type..." />
            </SelectTrigger>
            <SelectContent>
              {MACHINE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="manufacturer">Manufacturer</Label>
          <Input id="manufacturer" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="e.g. Siemens" className="mt-1" />
        </div>

        <div>
          <Label htmlFor="model">Model</Label>
          <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} placeholder="e.g. SINUMERIK 840D" className="mt-1" />
        </div>

        <div>
          <Label htmlFor="year_installed">Year Installed</Label>
          <Input id="year_installed" type="number" value={yearInstalled} onChange={(e) => setYearInstalled(e.target.value)} placeholder="e.g. 2022" className="mt-1" />
        </div>

        <div>
          <Label htmlFor="rated_power">Rated Power (kW)</Label>
          <Input id="rated_power" type="number" step="0.1" value={ratedPower} onChange={(e) => setRatedPower(e.target.value)} placeholder="e.g. 15.5" className="mt-1" />
        </div>

        {mode === 'edit' && (
          <div className="col-span-2">
            <Label htmlFor="status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="col-span-2">
          <Label htmlFor="specifications">Specifications (JSON)</Label>
          <Textarea
            id="specifications"
            value={specsJson}
            onChange={(e) => { setSpecsJson(e.target.value); setSpecsError(''); }}
            rows={4}
            className="mt-1"
            placeholder='{"rpm": 3000, "voltage": 400}'
          />
          {specsError && <p className="text-xs text-red-400 mt-1">{specsError}</p>}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 border border-red-500/30 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : mode === 'create' ? 'Add Machine' : 'Save Changes'}
        </Button>
      </div>
    </form>
  );
}
