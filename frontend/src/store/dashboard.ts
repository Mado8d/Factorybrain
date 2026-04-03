'use client';

import { create } from 'zustand';
import { api } from '@/lib/api';

// --- Types ---

export interface WidgetConfig {
  id: string;
  type: string; // kpi, line_chart, area_chart, bar_chart, gauge, table
  title: string;
  metric?: string;
  node_type?: string;
  node_id?: string;
  time_range_hours?: number;
  chart_type?: string; // line, area, bar
  data_keys?: { key: string; name: string; color: string }[];
  thresholds?: { value: number; color: string; label: string }[];
  height?: number;
  col_span?: number;
  position: number;
}

export interface ThresholdSettings {
  vibration_warning: number;
  vibration_critical: number;
  anomaly_warning: number;
  anomaly_critical: number;
  temperature_warning: number;
  temperature_critical: number;
  current_warning: number;
  current_critical: number;
}

export interface TenantSettings {
  thresholds: ThresholdSettings;
  refresh_interval_seconds: number;
  data_retention_days: number;
  chart_defaults: {
    time_range_hours: number;
    chart_type: string;
  };
  escalation?: {
    warning_to_critical_minutes: number;
  };
}

// --- Defaults (must match backend DEFAULT_TENANT_SETTINGS) ---

const DEFAULT_THRESHOLDS: ThresholdSettings = {
  vibration_warning: 2.5,
  vibration_critical: 4.0,
  anomaly_warning: 0.3,
  anomaly_critical: 0.6,
  temperature_warning: 60.0,
  temperature_critical: 80.0,
  current_warning: 15.0,
  current_critical: 20.0,
};

const DEFAULT_TENANT_SETTINGS: TenantSettings = {
  thresholds: DEFAULT_THRESHOLDS,
  refresh_interval_seconds: 30,
  data_retention_days: 365,
  chart_defaults: {
    time_range_hours: 6,
    chart_type: 'line',
  },
};

// --- Store ---

interface DashboardState {
  widgets: WidgetConfig[];
  tenantSettings: TenantSettings;
  isLoading: boolean;

  // Actions
  loadAll: () => Promise<void>;
  saveWidgets: (widgets: WidgetConfig[]) => Promise<void>;
  addWidget: (widget: WidgetConfig) => void;
  removeWidget: (id: string) => void;
  updateWidget: (id: string, updates: Partial<WidgetConfig>) => void;
  reorderWidgets: (fromIndex: number, toIndex: number) => void;
  saveTenantSettings: (updates: Partial<TenantSettings>) => Promise<void>;

  // Helpers
  getThreshold: (key: keyof ThresholdSettings) => number;
  getRefreshInterval: () => number;
}

export const useDashboard = create<DashboardState>((set, get) => ({
  widgets: [],
  tenantSettings: DEFAULT_TENANT_SETTINGS,
  isLoading: true,

  loadAll: async () => {
    try {
      const [prefsData, settingsData] = await Promise.all([
        api.getDashboardPreferences().catch(() => ({ widgets: [] })),
        api.getTenantSettings().catch(() => ({ settings: {} })),
      ]);
      set({
        widgets: (prefsData as any).widgets || [],
        tenantSettings: {
          ...DEFAULT_TENANT_SETTINGS,
          ...(settingsData as any).settings,
          thresholds: {
            ...DEFAULT_THRESHOLDS,
            ...((settingsData as any).settings?.thresholds || {}),
          },
        },
        isLoading: false,
      });
    } catch (err) {
      console.error('Failed to load dashboard config:', err);
      set({ isLoading: false });
    }
  },

  saveWidgets: async (widgets: WidgetConfig[]) => {
    set({ widgets });
    try {
      await api.updateDashboardPreferences({ widgets });
    } catch (err) {
      console.error('Failed to save widget preferences:', err);
    }
  },

  addWidget: (widget: WidgetConfig) => {
    const { widgets, saveWidgets } = get();
    const updated = [...widgets, { ...widget, position: widgets.length }];
    saveWidgets(updated);
  },

  removeWidget: (id: string) => {
    const { widgets, saveWidgets } = get();
    const updated = widgets
      .filter((w) => w.id !== id)
      .map((w, i) => ({ ...w, position: i }));
    saveWidgets(updated);
  },

  updateWidget: (id: string, updates: Partial<WidgetConfig>) => {
    const { widgets, saveWidgets } = get();
    const updated = widgets.map((w) =>
      w.id === id ? { ...w, ...updates } : w
    );
    saveWidgets(updated);
  },

  reorderWidgets: (fromIndex: number, toIndex: number) => {
    const { widgets, saveWidgets } = get();
    const updated = [...widgets];
    const [moved] = updated.splice(fromIndex, 1);
    updated.splice(toIndex, 0, moved);
    saveWidgets(updated.map((w, i) => ({ ...w, position: i })));
  },

  saveTenantSettings: async (updates: Partial<TenantSettings>) => {
    try {
      const result = await api.updateTenantSettings(updates) as any;
      set({
        tenantSettings: {
          ...DEFAULT_TENANT_SETTINGS,
          ...result.settings,
          thresholds: {
            ...DEFAULT_THRESHOLDS,
            ...(result.settings?.thresholds || {}),
          },
        },
      });
    } catch (err) {
      console.error('Failed to save tenant settings:', err);
    }
  },

  getThreshold: (key: keyof ThresholdSettings) => {
    return get().tenantSettings.thresholds[key] ?? DEFAULT_THRESHOLDS[key];
  },

  getRefreshInterval: () => {
    return (get().tenantSettings.refresh_interval_seconds ?? 30) * 1000;
  },
}));
