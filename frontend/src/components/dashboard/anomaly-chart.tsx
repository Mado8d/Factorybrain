'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

interface DataPoint {
  time: string;
  anomaly_score: number | null;
  node_id: string;
}

interface AnomalyChartProps {
  data: DataPoint[];
  title?: string;
  threshold?: number;
}

export function AnomalyChart({
  data,
  title = 'Anomalie score',
  threshold = 0.5,
}: AnomalyChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.time).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
    anomaly_pct: d.anomaly_score != null ? d.anomaly_score * 100 : null,
  }));

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="#9ca3af"
            unit="%"
            domain={[0, 100]}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Anomalie']}
          />
          <ReferenceLine
            y={threshold * 100}
            stroke="#ef4444"
            strokeDasharray="5 5"
            label={{ value: 'Drempel', position: 'right', fontSize: 11, fill: '#ef4444' }}
          />
          <Area
            type="monotone"
            dataKey="anomaly_pct"
            name="Anomalie"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
