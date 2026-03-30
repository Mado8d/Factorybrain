'use client';

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  time: string;
  node_id: string;
  vib_rms_x: number | null;
  vib_rms_y: number | null;
  vib_rms_z: number | null;
  anomaly_score: number | null;
}

interface VibrationChartProps {
  data: DataPoint[];
  title?: string;
}

export function VibrationChart({ data, title = 'Vibratie trend' }: VibrationChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.time).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit=" g" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="vib_rms_x"
            name="RMS X"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="vib_rms_y"
            name="RMS Y"
            stroke="#10b981"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="vib_rms_z"
            name="RMS Z"
            stroke="#f59e0b"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
