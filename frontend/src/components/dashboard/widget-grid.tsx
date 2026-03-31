'use client';

import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { useDashboard, WidgetConfig } from '@/store/dashboard';
import { FlexibleChart } from './flexible-chart';
import { DateRangePicker, ComparisonRange } from './date-range-picker';

// --- Available widget templates ---
const WIDGET_TEMPLATES: Omit<WidgetConfig, 'id' | 'position'>[] = [
  { type: 'kpi', title: 'KPI Card', metric: 'active_machines', col_span: 1 },
  {
    type: 'line_chart', title: 'Vibration (line)', node_type: 'vibesense',
    chart_type: 'line', height: 250, col_span: 1,
    data_keys: [
      { key: 'vib_rms_x', name: 'RMS X', color: '#3b82f6' },
      { key: 'vib_rms_y', name: 'RMS Y', color: '#10b981' },
      { key: 'vib_rms_z', name: 'RMS Z', color: '#f59e0b' },
    ],
  },
  {
    type: 'area_chart', title: 'Anomaly Score', node_type: 'vibesense',
    chart_type: 'area', height: 250, col_span: 1,
    data_keys: [{ key: 'anomaly_score', name: 'Anomaly', color: '#8b5cf6' }],
    thresholds: [{ value: 0.5, color: '#ef4444', label: 'Threshold' }],
  },
  {
    type: 'area_chart', title: 'Grid vs Solar', node_type: 'energysense',
    chart_type: 'area', height: 250, col_span: 1,
    data_keys: [
      { key: 'grid_power_w', name: 'Grid', color: '#ef4444' },
      { key: 'solar_power_w', name: 'Solar', color: '#22c55e' },
    ],
  },
  {
    type: 'bar_chart', title: 'Energy by Channel', node_type: 'energysense',
    chart_type: 'bar', height: 250, col_span: 1,
    data_keys: [
      { key: 'channel_1_w', name: 'Channel 1', color: '#3b82f6' },
      { key: 'channel_2_w', name: 'Channel 2', color: '#f59e0b' },
      { key: 'channel_3_w', name: 'Channel 3', color: '#10b981' },
      { key: 'channel_4_w', name: 'Channel 4', color: '#8b5cf6' },
    ],
  },
];

const CHART_TYPE_OPTIONS = [
  { value: 'line', label: 'Line' },
  { value: 'area', label: 'Area' },
  { value: 'bar', label: 'Bar' },
];

// --- KPI Widget ---

function KPIWidget({ widget, kpis }: { widget: WidgetConfig; kpis: Record<string, any> }) {
  const value = kpis[widget.metric || ''];
  const isAlert = widget.metric === 'open_alerts' && (value ?? 0) > 0;

  return (
    <div className={`rounded-xl border p-5 ${isAlert ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
      <p className="text-sm text-gray-500">{widget.title}</p>
      <p className={`text-3xl font-bold mt-1 ${isAlert ? 'text-red-700' : 'text-gray-900'}`}>
        {value != null ? (typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value) : '\u2014'}
        {widget.metric === 'total_power_kw' && <span className="text-base font-normal text-gray-400"> kW</span>}
        {widget.metric === 'avg_oee' && value != null && <span className="text-base font-normal text-gray-400">%</span>}
      </p>
    </div>
  );
}

// --- Chart Widget ---

function ChartWidget({
  widget,
  telemetryCache,
  compareTelemetryCache,
  onUpdateWidget,
}: {
  widget: WidgetConfig;
  telemetryCache: Record<string, any[]>;
  compareTelemetryCache: Record<string, any[]>;
  onUpdateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
}) {
  const cacheKey = `${widget.node_type || 'all'}_${widget.node_id || 'all'}`;
  const data = telemetryCache[cacheKey] || [];
  const compareData = compareTelemetryCache[cacheKey];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <div className="flex gap-1">
          {CHART_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdateWidget(widget.id, { chart_type: opt.value })}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                (widget.chart_type || 'line') === opt.value
                  ? 'bg-brand-600 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <FlexibleChart
        data={data}
        compareData={compareData}
        chartType={(widget.chart_type as 'line' | 'area' | 'bar') || 'line'}
        dataKeys={widget.data_keys || []}
        title={widget.title}
        thresholds={widget.thresholds}
        height={widget.height || 250}
      />
    </div>
  );
}

// --- Widget Grid ---

interface WidgetGridProps {
  kpis: Record<string, any>;
}

export function WidgetGrid({ kpis }: WidgetGridProps) {
  const { widgets, addWidget, removeWidget, updateWidget } = useDashboard();
  const [telemetryCache, setTelemetryCache] = useState<Record<string, any[]>>({});
  const [compareTelemetryCache, setCompareTelemetryCache] = useState<Record<string, any[]>>({});
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Global date range state
  const [dateRange, setDateRange] = useState<ComparisonRange>({
    primary: {
      start: new Date(Date.now() - 6 * 3600000).toISOString(),
      end: new Date().toISOString(),
    },
  });

  // Unique data keys for fetching
  const cacheKeys = useMemo(() => {
    const chartWidgets = widgets.filter((w) => w.type.includes('chart'));
    const keys = chartWidgets.map(
      (w) => `${w.node_type || 'all'}_${w.node_id || 'all'}`
    );
    return [...new Set(keys)];
  }, [widgets]);

  // Fetch primary data when date range or widgets change
  useEffect(() => {
    if (cacheKeys.length === 0) return;

    const fetchAll = async () => {
      const entries = await Promise.all(
        cacheKeys.map(async (key) => {
          const [nodeType, nodeId] = key.split('_');
          try {
            const data = await api.getTelemetryHistory({
              node_type: nodeType !== 'all' ? nodeType : undefined,
              node_id: nodeId !== 'all' ? nodeId : undefined,
              start: dateRange.primary.start,
              end: dateRange.primary.end,
            });
            return [key, data] as [string, any[]];
          } catch {
            return [key, []] as [string, any[]];
          }
        })
      );
      setTelemetryCache(Object.fromEntries(entries));
    };

    fetchAll();
  }, [cacheKeys.join(','), dateRange.primary.start, dateRange.primary.end]);

  // Fetch comparison data when comparison range is set
  useEffect(() => {
    if (!dateRange.compare || cacheKeys.length === 0) {
      setCompareTelemetryCache({});
      return;
    }

    const fetchCompare = async () => {
      const entries = await Promise.all(
        cacheKeys.map(async (key) => {
          const [nodeType, nodeId] = key.split('_');
          try {
            const data = await api.getTelemetryHistory({
              node_type: nodeType !== 'all' ? nodeType : undefined,
              node_id: nodeId !== 'all' ? nodeId : undefined,
              start: dateRange.compare!.start,
              end: dateRange.compare!.end,
            });
            return [key, data] as [string, any[]];
          } catch {
            return [key, []] as [string, any[]];
          }
        })
      );
      setCompareTelemetryCache(Object.fromEntries(entries));
    };

    fetchCompare();
  }, [cacheKeys.join(','), dateRange.compare?.start, dateRange.compare?.end]);

  const handleAddWidget = (template: typeof WIDGET_TEMPLATES[number]) => {
    const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addWidget({ ...template, id, position: widgets.length });
    setShowAddDialog(false);
  };

  const kpiWidgets = widgets.filter((w) => w.type === 'kpi');
  const chartWidgets = widgets.filter((w) => w.type !== 'kpi');

  return (
    <div>
      {/* KPI row */}
      {kpiWidgets.length > 0 && (
        <div
          className="grid gap-4 mb-6"
          style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 4)}, 1fr)` }}
        >
          {kpiWidgets
            .sort((a, b) => a.position - b.position)
            .map((widget) => (
              <div key={widget.id} className="relative group">
                <KPIWidget widget={widget} kpis={kpis} />
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition-opacity"
                  title="Remove widget"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Global date range picker */}
      {chartWidgets.length > 0 && (
        <div className="mb-4">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      )}

      {/* Chart grid */}
      {chartWidgets.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-6">
          {chartWidgets
            .sort((a, b) => a.position - b.position)
            .map((widget) => (
              <div
                key={widget.id}
                className={`relative group ${(widget.col_span || 1) > 1 ? 'col-span-2' : ''}`}
              >
                <ChartWidget
                  widget={widget}
                  telemetryCache={telemetryCache}
                  compareTelemetryCache={compareTelemetryCache}
                  onUpdateWidget={updateWidget}
                />
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition-opacity bg-white rounded-full w-5 h-5 flex items-center justify-center shadow"
                  title="Remove widget"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Add widget */}
      <div className="relative">
        <button
          onClick={() => setShowAddDialog(!showAddDialog)}
          className="w-full py-3 border-2 border-dashed rounded-xl text-sm text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors"
        >
          + Add Widget
        </button>

        {showAddDialog && (
          <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border shadow-lg p-4 z-10">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Choose widget type</h4>
            <div className="grid grid-cols-3 gap-2">
              {WIDGET_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  onClick={() => handleAddWidget(tpl)}
                  className="text-left p-3 rounded-lg border hover:border-brand-300 hover:bg-brand-50 transition-colors"
                >
                  <p className="text-sm font-medium text-gray-900">{tpl.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {tpl.type === 'kpi' ? 'KPI' : tpl.chart_type}
                    {tpl.node_type ? ` \u00b7 ${tpl.node_type}` : ''}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddDialog(false)}
              className="mt-3 w-full py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
