'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useDashboard, WidgetConfig } from '@/store/dashboard';
import { FlexibleChart } from './flexible-chart';

// --- Available widget templates for "Add Widget" ---
const WIDGET_TEMPLATES: Omit<WidgetConfig, 'id' | 'position'>[] = [
  { type: 'kpi', title: 'KPI Kaart', metric: 'active_machines', col_span: 1 },
  {
    type: 'line_chart', title: 'Vibratie (lijn)', node_type: 'vibesense',
    chart_type: 'line', time_range_hours: 6, height: 250, col_span: 1,
    data_keys: [
      { key: 'vib_rms_x', name: 'RMS X', color: '#3b82f6' },
      { key: 'vib_rms_y', name: 'RMS Y', color: '#10b981' },
      { key: 'vib_rms_z', name: 'RMS Z', color: '#f59e0b' },
    ],
  },
  {
    type: 'area_chart', title: 'Anomalie score', node_type: 'vibesense',
    chart_type: 'area', time_range_hours: 6, height: 250, col_span: 1,
    data_keys: [{ key: 'anomaly_score', name: 'Anomalie', color: '#8b5cf6' }],
    thresholds: [{ value: 0.5, color: '#ef4444', label: 'Drempel' }],
  },
  {
    type: 'area_chart', title: 'Grid vs Solar', node_type: 'energysense',
    chart_type: 'area', time_range_hours: 6, height: 250, col_span: 1,
    data_keys: [
      { key: 'grid_power_w', name: 'Grid', color: '#ef4444' },
      { key: 'solar_power_w', name: 'Solar', color: '#22c55e' },
    ],
  },
  {
    type: 'bar_chart', title: 'Energie (staaf)', node_type: 'energysense',
    chart_type: 'bar', time_range_hours: 6, height: 250, col_span: 1,
    data_keys: [
      { key: 'channel_1_w', name: 'Kanaal 1', color: '#3b82f6' },
      { key: 'channel_2_w', name: 'Kanaal 2', color: '#f59e0b' },
      { key: 'channel_3_w', name: 'Kanaal 3', color: '#10b981' },
      { key: 'channel_4_w', name: 'Kanaal 4', color: '#8b5cf6' },
    ],
  },
];

const CHART_TYPE_OPTIONS = [
  { value: 'line', label: 'Lijn' },
  { value: 'area', label: 'Vlak' },
  { value: 'bar', label: 'Staaf' },
];

const TIME_RANGE_OPTIONS = [
  { value: 1, label: '1u' },
  { value: 6, label: '6u' },
  { value: 12, label: '12u' },
  { value: 24, label: '24u' },
  { value: 48, label: '48u' },
  { value: 168, label: '7d' },
];

// --- KPI Widget ---

interface KPIWidgetProps {
  widget: WidgetConfig;
  kpis: Record<string, any>;
}

function KPIWidget({ widget, kpis }: KPIWidgetProps) {
  const value = kpis[widget.metric || ''];
  const isAlert = widget.metric === 'open_alerts' && (value ?? 0) > 0;

  return (
    <div className={`rounded-xl border p-5 ${isAlert ? 'bg-red-50 border-red-200' : 'bg-white'}`}>
      <p className="text-sm text-gray-500">{widget.title}</p>
      <p className={`text-3xl font-bold mt-1 ${isAlert ? 'text-red-700' : 'text-gray-900'}`}>
        {value != null ? (typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : value) : '—'}
        {widget.metric === 'total_power_kw' && <span className="text-base font-normal text-gray-400"> kW</span>}
        {widget.metric === 'avg_oee' && value != null && <span className="text-base font-normal text-gray-400">%</span>}
      </p>
    </div>
  );
}

// --- Chart Widget ---

interface ChartWidgetProps {
  widget: WidgetConfig;
  telemetryCache: Record<string, any[]>;
  onUpdateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
}

function ChartWidget({ widget, telemetryCache, onUpdateWidget }: ChartWidgetProps) {
  const cacheKey = `${widget.node_type || 'all'}_${widget.node_id || 'all'}_${widget.time_range_hours || 6}`;
  const data = telemetryCache[cacheKey] || [];

  return (
    <div>
      {/* Widget controls */}
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
        <div className="flex gap-1 ml-auto">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onUpdateWidget(widget.id, { time_range_hours: opt.value })}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                (widget.time_range_hours || 6) === opt.value
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
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Load telemetry data for all chart widgets
  useEffect(() => {
    const chartWidgets = widgets.filter((w) => w.type.includes('chart'));
    const cacheKeys = new Set(
      chartWidgets.map(
        (w) => `${w.node_type || 'all'}_${w.node_id || 'all'}_${w.time_range_hours || 6}`
      )
    );

    const fetchAll = async () => {
      const entries = await Promise.all(
        Array.from(cacheKeys).map(async (key) => {
          const [nodeType, nodeId, hours] = key.split('_');
          try {
            const data = await api.getTelemetryHistory({
              node_type: nodeType !== 'all' ? nodeType : undefined,
              node_id: nodeId !== 'all' ? nodeId : undefined,
              hours: parseInt(hours),
            });
            return [key, data] as [string, any[]];
          } catch {
            return [key, []] as [string, any[]];
          }
        })
      );
      setTelemetryCache(Object.fromEntries(entries));
    };

    if (chartWidgets.length > 0) fetchAll();
  }, [widgets]);

  const handleAddWidget = (template: typeof WIDGET_TEMPLATES[number]) => {
    const id = `widget-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    addWidget({ ...template, id, position: widgets.length });
    setShowAddDialog(false);
  };

  // Split widgets into KPIs and charts
  const kpiWidgets = widgets.filter((w) => w.type === 'kpi');
  const chartWidgets = widgets.filter((w) => w.type !== 'kpi');

  return (
    <div>
      {/* KPI row */}
      {kpiWidgets.length > 0 && (
        <div className={`grid gap-4 mb-6`} style={{ gridTemplateColumns: `repeat(${Math.min(kpiWidgets.length, 4)}, 1fr)` }}>
          {kpiWidgets
            .sort((a, b) => a.position - b.position)
            .map((widget) => (
              <div key={widget.id} className="relative group">
                <KPIWidget widget={widget} kpis={kpis} />
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition-opacity"
                  title="Verwijder widget"
                >
                  ✕
                </button>
              </div>
            ))}
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
                  onUpdateWidget={updateWidget}
                />
                <button
                  onClick={() => removeWidget(widget.id)}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 text-xs transition-opacity bg-white rounded-full w-5 h-5 flex items-center justify-center shadow"
                  title="Verwijder widget"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Add widget button */}
      <div className="relative">
        <button
          onClick={() => setShowAddDialog(!showAddDialog)}
          className="w-full py-3 border-2 border-dashed rounded-xl text-sm text-gray-400 hover:text-brand-600 hover:border-brand-300 transition-colors"
        >
          + Widget toevoegen
        </button>

        {showAddDialog && (
          <div className="absolute top-full mt-2 left-0 right-0 bg-white rounded-xl border shadow-lg p-4 z-10">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Kies widget type</h4>
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
                    {tpl.node_type ? ` · ${tpl.node_type}` : ''}
                  </p>
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowAddDialog(false)}
              className="mt-3 w-full py-1.5 text-xs text-gray-500 hover:text-gray-700"
            >
              Annuleren
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
