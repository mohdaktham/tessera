/** A value as it comes back from SQLite. Blobs are summarised to text in the engine. */
export type CellValue = string | number | null;

export interface QueryResult {
  columns: string[];
  rows: CellValue[][];
  /** True when the row cap was hit and more rows exist than were returned. */
  truncated: boolean;
  durationMs: number;
  /** Rows changed by the last INSERT, UPDATE or DELETE. */
  changes: number;
  statementCount: number;
  /** Whether the script may have changed data or schema. */
  mutated: boolean;
}

export interface ColumnInfo {
  name: string;
  type: string;
  primaryKey: boolean;
  notNull: boolean;
}

export interface TableInfo {
  name: string;
  kind: 'table' | 'view';
  /** Null for views, which are not counted up front. */
  rowCount: number | null;
  columns: ColumnInfo[];
}

export interface PlanNode {
  id: number;
  parent: number;
  detail: string;
}

export type ColumnType = 'INTEGER' | 'REAL' | 'TEXT';

export interface ColumnSpec {
  name: string;
  type: ColumnType;
}
