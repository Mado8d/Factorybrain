'use client';

import { useState } from 'react';

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: string;
}

const reportTypes: ReportType[] = [
  {
    id: 'machine-health',
    name: 'Machine Health',
    description: 'Overzicht van vibratie, anomalie scores en voorspelde levensduur per machine.',
    icon: '⚙️',
  },
  {
    id: 'energy',
    name: 'Energierapport',
    description: 'Grid verbruik, solar productie en verbruik per kanaal over een gekozen periode.',
    icon: '⚡',
  },
  {
    id: 'maintenance',
    name: 'Onderhoudsrapport',
    description: 'Alerts, werkorders, MTTR en MTBF statistieken per machine.',
    icon: '🔧',
  },
  {
    id: 'oee',
    name: 'OEE Rapport',
    description: 'Overall Equipment Effectiveness: beschikbaarheid, prestatie en kwaliteit.',
    icon: '📊',
  },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Rapporten</h1>

      <div className="grid grid-cols-2 gap-4">
        {reportTypes.map((report) => (
          <button
            key={report.id}
            onClick={() => setSelectedReport(report.id)}
            className={`text-left bg-white rounded-xl border p-6 hover:shadow-md transition-all ${
              selectedReport === report.id ? 'ring-2 ring-brand-500 border-brand-300' : ''
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="text-2xl">{report.icon}</span>
              <div>
                <h3 className="font-semibold text-gray-900">{report.name}</h3>
                <p className="text-sm text-gray-500 mt-1">{report.description}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selectedReport && (
        <div className="mt-8 bg-white rounded-xl border p-8 text-center">
          <div className="inline-block p-4 bg-gray-50 rounded-full mb-4">
            <span className="text-3xl">
              {reportTypes.find((r) => r.id === selectedReport)?.icon}
            </span>
          </div>
          <h3 className="text-lg font-semibold text-gray-900">
            {reportTypes.find((r) => r.id === selectedReport)?.name}
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-md mx-auto">
            Rapportgeneratie wordt beschikbaar in een volgende versie.
            Dit rapport wordt automatisch als PDF opgeslagen in MinIO.
          </p>
          <button
            disabled
            className="mt-4 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm opacity-50 cursor-not-allowed"
          >
            Rapport genereren
          </button>
        </div>
      )}
    </div>
  );
}
