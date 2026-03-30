'use client';

import {
  LineChart,
  AreaChart,
  BarChart,
  Line,
  Area,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from 'recharts';

interface DataKeyConfig {
  key: string;
  name: string;
  color: string;
}

interface ThresholdConfig {
  value: number;
  color: string;
  label: string;
}

interface FlexibleChartProps {
  data: any[];
  chartType: 'line' | 'area' | 'bar';
  dataKeys: DataKeyConfig[];
  title: string;
  yAxisUnit?: string;
  thresholds?: ThresholdConfig[];
  height?: number;
  stacked?: boolean;
}

function formatTime(time: string) {
  return new Date(time).toLocaleTimeString('nl-BE', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FlexibleChart({
  data,
  chartType,
  dataKeys,
  title,
  yAxisUnit = '',
  thresholds,
  height = 250,
  stacked = false,
}: FlexibleChartProps) {
  const formatted = data.map((d) => ({ ...d, time: formatTime(d.time) }));

  const commonProps = {
    data: formatted,
    children: (
      <>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
        <YAxis
          tick={{ fontSize: 11 }}
          stroke="#9ca3af"
          unit={yAxisUnit ? ` ${yAxisUnit}` : ''}
        />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
          labelStyle={{ fontWeight: 600 }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        {thresholds?.map((t, i) => (
          <ReferenceLine
            key={i}
            y={t.value}
            stroke={t.color}
            strokeDasharray="5 5"
            label={{
              value: t.label,
              position: 'right',
              fontSize: 11,
              fill: t.color,
            }}
          />
        ))}
      </>
    ),
  };

  const renderDataElements = () => {
    switch (chartType) {
      case 'line':
        return dataKeys.map((dk) => (
          <Line
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.name}
            stroke={dk.color}
            strokeWidth={2}
            dot={false}
          />
        ));
      case 'area':
        return dataKeys.map((dk) => (
          <Area
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.name}
            stroke={dk.color}
            fill={dk.color}
            fillOpacity={0.15}
            strokeWidth={2}
            dot={false}
            stackId={stacked ? 'stack' : undefined}
          />
        ));
      case 'bar':
        return dataKeys.map((dk) => (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.name}
            fill={dk.color}
            fillOpacity={0.8}
            stackId={stacked ? 'stack' : undefined}
          />
        ));
    }
  };

  const ChartComponent =
    chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="time" tick={{ fontSize: 11 }} stroke="#9ca3af" />
          <YAxis
            tick={{ fontSize: 11 }}
            stroke="#9ca3af"
            unit={yAxisUnit ? ` ${yAxisUnit}` : ''}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            labelStyle={{ fontWeight: 600 }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {thresholds?.map((t, i) => (
            <ReferenceLine
              key={i}
              y={t.value}
              stroke={t.color}
              strokeDasharray="5 5"
              label={{
                value: t.label,
                position: 'right',
                fontSize: 11,
                fill: t.color,
              }}
            />
          ))}
          {renderDataElements()}
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
