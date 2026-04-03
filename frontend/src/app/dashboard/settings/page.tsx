'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/store/auth';
import { useDashboard, ThresholdSettings } from '@/store/dashboard';

export default function SettingsPage() {
  const { user } = useAuth();
  const { tenantSettings, loadAll, saveTenantSettings } = useDashboard();
  const [thresholds, setThresholds] = useState<ThresholdSettings>(tenantSettings.thresholds);
  const [refreshInterval, setRefreshInterval] = useState(tenantSettings.refresh_interval_seconds);
  const [escalationMinutes, setEscalationMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => {
    setThresholds(tenantSettings.thresholds);
    setRefreshInterval(tenantSettings.refresh_interval_seconds);
    setEscalationMinutes((tenantSettings as any).escalation?.warning_to_critical_minutes ?? 60);
  }, [tenantSettings]);

  const handleSave = async () => {
    setSaving(true);
    await saveTenantSettings({ thresholds, refresh_interval_seconds: refreshInterval, escalation: { warning_to_critical_minutes: escalationMinutes } });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const ThresholdField = ({ label, field, unit }: { label: string; field: keyof ThresholdSettings; unit: string }) => (
    <div>
      <label className="block text-sm font-medium text-foreground mb-1">{label} <span className="text-muted-foreground font-normal">({unit})</span></label>
      <input type="number" step="0.1" value={thresholds[field]} onChange={(e) => setThresholds({ ...thresholds, [field]: parseFloat(e.target.value) || 0 })} disabled={!isAdmin}
        className="w-full px-3 py-2 border border-border bg-card rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:bg-muted disabled:text-muted-foreground" />
    </div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      <section className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Profile</h2>
        <div className="grid grid-cols-2 gap-4">
          <div><label className="block text-sm font-medium text-foreground mb-1">Name</label><input type="text" value={user?.name || ''} disabled className="w-full px-3 py-2 border border-border bg-muted rounded-lg text-sm text-muted-foreground" /></div>
          <div><label className="block text-sm font-medium text-foreground mb-1">Email</label><input type="email" value={user?.email || ''} disabled className="w-full px-3 py-2 border border-border bg-muted rounded-lg text-sm text-muted-foreground" /></div>
          <div><label className="block text-sm font-medium text-foreground mb-1">Role</label><input type="text" value={user?.role || ''} disabled className="w-full px-3 py-2 border border-border bg-muted rounded-lg text-sm text-muted-foreground capitalize" /></div>
          <div><label className="block text-sm font-medium text-foreground mb-1">Tenant ID</label><input type="text" value={user?.tenant_id || ''} disabled className="w-full px-3 py-2 border border-border bg-muted rounded-lg text-sm text-muted-foreground font-mono text-xs" /></div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Thresholds & Alerts</h2>
          {!isAdmin && <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">Admin/manager only</span>}
        </div>
        <div className="space-y-6">
          <div><h3 className="text-sm font-medium text-foreground mb-3">Vibration</h3><div className="grid grid-cols-2 gap-4"><ThresholdField label="Warning" field="vibration_warning" unit="g" /><ThresholdField label="Critical" field="vibration_critical" unit="g" /></div></div>
          <div><h3 className="text-sm font-medium text-foreground mb-3">Anomaly Score</h3><div className="grid grid-cols-2 gap-4"><ThresholdField label="Warning" field="anomaly_warning" unit="0-1" /><ThresholdField label="Critical" field="anomaly_critical" unit="0-1" /></div></div>
          <div><h3 className="text-sm font-medium text-foreground mb-3">Temperature</h3><div className="grid grid-cols-2 gap-4"><ThresholdField label="Warning" field="temperature_warning" unit="°C" /><ThresholdField label="Critical" field="temperature_critical" unit="°C" /></div></div>
          <div><h3 className="text-sm font-medium text-foreground mb-3">Current</h3><div className="grid grid-cols-2 gap-4"><ThresholdField label="Warning" field="current_warning" unit="A" /><ThresholdField label="Critical" field="current_critical" unit="A" /></div></div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Dashboard</h2>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Refresh Interval</label>
          <div className="flex gap-2">
            {[15, 30, 60, 120].map((sec) => (
              <button key={sec} onClick={() => isAdmin && setRefreshInterval(sec)} disabled={!isAdmin}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${refreshInterval === sec ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent disabled:hover:bg-secondary'}`}>
                {sec < 60 ? `${sec}s` : `${sec / 60}min`}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-card rounded-xl border border-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Escalation</h2>
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Auto-escalate warning → critical after</label>
          <div className="flex gap-2">
            {[15, 30, 60, 120, 240].map((min) => (
              <button key={min} onClick={() => isAdmin && setEscalationMinutes(min)} disabled={!isAdmin}
                className={`px-4 py-2 text-sm rounded-lg transition-colors ${escalationMinutes === min ? 'bg-brand-600 text-white' : 'bg-secondary text-muted-foreground hover:bg-accent disabled:hover:bg-secondary'}`}>
                {min < 60 ? `${min}min` : `${min / 60}h`}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">Warning alerts not acknowledged within this time are automatically escalated to critical.</p>
        </div>
      </section>

      {isAdmin && (
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && <span className="text-sm text-green-400">Saved!</span>}
        </div>
      )}

      <section className="bg-card rounded-xl border border-border p-6 mt-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">System</h2>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Version</span><span className="text-sm font-mono text-foreground">0.1.0</span></div>
          <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Backend</span><span className="text-sm text-foreground">FastAPI + TimescaleDB</span></div>
          <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">MQTT Broker</span><span className="text-sm text-foreground">Mosquitto</span></div>
          <div className="flex justify-between py-2 border-b border-border"><span className="text-sm text-muted-foreground">Task Queue</span><span className="text-sm text-foreground">Celery + Redis</span></div>
          <div className="flex justify-between py-2"><span className="text-sm text-muted-foreground">Object Storage</span><span className="text-sm text-foreground">MinIO</span></div>
        </div>
      </section>
    </div>
  );
}
