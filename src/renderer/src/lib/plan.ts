import type { PlanNode } from './types';

export interface PlanRow extends PlanNode {
  depth: number;
  /** A full scan reads every row; a search uses an index or the primary key. */
  kind: 'scan' | 'search' | 'other';
}

/** Flattens SQLite's parent-pointer plan into display order with depths. */
export function layoutPlan(nodes: readonly PlanNode[]): PlanRow[] {
  const children = new Map<number, PlanNode[]>();
  for (const node of nodes) {
    const siblings = children.get(node.parent) ?? [];
    siblings.push(node);
    children.set(node.parent, siblings);
  }
  // Reading back an intermediate result (a CTE or subquery) is not a table scan.
  const intermediates = new Set<string>();
  for (const node of nodes) {
    const match = /^(?:CO-ROUTINE|MATERIALIZE)\s+(\S+)/.exec(node.detail);
    if (match?.[1]) intermediates.add(match[1]);
  }
  const classify = (detail: string): PlanRow['kind'] => {
    if (/^SEARCH\b/.test(detail)) return 'search';
    const scanned = /^SCAN\s+(\S+)/.exec(detail)?.[1];
    if (!scanned || scanned.startsWith('(') || intermediates.has(scanned)) return 'other';
    return 'scan';
  };

  const rows: PlanRow[] = [];
  const visit = (parent: number, depth: number): void => {
    for (const node of children.get(parent) ?? []) {
      const kind = classify(node.detail);
      rows.push({ ...node, depth, kind });
      visit(node.id, depth + 1);
    }
  };
  visit(0, 0);
  // Plans from plain EXPLAIN (bytecode) have no tree; show them flat.
  return rows.length > 0
    ? rows
    : nodes.map((node) => ({ ...node, depth: 0, kind: 'other' as const }));
}
