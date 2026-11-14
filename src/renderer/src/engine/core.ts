/**
 * The query engine: a thin, typed layer over SQLite compiled to WebAssembly
 * (sql.js). It has no dependency on the DOM or on worker APIs, so the exact
 * code that runs inside the app is also exercised directly by unit tests.
 */
import type { Database, SqlJsStatic, SqlValue } from 'sql.js';
import { coerceValue, inferColumns, sanitizeIdentifier, uniqueNames } from '../lib/inferTypes';
import { buildSampleDataset, type SampleSizes } from '../lib/sampleData';
import { mayMutate, quoteIdent } from '../lib/sqlUtils';
import type { CellValue, ColumnSpec, PlanNode, QueryResult, TableInfo } from '../lib/types';

export const DEFAULT_ROW_LIMIT = 50_000;
const PROGRESS_EVERY = 5_000;

export type ProgressHandler = (done: number, total: number, label: string) => void;

export interface ImportSummary {
  table: string;
  rowCount: number;
  columns: ColumnSpec[];
}

const toCell = (value: SqlValue): CellValue =>
  value instanceof Uint8Array ? `<blob ${value.byteLength} bytes>` : value;

export class Engine {
  private db: Database;

  constructor(
    private readonly sql: SqlJsStatic,
    bytes?: Uint8Array | null,
  ) {
    this.db = bytes ? new sql.Database(bytes) : new sql.Database();
    // Fail fast if the bytes are not a SQLite database.
    this.db.exec('SELECT count(*) FROM sqlite_schema');
  }

  get sqliteVersion(): string {
    return String(this.db.exec('SELECT sqlite_version()')[0]?.values[0]?.[0] ?? '');
  }

  /**
   * Runs one or more statements. The rows of the last statement that returns
   * columns become the result, capped at `maxRows` so a runaway SELECT cannot
   * exhaust memory.
   */
  run(sqlText: string, maxRows = DEFAULT_ROW_LIMIT): QueryResult {
    const started = performance.now();
    let columns: string[] = [];
    let rows: CellValue[][] = [];
    let truncated = false;
    let statementCount = 0;
    let changes = 0;

    for (const statement of this.db.iterateStatements(sqlText)) {
      statementCount++;
      const names = statement.getColumnNames();
      if (names.length === 0) {
        statement.step();
        changes = this.db.getRowsModified();
        continue;
      }
      columns = names;
      rows = [];
      truncated = false;
      while (statement.step()) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        rows.push(statement.get().map(toCell));
      }
    }

    if (statementCount === 0) throw new Error('There is no SQL to run.');

    return {
      columns,
      rows,
      truncated,
      changes,
      statementCount,
      mutated: mayMutate(sqlText),
      durationMs: performance.now() - started,
    };
  }

  /** Lists user tables and views with their columns and row counts. */
  schema(): TableInfo[] {
    const objects = this.db.exec(
      "SELECT name, type FROM sqlite_schema WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name COLLATE NOCASE",
    )[0];
    if (!objects) return [];

    return objects.values.map(([rawName, rawKind]) => {
      const name = String(rawName);
      const kind = rawKind === 'view' ? 'view' : 'table';
      const info = this.db.exec(`PRAGMA table_info(${quoteIdent(name)})`)[0];
      const columns = (info?.values ?? []).map((row) => ({
        name: String(row[1]),
        type: String(row[2] ?? '').toUpperCase() || 'ANY',
        notNull: row[3] === 1,
        primaryKey: Number(row[5]) > 0,
      }));
      const rowCount =
        kind === 'table'
          ? Number(this.db.exec(`SELECT count(*) FROM ${quoteIdent(name)}`)[0]?.values[0]?.[0] ?? 0)
          : null;
      return { name, kind, rowCount, columns };
    });
  }

  /** Returns SQLite's query plan for the last statement in the script. */
  explain(sqlText: string): PlanNode[] {
    let last = '';
    for (const statement of this.db.iterateStatements(sqlText)) last = statement.getSQL();
    if (!last.trim()) throw new Error('There is no SQL to explain.');
    const target = /^\s*explain\b/i.test(last) ? last : `EXPLAIN QUERY PLAN ${last}`;
    const plan = this.db.exec(target)[0];
    if (!plan) return [];
    return plan.values.map((row) => ({
      id: Number(row[0]),
      parent: Number(row[1]),
      detail: String(row[row.length - 1]),
    }));
  }

  private tableNames(): string[] {
    const result = this.db.exec(
      "SELECT name FROM sqlite_schema WHERE type IN ('table', 'view')",
    )[0];
    return (result?.values ?? []).map(([name]) => String(name));
  }

  /** Creates a table and bulk-loads rows inside a single transaction. */
  private loadTable(
    name: string,
    columns: readonly ColumnSpec[],
    rows: readonly unknown[][],
    options: { primaryKey?: string; onProgress?: ProgressHandler; label?: string } = {},
  ): void {
    const definitions = columns.map(
      (column) =>
        `${quoteIdent(column.name)} ${column.type}${column.name === options.primaryKey ? ' PRIMARY KEY' : ''}`,
    );
    const placeholders = columns.map(() => '?').join(', ');

    this.db.exec('BEGIN');
    try {
      this.db.exec(`CREATE TABLE ${quoteIdent(name)} (${definitions.join(', ')})`);
      const insert = this.db.prepare(`INSERT INTO ${quoteIdent(name)} VALUES (${placeholders})`);
      try {
        const width = columns.length;
        for (let index = 0; index < rows.length; index++) {
          const row = rows[index] as unknown[];
          const values: CellValue[] = new Array(width);
          for (let column = 0; column < width; column++) {
            values[column] = coerceValue(row[column], (columns[column] as ColumnSpec).type);
          }
          insert.run(values);
          if (options.onProgress && (index + 1) % PROGRESS_EVERY === 0) {
            options.onProgress(index + 1, rows.length, options.label ?? name);
          }
        }
      } finally {
        insert.free();
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    options.onProgress?.(rows.length, rows.length, options.label ?? name);
  }

  /** Imports parsed rows as a new table, inferring column types from the data. */
  importTable(
    baseName: string,
    headers: readonly string[],
    rows: readonly unknown[][],
    onProgress?: ProgressHandler,
  ): ImportSummary {
    const table = uniqueNames(
      [sanitizeIdentifier(baseName, 'table')],
      this.tableNames(),
    )[0] as string;
    const columns = inferColumns(headers, rows);
    this.loadTable(table, columns, rows, { onProgress, label: table });
    return { table, rowCount: rows.length, columns };
  }

  /** Replaces any earlier copy of the sample tables with a fresh one. */
  loadSample(onProgress?: ProgressHandler, sizes?: SampleSizes, seed?: number): string[] {
    const dataset = buildSampleDataset(seed, sizes);
    this.db.exec('DROP VIEW IF EXISTS order_facts');
    for (const table of dataset.tables) {
      this.db.exec(`DROP TABLE IF EXISTS ${quoteIdent(table.name)}`);
      this.loadTable(table.name, table.columns, table.rows, {
        primaryKey: table.primaryKey,
        onProgress,
      });
    }
    for (const statement of dataset.postLoad) this.db.exec(statement);
    return [...dataset.tables.map((table) => table.name), 'order_facts'];
  }

  /** Serialises the whole database to the standard SQLite file format. */
  export(): Uint8Array {
    return this.db.export();
  }

  /** Swaps in a different database, keeping the current one if the bytes are invalid. */
  replace(bytes: Uint8Array | null): void {
    const next = bytes ? new this.sql.Database(bytes) : new this.sql.Database();
    try {
      next.exec('SELECT count(*) FROM sqlite_schema');
    } catch {
      next.close();
      throw new Error('That file is not a SQLite database.');
    }
    this.db.close();
    this.db = next;
  }

  close(): void {
    this.db.close();
  }
}
