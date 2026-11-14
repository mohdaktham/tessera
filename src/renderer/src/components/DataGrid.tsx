import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { columnKinds } from '@/lib/chart';
import { formatCell, isIdentifierColumn } from '@/lib/format';
import { sortedRowOrder, type SortState } from '@/lib/gridSort';
import type { CellValue } from '@/lib/types';

const ROW_HEIGHT = 28;
const HEADER_HEIGHT = 32;
const GUTTER_WIDTH = 56;
const MIN_COLUMN = 64;
const MAX_AUTO_COLUMN = 340;

interface DataGridProps {
  columns: string[];
  rows: CellValue[][];
  onCopy?: (text: string) => void;
}

/** Sizes each column from its header and a sample of its values. */
function measureColumns(columns: string[], rows: CellValue[][]): number[] {
  const sample = rows.slice(0, 60);
  return columns.map((name, index) => {
    let longest = name.length + 3;
    for (const row of sample) {
      const length = formatCell(row[index] ?? null, isIdentifierColumn(name)).length;
      if (length > longest) longest = length;
    }
    return Math.max(MIN_COLUMN, Math.min(MAX_AUTO_COLUMN, Math.round(longest * 7.6 + 26)));
  });
}

/**
 * A virtualised results grid. Only the rows on screen exist in the DOM, so
 * scrolling stays smooth whether the result has fifty rows or two hundred
 * thousand. Supports sorting, column resizing, cell selection, keyboard
 * navigation and copy.
 */
export function DataGrid({ columns, rows, onCopy }: DataGridProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [widths, setWidths] = useState(() => measureColumns(columns, rows));
  const [sort, setSort] = useState<SortState | null>(null);
  const [selected, setSelected] = useState<{ row: number; column: number } | null>(null);

  // A new result set resets view state.
  useEffect(() => {
    setWidths(measureColumns(columns, rows));
    setSort(null);
    setSelected(null);
    scroller.current?.scrollTo({ top: 0, left: 0 });
  }, [columns, rows]);

  const kinds = useMemo(() => columnKinds(columns, rows.slice(0, 200)), [columns, rows]);
  const plain = useMemo(() => columns.map(isIdentifierColumn), [columns]);
  const order = useMemo(() => sortedRowOrder(rows, sort), [rows, sort]);
  const totalWidth = GUTTER_WIDTH + widths.reduce((sum, width) => sum + width, 0);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 14,
  });

  const rowAt = useCallback(
    (position: number): CellValue[] => rows[order ? (order[position] as number) : position] ?? [],
    [rows, order],
  );

  const toggleSort = (column: number): void => {
    setSelected(null);
    setSort((current) => {
      if (!current || current.column !== column) return { column, direction: 'asc' };
      return current.direction === 'asc' ? { column, direction: 'desc' } : null;
    });
  };

  const startResize = (event: ReactPointerEvent<HTMLSpanElement>, column: number): void => {
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    const startX = event.clientX;
    const startWidth = widths[column] ?? MIN_COLUMN;
    handle.setPointerCapture(event.pointerId);
    const move = (moveEvent: PointerEvent): void => {
      const next = Math.max(MIN_COLUMN, startWidth + moveEvent.clientX - startX);
      setWidths((current) => current.map((width, index) => (index === column ? next : width)));
    };
    const stop = (): void => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c' && selected) {
      const value = rowAt(selected.row)[selected.column] ?? null;
      onCopy?.(value === null ? '' : String(value));
      event.preventDefault();
      return;
    }
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      PageUp: [-20, 0],
      PageDown: [20, 0],
    };
    const move = moves[event.key];
    if (!move || rows.length === 0) return;
    event.preventDefault();
    const from = selected ?? { row: 0, column: 0 };
    const next = {
      row: Math.min(rows.length - 1, Math.max(0, from.row + (selected ? move[0] : 0))),
      column: Math.min(columns.length - 1, Math.max(0, from.column + (selected ? move[1] : 0))),
    };
    setSelected(next);
    virtualizer.scrollToIndex(next.row);
  };

  return (
    <div
      ref={scroller}
      role="grid"
      tabIndex={0}
      aria-label="Query results"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length}
      onKeyDown={onKeyDown}
      className="h-full overflow-auto bg-surface outline-none focus-visible:outline-none"
    >
      <div style={{ width: totalWidth, minWidth: '100%' }}>
        <div
          role="row"
          className="sticky top-0 z-20 flex border-b border-line bg-canvas text-xs font-semibold text-muted"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="sticky left-0 z-10 flex-none border-r border-line-soft bg-canvas"
            style={{ width: GUTTER_WIDTH }}
          />
          {columns.map((name, index) => {
            const active = sort?.column === index ? sort.direction : null;
            return (
              <div
                key={`${name}-${index}`}
                role="columnheader"
                aria-sort={
                  active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'
                }
                className="relative flex flex-none items-center border-r border-line-soft"
                style={{ width: widths[index] }}
              >
                <button
                  type="button"
                  onClick={() => toggleSort(index)}
                  title={`Sort by ${name}`}
                  className={`flex h-full min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left hover:text-ink ${
                    kinds[index] === 'number' ? 'flex-row-reverse' : ''
                  }`}
                >
                  <span
                    className={`tile ${kinds[index] === 'number' ? 'bg-lapis' : 'bg-verdigris'}`}
                  />
                  <span className="truncate">{name}</span>
                  {active === 'asc' && <ArrowUp size={12} className="flex-none text-accent" />}
                  {active === 'desc' && <ArrowDown size={12} className="flex-none text-accent" />}
                </button>
                <span
                  aria-hidden="true"
                  onPointerDown={(event) => startResize(event, index)}
                  onDoubleClick={() => setWidths(measureColumns(columns, rows))}
                  className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize touch-none hover:bg-accent/40"
                />
              </div>
            );
          })}
        </div>

        <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rowAt(item.index);
            return (
              <div
                key={item.key}
                role="row"
                aria-rowindex={item.index + 2}
                className="group absolute left-0 flex w-full border-b border-line-soft hover:bg-raised/50"
                style={{ top: item.start, height: ROW_HEIGHT }}
              >
                <div
                  className="sticky left-0 z-10 flex flex-none items-center justify-end border-r border-line-soft bg-canvas px-2 font-mono text-2xs text-faint"
                  style={{ width: GUTTER_WIDTH }}
                >
                  {item.index + 1}
                </div>
                {columns.map((_, column) => {
                  const value = row[column] ?? null;
                  const isSelected = selected?.row === item.index && selected.column === column;
                  return (
                    <div
                      key={column}
                      role="gridcell"
                      aria-selected={isSelected}
                      onMouseDown={() => setSelected({ row: item.index, column })}
                      onDoubleClick={() => onCopy?.(value === null ? '' : String(value))}
                      title={typeof value === 'string' && value.length > 40 ? value : undefined}
                      className={`flex flex-none items-center truncate border-r border-line-soft px-2.5 font-mono text-xs ${
                        typeof value === 'number' ? 'justify-end tabular-nums' : ''
                      } ${value === null ? 'text-faint italic' : ''} ${
                        isSelected
                          ? 'bg-accent-soft outline outline-1 -outline-offset-1 outline-accent'
                          : ''
                      }`}
                      style={{ width: widths[column] }}
                    >
                      <span className="truncate">{formatCell(value, plain[column])}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
