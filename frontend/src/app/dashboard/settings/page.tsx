'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { useDashboard, ThresholdSettings } from '@/store/dashboard';

export default function SettingsPage() {
  const { user } = useAuth();
  const { tenantSettings, loadAll, saveTenantSettings } = useDashboard();
  const [thresholds, setThresholds] = useState<ThresholdSettings>(tenantSettings.thresholds);
  const [refreshInterval, setRefreshInterval] = useState(tenantSettings.refresh_interval_seconds);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    setThresholds(tenantSettings.thresholds);
    setRefreshInterval(tenantSettings.refresh_interval_seconds);
  }, [tenantSettings]);

  const handleSave = async () => {
    setSaving(true);
    await saveTenantSettings({
      thresholds,
      refresh_interval_seconds: refreshInterval,
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const ThresholdField = ({
    label,
    field,
    unit,
  }: {
    label: string;
    field: keyof ThresholdSettings;
    unit: string;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label} <span className="text-gray-400 font-normal">({unit})</span>
      </label>
      <input
        type="number"
        step="0.1"
        value={thresholds[field]}
        onChange={(e) =>
          setThresholds({ ...thresholds, [field]: parseFloat(e.target.value) || 0 })
        }
        disabled={!isAdmin}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
      />
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Instellingen</h1>

      {/* Profile */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Profiel</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Naam</label>
            <input
              type="text"
              value={user?.name || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
            <input
              type="email"
              value={user?.email || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
            <input
              type="text"
              value={user?.role || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 capitalize"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tenant ID</label>
            <input
              type="text"
              value={user?.tenant_id || ''}
              disabled
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 font-mono text-xs"
            />
          </div>
        </div>
      </section>

      {/* Thresholds & Alerts */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Drempels & Alerts</h2>
          {!isAdmin && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
              Alleen bewerkbaar voor admin/manager
            </span>
          )}
        </div>

        <div className="space-y-6">
          {/* Vibration */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Vibratie</h3>
            <div className="grid grid-cols-2 gap-4">
              <ThresholdField label="Waarschuwing" field="vibration_warning" unit="g" />
              <ThresholdField label="Kritiek" field="vibration_critical" unit="g" />
            </div>
          </div>

          {/* Anomaly */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Anomalie score</h3>
            <div className="grid grid-cols-2 gap-4">
              <ThresholdField label="Waarschuwing" field="anomaly_warning" unit="0-1" />
              <ThresholdField label="Kritiek" field="anomaly_critical" unit="0-1" />
            </div>
          </div>

          {/* Temperature */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Temperatuur</h3>
            <div className="grid grid-cols-2 gap-4">
              <ThresholdField label="Waarschuwing" field="temperature_warning" unit="°C" />
              <ThresholdField label="Kritiek" field="temperature_critical" unit="°C" />
            </div>
          </div>

          {/* Current */}
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-3">Stroom</h3>
            <div className="grid grid-cols-2 gap-4">
              <ThresholdField label="Waarschuwing" field="current_warning" unit="A" />
              <ThresholdField label="Kritiek" field="current_critical" unit="A" />
            </div>
          </div>
        </div>
      </section>

      {/* Refresh interval */}
      <section className="bg-white rounded-xl border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Dashboard</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Verversingsinterval
          </label>
          <div className="flex gap-2">
            {[15, 30, 60, 120].map((sec) => (
              <button
                key={sec}
                onClick={() => isAdmin && setRefreshInterval(sec)}
                disabled={!isAdmin}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${
                  refreshInterval === sec
                    ? 'bg-brand-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:hover:bg-gray-100'
                }`}
              >
                {sec < 60 ? `${sec}s` : `${sec / 60}min`}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Save button */}
      {isAdmin && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
          >
            {saving ? 'Opslaan...' : 'Instellingen opslaan'}
          </button>
          {saved && (
            <span className="text-sm text-green-600">Opgeslagen!</span>
          )}
        </div>
      )}

      {/* System info */}
      <section className="bg-white rounded-xl border p-6 mt-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Systeem</h2>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Versie</span>
            <span className="text-sm font-mono text-gray-900">0.1.0</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Backend</span>
            <span className="text-sm text-gray-900">FastAPI + TimescaleDB</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">MQTT Broker</span>
            <span className="text-sm text-gray-900">Mosquitto</span>
          </div>
          <div className="flex justify-between py-2 border-b border-gray-100">
            <span className="text-sm text-gray-600">Task Queue</span>
            <span className="text-sm text-gray-900">Celery + Redis</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-600">Object Storage</span>
            <span className="text-sm text-gray-900">MinIO</span>
          </div>
        </div>
      </section>
    </div>
  );
}
