import { lazy, Suspense, useMemo } from 'react';
import { ChartArea, ChartColumn, ChartLine, ChartPie, ChartScatter, Hash, Pin } from 'lucide-react';
import { CHART_TYPES, columnKinds, type ChartConfig, type ChartType } from '@/lib/chart';
import type { CellValue } from '@/lib/types';
import { ChartMessage } from './ChartMessage';

const ChartView = lazy(() => import('./ChartView'));

const TYPE_META: Record<ChartType, { label: string; icon: typeof ChartColumn }> = {
  bar: { label: 'Bar', icon: ChartColumn },
  line: { label: 'Line', icon: ChartLine },
  area: { label: 'Area', icon: ChartArea },
  scatter: { label: 'Scatter', icon: ChartScatter },
  pie: { label: 'Pie', icon: ChartPie },
  number: { label: 'Number', icon: Hash },
};

interface ChartBuilderProps {
  columns: string[];
  rows: CellValue[][];
  config: ChartConfig | null;
  onChange: (config: ChartConfig) => void;
  onPin: (config: ChartConfig) => void;
}

/** Controls for turning a result set into a chart, with a live preview. */
export function ChartBuilder({ columns, rows, config, onChange, onPin }: ChartBuilderProps) {
  const kinds = useMemo(() => columnKinds(columns, rows), [columns, rows]);
  const numeric = columns.filter((_, index) => kinds[index] === 'number');

  if (!config || numeric.length === 0) {
    return (
      <ChartMessage>
        This result has no numeric columns to plot. Add a count or a sum to your query, for example
        <code className="mx-1 rounded bg-raised px-1.5 py-0.5 font-mono text-xs">COUNT(*)</code>.
      </ChartMessage>
    );
  }

  const toggleSeries = (column: string): void => {
    const y = config.y.includes(column)
      ? config.y.filter((name) => name !== column)
      : [...config.y, column];
    if (y.length > 0) onChange({ ...config, y });
  };

  return (
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <div className="flex max-h-[46%] flex-none flex-col gap-4 overflow-y-auto border-b border-line-soft p-3 md:max-h-none md:w-56 md:border-r md:border-b-0">
        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">Chart type</legend>
          <div className="grid grid-cols-3 gap-1">
            {CHART_TYPES.map((type) => {
              const { label, icon: Icon } = TYPE_META[type];
              const active = config.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange({ ...config, type })}
                  className={`flex flex-col items-center gap-1 rounded-md border py-1.5 text-2xs font-medium transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-transparent text-muted hover:bg-raised hover:text-ink'
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {config.type !== 'number' && (
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">
              {config.type === 'pie' ? 'Slices' : 'Horizontal axis'}
            </span>
            <select
              className="field"
              value={config.x ?? ''}
              onChange={(event) => onChange({ ...config, x: event.target.value || null })}
            >
              <option value="">Row number</option>
              {columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>
        )}

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-muted">
            {config.type === 'pie' ? 'Value' : 'Values'}
          </legend>
          <div className="flex flex-col gap-0.5">
            {numeric.map((column) => {
              const active = config.y.includes(column);
              return (
                <label
                  key={column}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-raised"
                >
                  <input
                    type="checkbox"
                    className="accent-(--accent)"
                    checked={active}
                    onChange={() => toggleSeries(column)}
                  />
                  <span className="truncate font-mono text-xs">{column}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <button type="button" className="btn mt-auto" onClick={() => onPin(config)}>
          <Pin size={14} />
          Pin to dashboard
        </button>
      </div>

      <div className="min-h-0 min-w-0 flex-1 p-2">
        <Suspense fallback={<ChartMessage>Loading chart…</ChartMessage>}>
          <ChartView config={config} columns={columns} rows={rows} />
        </Suspense>
      </div>
    </div>
  );
}
