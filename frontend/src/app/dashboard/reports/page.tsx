'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { Cog, Zap, Wrench, BarChart3, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const reportTypes = [
  { id: 'machine-health', name: 'Machine Health', description: 'Vibration, anomaly scores, and sensor data per machine for the selected period.', icon: Cog },
  { id: 'energy', name: 'Energy Report', description: 'Grid consumption, solar production, and per-channel usage over the selected period.', icon: Zap },
  { id: 'maintenance', name: 'Maintenance Report', description: 'All alerts and work orders with status, severity, and timestamps.', icon: Wrench },
  { id: 'oee', name: 'OEE Report', description: 'Machine availability calculated from energy sensor data.', icon: BarChart3 },
];

const periods = [
  { value: '6', label: 'Last 6 hours' },
  { value: '24', label: 'Last 24 hours' },
  { value: '48', label: 'Last 48 hours' },
  { value: '168', label: 'Last 7 days' },
];

function downloadCSV(filename: string, headers: string[], rows: any[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [period, setPeriod] = useState('24');
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState('');

  const showFeedback = (msg: string) => { setFeedback(msg); setTimeout(() => setFeedback(''), 3000); };

  const generateReport = async () => {
    if (!selectedReport) return;
    setGenerating(true);
    try {
      const hours = parseInt(period);
      const now = new Date().toISOString();
      const start = new Date(Date.now() - hours * 3600000).toISOString();
      const dateStr = new Date().toISOString().slice(0, 10);

      if (selectedReport === 'machine-health') {
        const data = await api.getTelemetryHistory({ node_type: 'vibesense', start, end: now }) as any[];
        if (data.length === 0) { showFeedback('No data for this period'); return; }
        downloadCSV(`machine-health-${dateStr}.csv`,
          ['Time', 'Node ID', 'VibRMS_X', 'VibRMS_Y', 'VibRMS_Z', 'Anomaly Score', 'Temperature', 'Current'],
          data.map((d) => [d.time, d.node_id, d.vib_rms_x, d.vib_rms_y, d.vib_rms_z, d.anomaly_score, d.temperature_1, d.current_rms])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'energy') {
        const data = await api.getTelemetryHistory({ node_type: 'energysense', start, end: now }) as any[];
        if (data.length === 0) { showFeedback('No data for this period'); return; }
        downloadCSV(`energy-${dateStr}.csv`,
          ['Time', 'Node ID', 'Grid Power (W)', 'Solar Power (W)', 'Ch1 (W)', 'Ch2 (W)', 'Ch3 (W)', 'Ch4 (W)', 'Power Factor'],
          data.map((d) => [d.time, d.node_id, d.grid_power_w, d.solar_power_w, d.channel_1_w, d.channel_2_w, d.channel_3_w, d.channel_4_w, d.power_factor])
        );
        showFeedback(`Exported ${data.length} records`);

      } else if (selectedReport === 'maintenance') {
        const [alerts, workOrders] = await Promise.all([
          api.getAlerts() as Promise<any[]>,
          api.getWorkOrders() as Promise<any[]>,
        ]);
        const alertRows = alerts.map((a: any) => ['Alert', a.created_at, a.alert_type, a.severity, a.status, a.anomaly_score, '', '']);
        const woRows = workOrders.map((w: any) => ['Work Order', w.created_at, w.wo_number, w.priority, w.status, '', w.title, w.scheduled_date]);
        downloadCSV(`maintenance-${dateStr}.csv`,
          ['Type', 'Created', 'ID/Type', 'Severity/Priority', 'Status', 'Anomaly Score', 'Title', 'Scheduled Date'],
          [...alertRows, ...woRows]
        );
        showFeedback(`Exported ${alerts.length} alerts + ${workOrders.length} work orders`);

      } else if (selectedReport === 'oee') {
        const data = await api.getOEE(parseInt(period)) as any[];
        if (data.length === 0) { showFeedback('No OEE data available'); return; }
        downloadCSV(`oee-${dateStr}.csv`,
          ['Machine', 'Asset Tag', 'Sensor Node', 'Availability (%)', 'Active Buckets', 'Total Buckets', 'Period (hours)'],
          data.map((d: any) => [d.machine_name, d.asset_tag, d.node_id, d.availability, d.active_buckets, d.total_buckets, d.hours])
        );
        showFeedback(`Exported OEE for ${data.length} machines`);
      }
    } catch (err: any) {
      showFeedback(err.message || 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {feedback && (
        <div className="fixed bottom-4 right-4 z-50 bg-green-500/20 text-green-400 border border-green-500/30 px-4 py-2 rounded-lg text-sm animate-in fade-in slide-in-from-bottom-2">
          {feedback}
        </div>
      )}

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
        <div className="mt-6 bg-card rounded-xl border border-border p-6">
          <div className="flex items-end gap-4">
            <div className="flex-1">
              <Label>Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="mt-1 w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {periods.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={generateReport} disabled={generating}>
              {generating ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
              {generating ? 'Generating...' : 'Download CSV'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
