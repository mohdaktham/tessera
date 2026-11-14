import type { CellValue } from './types';

export const CHART_TYPES = ['bar', 'line', 'area', 'scatter', 'pie', 'number'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartConfig {
  type: ChartType;
  /** Column used for categories or the horizontal axis. */
  x: string | null;
  /** Numeric columns plotted as series. */
  y: string[];
}

export type ColumnKind = 'number' | 'text';

/** A column is numeric when every non-null value in it is a number. */
export function columnKinds(
  columns: readonly string[],
  rows: readonly CellValue[][],
): ColumnKind[] {
  return columns.map((_, index) => {
    let numbers = 0;
    for (const row of rows) {
      const value = row[index];
      if (value == null) continue;
      if (typeof value !== 'number') return 'text';
      numbers++;
    }
    return numbers > 0 ? 'number' : 'text';
  });
}

const looksTemporal = (value: CellValue): boolean =>
  typeof value === 'string' && /^\d{4}(-\d{2}){0,2}([ T]\d{2}:\d{2})?/.test(value);

/** Picks a sensible first chart for a result set, or null when nothing can be plotted. */
export function suggestChart(
  columns: readonly string[],
  rows: readonly CellValue[][],
): ChartConfig | null {
  if (columns.length === 0 || rows.length === 0) return null;
  const kinds = columnKinds(columns, rows);
  const numeric = columns.filter((_, index) => kinds[index] === 'number');
  const textual = columns.filter((_, index) => kinds[index] === 'text');
  if (numeric.length === 0) return null;

  if (rows.length === 1) return { type: 'number', x: null, y: numeric.slice(0, 4) };

  if (textual.length === 0) {
    const [first, ...rest] = numeric as [string, ...string[]];
    if (rest.length === 0) return { type: 'bar', x: null, y: [first] };
    // All-numeric results: treat the first column as the axis (a year, a bucket…).
    return { type: rows.length > 60 ? 'scatter' : 'line', x: first, y: rest.slice(0, 4) };
  }

  const x = textual[0] as string;
  const firstX = rows[0]?.[columns.indexOf(x)] ?? null;
  const y = numeric.slice(0, 4);
  if (looksTemporal(firstX)) return { type: y.length === 1 ? 'area' : 'line', x, y };
  return { type: 'bar', x, y };
}

/** Drops references to columns that no longer exist in a new result. */
export function reconcileChart(
  config: ChartConfig | null | undefined,
  columns: readonly string[],
  rows: readonly CellValue[][],
): ChartConfig | null {
  if (!config) return suggestChart(columns, rows);
  const y = config.y.filter((column) => columns.includes(column));
  const x = config.x && columns.includes(config.x) ? config.x : null;
  if (y.length === 0) return suggestChart(columns, rows);
  return { type: config.type, x, y };
}

export interface ChartData {
  data: Array<Record<string, CellValue>>;
  /** True when rows were left out to keep the chart readable. */
  truncated: boolean;
}

export const MAX_POINTS: Record<ChartType, number> = {
  bar: 60,
  line: 600,
  area: 600,
  scatter: 2000,
  pie: 12,
  number: 1,
};

/** Shapes result rows into the record-per-point form the chart components expect. */
export function buildChartData(
  config: ChartConfig,
  columns: readonly string[],
  rows: readonly CellValue[][],
): ChartData {
  const limit = MAX_POINTS[config.type];
  const xIndex = config.x ? columns.indexOf(config.x) : -1;
  const yIndexes = config.y
    .map((column) => [column, columns.indexOf(column)] as const)
    .filter(([, index]) => index >= 0);

  const data = rows.slice(0, limit).map((row, rowIndex) => {
    const point: Record<string, CellValue> = {
      __x: xIndex >= 0 ? (row[xIndex] ?? null) : rowIndex + 1,
    };
    for (const [column, index] of yIndexes) {
      const value = row[index];
      point[column] = typeof value === 'number' ? value : null;
    }
    return point;
  });
  return { data, truncated: rows.length > limit };
}

const humanize = (column: string): string => column.replace(/_/g, ' ');

/** A readable default name for a chart, such as "Revenue and profit by category". */
export function suggestTitle(config: ChartConfig): string {
  const values = config.y.map(humanize);
  const joined =
    values.length > 1
      ? `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`
      : (values[0] ?? 'Chart');
  const title =
    config.x && config.type !== 'number' ? `${joined} by ${humanize(config.x)}` : joined;
  return title.charAt(0).toUpperCase() + title.slice(1);
}
