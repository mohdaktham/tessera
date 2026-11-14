import { useMemo } from 'react';
import { layoutPlan } from '@/lib/plan';
import type { PlanNode } from '@/lib/types';

const KIND_STYLE = {
  scan: { tile: 'bg-ochre', label: 'Full scan' },
  search: { tile: 'bg-malachite', label: 'Index search' },
  other: { tile: 'bg-line', label: '' },
} as const;

/** SQLite's query plan as an indented tree, flagging full scans versus index searches. */
export function PlanView({ plan, error }: { plan?: PlanNode[]; error?: string }) {
  const rows = useMemo(() => layoutPlan(plan ?? []), [plan]);

  if (error) {
    return <p className="selectable p-4 font-mono text-xs leading-relaxed text-danger">{error}</p>;
  }
  if (!plan) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-muted">
        Choose Explain to see how SQLite will run this query and whether it uses an index.
      </div>
    );
  }

  const scans = rows.filter((row) => row.kind === 'scan').length;

  return (
    <div className="h-full overflow-auto p-4">
      <p className="mb-3 max-w-[70ch] text-sm text-muted">
        {scans === 0
          ? 'Every table access in this plan uses an index or a primary key.'
          : `${scans} step${scans === 1 ? ' reads' : 's read'} a whole table. That is fine for small tables; on large ones, an index on the filtered or joined column usually helps.`}
      </p>
      <ol className="space-y-1">
        {rows.map((row) => (
          <li
            key={`${row.id}-${row.detail}`}
            className="flex items-center gap-2"
            style={{ paddingLeft: row.depth * 20 }}
          >
            <span className={`tile ${KIND_STYLE[row.kind].tile}`} />
            <span className="selectable font-mono text-xs">{row.detail}</span>
            {row.kind !== 'other' && (
              <span className="text-2xs text-faint">{KIND_STYLE[row.kind].label}</span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
