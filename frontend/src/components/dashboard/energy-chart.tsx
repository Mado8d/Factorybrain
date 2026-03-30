'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface DataPoint {
  time: string;
  grid_power_w: number | null;
  solar_power_w: number | null;
  channel_1_w: number | null;
  channel_2_w: number | null;
  channel_3_w: number | null;
  channel_4_w: number | null;
}

interface EnergyChartProps {
  data: DataPoint[];
  title?: string;
  mode?: 'overview' | 'channels';
}

export function EnergyChart({
  data,
  title = 'Energieverbruik',
  mode = 'overview',
}: EnergyChartProps) {
  const formatted = data.map((d) => ({
    ...d,
    time: new Date(d.time).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }),
    grid_kw: d.grid_power_w != null ? d.grid_power_w / 1000 : null,
    solar_kw: d.solar_power_w != null ? d.solar_power_w / 1000 : null,
    ch1_kw: d.channel_1_w != null ? d.channel_1_w / 1000 : null,
    ch2_kw: d.channel_2_w != null ? d.channel_2_w / 1000 : null,
    ch3_kw: d.channel_3_w != null ? d.channel_3_w / 1000 : null,
    ch4_kw: d.channel_4_w != null ? d.channel_4_w / 1000 : null,
  }));

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" unit=" kW" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            formatter={(value: number) => [`${value.toFixed(2)} kW`]}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {mode === 'overview' ? (
            <>
              <Area
                type="monotone"
                dataKey="grid_kw"
                name="Grid"
                stroke="#ef4444"
                fill="#ef4444"
                fillOpacity={0.1}
                strokeWidth={2}
                dot={false}
              />
              <Area
                type="monotone"
                dataKey="solar_kw"
                name="Solar"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
                strokeWidth={2}
                dot={false}
              />
            </>
          ) : (
            <>
              <Area
                type="monotone"
                dataKey="ch1_kw"
                name="Kanaal 1"
                stroke="#3b82f6"
                fill="#3b82f6"
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                stackId="channels"
              />
              <Area
                type="monotone"
                dataKey="ch2_kw"
                name="Kanaal 2"
                stroke="#f59e0b"
                fill="#f59e0b"
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                stackId="channels"
              />
              <Area
                type="monotone"
                dataKey="ch3_kw"
                name="Kanaal 3"
                stroke="#10b981"
                fill="#10b981"
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                stackId="channels"
              />
              <Area
                type="monotone"
                dataKey="ch4_kw"
                name="Kanaal 4"
                stroke="#8b5cf6"
                fill="#8b5cf6"
                fillOpacity={0.1}
                strokeWidth={1.5}
                dot={false}
                stackId="channels"
              />
            </>
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
