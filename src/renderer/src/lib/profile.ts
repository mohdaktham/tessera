import type { CellValue } from './types';

export interface ColumnProfile {
  name: string;
  kind: 'number' | 'text' | 'empty';
  count: number;
  nulls: number;
  distinct: number;
  min: CellValue;
  max: CellValue;
  mean: number | null;
  median: number | null;
  /** Equal-width bucket counts for numeric columns. */
  histogram: number[];
  /** Most frequent values for text columns. */
  top: Array<{ value: string; count: number }>;
}

export const HISTOGRAM_BINS = 16;

function quantile(sorted: readonly number[], q: number): number {
  const position = (sorted.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const low = sorted[lower] as number;
  const high = sorted[upper] as number;
  return low + (high - low) * (position - lower);
}

/** Summarises each column of a result set: completeness, cardinality, range and shape. */
export function profileColumns(
  columns: readonly string[],
  rows: readonly CellValue[][],
): ColumnProfile[] {
  return columns.map((name, index) => {
    const numbers: number[] = [];
    const counts = new Map<CellValue, number>();
    let nulls = 0;
    let texts = 0;

    for (const row of rows) {
      const value = row[index] ?? null;
      if (value === null) {
        nulls++;
        continue;
      }
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (typeof value === 'number') numbers.push(value);
      else texts++;
    }

    const base = { name, count: rows.length, nulls, distinct: counts.size };

    if (counts.size === 0) {
      return {
        ...base,
        kind: 'empty',
        min: null,
        max: null,
        mean: null,
        median: null,
        histogram: [],
        top: [],
      };
    }

    if (texts === 0) {
      numbers.sort((a, b) => a - b);
      const min = numbers[0] as number;
      const max = numbers[numbers.length - 1] as number;
      const histogram = new Array<number>(HISTOGRAM_BINS).fill(0);
      const span = max - min;
      for (const value of numbers) {
        const bin =
          span === 0
            ? 0
            : Math.min(HISTOGRAM_BINS - 1, Math.floor(((value - min) / span) * HISTOGRAM_BINS));
        histogram[bin] = (histogram[bin] as number) + 1;
      }
      const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      return {
        ...base,
        kind: 'number',
        min,
        max,
        mean,
        median: quantile(numbers, 0.5),
        histogram,
        top: [],
      };
    }

    let min: string | null = null;
    let max: string | null = null;
    for (const value of counts.keys()) {
      const text = String(value);
      if (min === null || text < min) min = text;
      if (max === null || text > max) max = text;
    }
    const top = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([value, count]) => ({ value: String(value), count }));
    return { ...base, kind: 'text', min, max, mean: null, median: null, histogram: [], top };
  });
}
