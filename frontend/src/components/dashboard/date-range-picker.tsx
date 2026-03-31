'use client';

import { useState } from 'react';

export interface DateRange {
  start: string; // ISO datetime
  end: string;
}

export interface ComparisonRange {
  primary: DateRange;
  compare?: DateRange;
}

interface DateRangePickerProps {
  value: ComparisonRange;
  onChange: (range: ComparisonRange) => void;
}

const PRESETS = [
  { label: 'Last hour', hours: 1 },
  { label: 'Last 6h', hours: 6 },
  { label: 'Last 24h', hours: 24 },
  { label: 'Last 48h', hours: 48 },
  { label: 'Last 7d', hours: 168 },
];

function toLocalDatetime(iso: string): string {
  const d = new Date(iso);
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function fromLocalDatetime(local: string): string {
  return new Date(local).toISOString();
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(!!value.compare);

  const handlePreset = (hours: number) => {
    const end = new Date().toISOString();
    const start = new Date(Date.now() - hours * 3600000).toISOString();
    const primary = { start, end };

    // Auto-generate comparison range (same duration, previous period)
    const compare = compareEnabled
      ? {
          start: new Date(Date.now() - hours * 2 * 3600000).toISOString(),
          end: start,
        }
      : undefined;

    onChange({ primary, compare });
    setShowCustom(false);
  };

  const handleCustomChange = (
    field: 'start' | 'end',
    val: string,
    target: 'primary' | 'compare'
  ) => {
    const iso = fromLocalDatetime(val);
    if (target === 'primary') {
      const updated = { ...value.primary, [field]: iso };
      onChange({ ...value, primary: updated });
    } else if (value.compare) {
      const updated = { ...value.compare, [field]: iso };
      onChange({ ...value, compare: updated });
    }
  };

  const toggleCompare = () => {
    const enabled = !compareEnabled;
    setCompareEnabled(enabled);
    if (enabled) {
      // Generate comparison period (same duration, previous period)
      const duration =
        new Date(value.primary.end).getTime() - new Date(value.primary.start).getTime();
      onChange({
        ...value,
        compare: {
          start: new Date(new Date(value.primary.start).getTime() - duration).toISOString(),
          end: value.primary.start,
        },
      });
    } else {
      onChange({ primary: value.primary, compare: undefined });
    }
  };

  // Calculate active preset
  const spanHours = Math.round(
    (new Date(value.primary.end).getTime() - new Date(value.primary.start).getTime()) / 3600000
  );

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Presets */}
      <div className="flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.hours}
            onClick={() => handlePreset(p.hours)}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
              spanHours === p.hours && !showCustom
                ? 'bg-brand-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
          showCustom
            ? 'bg-brand-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Custom
      </button>

      {/* Compare toggle */}
      <button
        onClick={toggleCompare}
        className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
          compareEnabled
            ? 'bg-purple-600 text-white'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
        }`}
      >
        Compare
      </button>

      {/* Custom date inputs */}
      {showCustom && (
        <div className="w-full mt-2 p-3 bg-white rounded-lg border space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-16">From</span>
            <input
              type="datetime-local"
              value={toLocalDatetime(value.primary.start)}
              onChange={(e) => handleCustomChange('start', e.target.value, 'primary')}
              className="px-2 py-1 text-xs border rounded-md"
            />
            <span className="text-xs text-gray-500 w-8">To</span>
            <input
              type="datetime-local"
              value={toLocalDatetime(value.primary.end)}
              onChange={(e) => handleCustomChange('end', e.target.value, 'primary')}
              className="px-2 py-1 text-xs border rounded-md"
            />
          </div>

          {compareEnabled && value.compare && (
            <div className="flex items-center gap-3 pt-2 border-t">
              <span className="text-xs text-purple-600 w-16 font-medium">Compare</span>
              <input
                type="datetime-local"
                value={toLocalDatetime(value.compare.start)}
                onChange={(e) => handleCustomChange('start', e.target.value, 'compare')}
                className="px-2 py-1 text-xs border border-purple-200 rounded-md"
              />
              <span className="text-xs text-gray-500 w-8">To</span>
              <input
                type="datetime-local"
                value={toLocalDatetime(value.compare.end)}
                onChange={(e) => handleCustomChange('end', e.target.value, 'compare')}
                className="px-2 py-1 text-xs border border-purple-200 rounded-md"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
