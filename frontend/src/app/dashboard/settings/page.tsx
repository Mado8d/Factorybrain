'use client';

import { useAuth } from '@/store/auth';

export default function SettingsPage() {
  const { user } = useAuth();

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

      {/* System info */}
      <section className="bg-white rounded-xl border p-6 mb-6">
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
          <div className="flex justify-between py-2">
            <span className="text-sm text-gray-600">Object Storage</span>
            <span className="text-sm text-gray-900">MinIO</span>
          </div>
        </div>
      </section>

      {/* Placeholder sections */}
      <section className="bg-white rounded-xl border p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Tenant configuratie</h2>
        <p className="text-sm text-gray-500">
          Tenant-instellingen zoals timezone, taal, notificatie-voorkeuren en
          gebruikersbeheer worden beschikbaar in een volgende versie.
        </p>
      </section>
    </div>
  );
}
