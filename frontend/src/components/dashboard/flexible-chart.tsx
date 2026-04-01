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
  compareData?: any[];
  chartType: 'line' | 'area' | 'bar';
  dataKeys: DataKeyConfig[];
  title: string;
  yAxisUnit?: string;
  thresholds?: ThresholdConfig[];
  height?: number;
  stacked?: boolean;
}

function formatTime(time: string) {
  return new Date(time).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function FlexibleChart({
  data,
  compareData,
  chartType,
  dataKeys,
  title,
  yAxisUnit = '',
  thresholds,
  height = 250,
  stacked = false,
}: FlexibleChartProps) {
  // Merge primary and comparison data by index (aligned by position)
  const formatted = data.map((d, i) => {
    const entry: any = { ...d, time: formatTime(d.time) };
    if (compareData?.[i]) {
      for (const dk of dataKeys) {
        entry[`cmp_${dk.key}`] = compareData[i][dk.key];
      }
    }
    return entry;
  });

  const ChartComponent =
    chartType === 'line' ? LineChart : chartType === 'area' ? AreaChart : BarChart;

  const renderDataElements = () => {
    const elements: React.ReactNode[] = [];

    // Comparison data (dashed, lighter)
    if (compareData && compareData.length > 0) {
      for (const dk of dataKeys) {
        elements.push(
          chartType === 'bar' ? (
            <Bar
              key={`cmp_${dk.key}`}
              dataKey={`cmp_${dk.key}`}
              name={`${dk.name} (prev)`}
              fill={dk.color}
              fillOpacity={0.2}
            />
          ) : chartType === 'area' ? (
            <Area
              key={`cmp_${dk.key}`}
              type="monotone"
              dataKey={`cmp_${dk.key}`}
              name={`${dk.name} (prev)`}
              stroke={dk.color}
              fill={dk.color}
              fillOpacity={0.05}
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
            />
          ) : (
            <Line
              key={`cmp_${dk.key}`}
              type="monotone"
              dataKey={`cmp_${dk.key}`}
              name={`${dk.name} (prev)`}
              stroke={dk.color}
              strokeWidth={1}
              strokeDasharray="4 4"
              dot={false}
              strokeOpacity={0.4}
            />
          )
        );
      }
    }

    // Primary data
    for (const dk of dataKeys) {
      elements.push(
        chartType === 'bar' ? (
          <Bar
            key={dk.key}
            dataKey={dk.key}
            name={dk.name}
            fill={dk.color}
            fillOpacity={0.8}
            stackId={stacked ? 'stack' : undefined}
          />
        ) : chartType === 'area' ? (
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
        ) : (
          <Line
            key={dk.key}
            type="monotone"
            dataKey={dk.key}
            name={dk.name}
            stroke={dk.color}
            strokeWidth={2}
            dot={false}
          />
        )
      );
    }

    return elements;
  };

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {compareData && compareData.length > 0 && (
          <span className="text-xs text-brand-400 bg-brand-600/20 px-2 py-0.5 rounded">
            Comparing periods
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height={height}>
        <ChartComponent data={formatted}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2a3e" />
          <XAxis dataKey="time" tick={{ fontSize: 11, fill: '#a1a1aa' }} stroke="#71717a" />
          <YAxis
            tick={{ fontSize: 11, fill: '#a1a1aa' }}
            stroke="#71717a"
            unit={yAxisUnit ? ` ${yAxisUnit}` : ''}
          />
          <Tooltip
            contentStyle={{
              fontSize: 12,
              borderRadius: 8,
              backgroundColor: '#1a1a2e',
              border: '1px solid #2a2a3e',
              color: '#e4e4e7',
            }}
            labelStyle={{ fontWeight: 600, color: '#e4e4e7' }}
            itemStyle={{ color: '#a1a1aa' }}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: '#a1a1aa' }} />
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
