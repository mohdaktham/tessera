import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { buildChartData, type ChartConfig } from '@/lib/chart';
import { formatCompact, formatNumber } from '@/lib/format';
import type { CellValue } from '@/lib/types';
import { ChartMessage } from './ChartMessage';

export const SERIES_COLORS = [
  'var(--lapis)',
  'var(--verdigris)',
  'var(--ochre)',
  'var(--porphyry)',
  'var(--malachite)',
  'var(--coral)',
] as const;

const seriesColor = (index: number): string =>
  SERIES_COLORS[index % SERIES_COLORS.length] as string;

const axisTick = { fill: 'var(--faint)', fontSize: 11, fontFamily: 'var(--font-sans)' };
const axisLine = { stroke: 'var(--line)' };
const tooltipProps = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: 8,
    boxShadow: 'var(--shadow-pop)',
    fontSize: 12,
    padding: '6px 10px',
  },
  labelStyle: { color: 'var(--muted)', marginBottom: 2 },
  itemStyle: { color: 'var(--ink)', padding: 0 },
  cursor: { fill: 'color-mix(in srgb, var(--raised) 60%, transparent)', stroke: 'var(--line)' },
  formatter: (value: unknown) =>
    typeof value === 'number' ? formatNumber(value) : String(value ?? ''),
  isAnimationActive: false,
} as const;

const humanize = (column: string): string => column.replace(/_/g, ' ');
const legendLabel = (value: string) => (
  <span style={{ color: 'var(--muted)' }}>{humanize(String(value))}</span>
);

interface ChartViewProps {
  config: ChartConfig;
  columns: string[];
  rows: CellValue[][];
  /** Tighter margins and no legend for small dashboard tiles. */
  compact?: boolean;
}

/** Renders a result set as a chart. Purely presentational: config in, picture out. */
export default function ChartView({ config, columns, rows, compact = false }: ChartViewProps) {
  const { data, truncated } = useMemo(
    () => buildChartData(config, columns, rows),
    [config, columns, rows],
  );
  const series = config.y.filter((column) => columns.includes(column));

  if (series.length === 0 || data.length === 0) {
    return <ChartMessage>Pick at least one numeric column to plot.</ChartMessage>;
  }

  if (config.type === 'number') {
    const first = data[0] ?? {};
    return (
      <div className="flex h-full flex-wrap items-center gap-x-10 gap-y-4 px-5 py-3">
        {series.map((column, index) => {
          const value = first[column];
          return (
            <div key={column} className="min-w-[120px]">
              <div className="flex items-center gap-1.5 text-xs text-muted">
                <span className="tile" style={{ background: seriesColor(index) }} />
                <span className="first-letter:uppercase">{humanize(column)}</span>
              </div>
              <div className="selectable mt-0.5 text-3xl font-semibold tracking-tight tabular-nums">
                {typeof value === 'number' ? formatCompact(value) : '–'}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const margin = compact
    ? { top: 8, right: 12, bottom: 0, left: -8 }
    : { top: 16, right: 24, bottom: 4, left: 0 };
  const showLegend = !compact && series.length > 1;
  const legend = showLegend ? (
    <Legend
      iconType="square"
      iconSize={8}
      itemSorter={null}
      formatter={legendLabel}
      wrapperStyle={{ fontSize: 12 }}
    />
  ) : null;
  const grid = <CartesianGrid stroke="var(--line-soft)" vertical={false} />;
  const xAxis = (
    <XAxis
      dataKey="__x"
      tick={axisTick}
      axisLine={axisLine}
      tickLine={false}
      minTickGap={24}
      interval="preserveStartEnd"
    />
  );
  const yAxis = (
    <YAxis
      tick={axisTick}
      axisLine={false}
      tickLine={false}
      tickFormatter={formatCompact}
      width={compact ? 52 : 60}
    />
  );

  let chart;
  switch (config.type) {
    case 'bar':
      chart = (
        <BarChart data={data} margin={margin} barCategoryGap="22%">
          {grid}
          {xAxis}
          {yAxis}
          <Tooltip {...tooltipProps} />
          {legend}
          {series.map((column, index) => (
            <Bar
              key={column}
              dataKey={column}
              name={humanize(column)}
              fill={seriesColor(index)}
              radius={[3, 3, 0, 0]}
              isAnimationActive={false}
              maxBarSize={56}
            />
          ))}
        </BarChart>
      );
      break;
    case 'line':
      chart = (
        <LineChart data={data} margin={margin}>
          {grid}
          {xAxis}
          {yAxis}
          <Tooltip {...tooltipProps} />
          {legend}
          {series.map((column, index) => (
            <Line
              key={column}
              type="monotone"
              dataKey={column}
              name={humanize(column)}
              stroke={seriesColor(index)}
              strokeWidth={2}
              dot={data.length <= 40 ? { r: 2.5, strokeWidth: 0, fill: seriesColor(index) } : false}
              activeDot={{ r: 4 }}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      );
      break;
    case 'area':
      chart = (
        <AreaChart data={data} margin={margin}>
          {grid}
          {xAxis}
          {yAxis}
          <Tooltip {...tooltipProps} />
          {legend}
          {series.map((column, index) => (
            <Area
              key={column}
              type="monotone"
              dataKey={column}
              name={humanize(column)}
              stroke={seriesColor(index)}
              strokeWidth={2}
              fill={seriesColor(index)}
              fillOpacity={0.16}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      );
      break;
    case 'scatter':
      chart = (
        <ScatterChart margin={margin}>
          <CartesianGrid stroke="var(--line-soft)" />
          <XAxis
            dataKey="__x"
            type="number"
            name={config.x ?? 'row'}
            tick={axisTick}
            axisLine={axisLine}
            tickLine={false}
            tickFormatter={formatCompact}
            domain={['auto', 'auto']}
          />
          <YAxis
            type="number"
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            tickFormatter={formatCompact}
            width={60}
          />
          <Tooltip {...tooltipProps} cursor={{ stroke: 'var(--line)' }} />
          {legend}
          {series.map((column, index) => (
            <Scatter
              key={column}
              data={data}
              dataKey={column}
              name={humanize(column)}
              fill={seriesColor(index)}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          ))}
        </ScatterChart>
      );
      break;
    case 'pie':
      chart = (
        <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <Tooltip {...tooltipProps} />
          <Legend
            layout="vertical"
            align="right"
            verticalAlign="middle"
            iconType="square"
            iconSize={8}
            itemSorter={null}
            formatter={legendLabel}
            wrapperStyle={{ fontSize: 12, lineHeight: '20px' }}
          />
          <Pie
            data={data}
            dataKey={series[0] as string}
            nameKey="__x"
            innerRadius="52%"
            outerRadius="86%"
            paddingAngle={1.5}
            stroke="var(--surface)"
            strokeWidth={2}
            isAnimationActive={false}
          >
            {data.map((_, index) => (
              <Cell key={index} fill={seriesColor(index)} />
            ))}
          </Pie>
        </PieChart>
      );
      break;
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%" minHeight={80}>
          {chart}
        </ResponsiveContainer>
      </div>
      {truncated && !compact && (
        <p className="px-4 pb-2 text-xs text-faint">
          Showing the first {data.length} rows. Aggregate or add a LIMIT to chart the whole result.
        </p>
      )}
    </div>
  );
}
