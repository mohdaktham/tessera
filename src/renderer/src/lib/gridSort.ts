import type { CellValue } from './types';

export interface SortState {
  column: number;
  direction: 'asc' | 'desc';
}

const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

/** Numbers sort before text, text sorts naturally ("item 2" before "item 10"). */
export function compareCells(a: CellValue, b: CellValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'number') return -1;
  if (typeof b === 'number') return 1;
  return collator.compare(a as string, b as string);
}

/**
 * Returns the row order for a sort without copying or mutating the rows.
 * Nulls always go last, whichever direction is chosen. Returns null when
 * there is no sort, meaning "use the original order".
 */
export function sortedRowOrder(
  rows: readonly CellValue[][],
  sort: SortState | null,
): Uint32Array | null {
  if (!sort) return null;
  const { column, direction } = sort;
  const sign = direction === 'asc' ? 1 : -1;
  const order = new Uint32Array(rows.length);
  for (let index = 0; index < order.length; index++) order[index] = index;
  order.sort((left, right) => {
    const a = rows[left]?.[column] ?? null;
    const b = rows[right]?.[column] ?? null;
    if (a === null && b === null) return left - right;
    if (a === null) return 1;
    if (b === null) return -1;
    return sign * compareCells(a, b) || left - right;
  });
  return order;
}
