'use client';

import { useState } from 'react';
import { Cog, Zap, Wrench, BarChart3 } from 'lucide-react';

const reportTypes = [
  { id: 'machine-health', name: 'Machine Health', description: 'Vibration, anomaly scores, and predicted remaining useful life per machine.', icon: Cog },
  { id: 'energy', name: 'Energy Report', description: 'Grid consumption, solar production, and per-channel usage over a selected period.', icon: Zap },
  { id: 'maintenance', name: 'Maintenance Report', description: 'Alerts, work orders, MTTR and MTBF statistics per machine.', icon: Wrench },
  { id: 'oee', name: 'OEE Report', description: 'Overall Equipment Effectiveness: availability, performance, and quality.', icon: BarChart3 },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);

  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground mb-6">Reports</h1>
      <div className="grid grid-cols-2 gap-4">
        {reportTypes.map((report) => {
          const Icon = report.icon;
          return (
            <button key={report.id} onClick={() => setSelectedReport(report.id)} className={`text-left bg-card rounded-xl border border-border p-6 hover:border-border/80 transition-all ${selectedReport === report.id ? 'ring-2 ring-brand-500 border-brand-600' : ''}`}>
              <div className="flex items-start gap-4">
                <Icon className="h-6 w-6 text-brand-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-foreground">{report.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {selectedReport && (
        <div className="mt-8 bg-card rounded-xl border border-border p-8 text-center">
          {(() => { const Icon = reportTypes.find((r) => r.id === selectedReport)?.icon || BarChart3; return (
            <div className="inline-block p-4 bg-secondary rounded-full mb-4"><Icon className="h-8 w-8 text-brand-400" /></div>
          ); })()}
          <h3 className="text-lg font-semibold text-foreground">{reportTypes.find((r) => r.id === selectedReport)?.name}</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">Report generation will be available in a future version. Reports will be automatically saved as PDF to MinIO.</p>
          <button disabled className="mt-4 px-6 py-2 bg-brand-600 text-white rounded-lg text-sm opacity-50 cursor-not-allowed">Generate Report</button>
        </div>
      )}
    </div>
  );
}
