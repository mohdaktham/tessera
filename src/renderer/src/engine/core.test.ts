// @vitest-environment node
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Engine } from './core';

let sql: SqlJsStatic;
let engine: Engine;

beforeAll(async () => {
  sql = await initSqlJs();
});

beforeEach(() => {
  engine = new Engine(sql);
});

describe('Engine.run', () => {
  it('returns columns and rows for a SELECT', () => {
    const result = engine.run("SELECT 1 AS one, 'two' AS two, NULL AS three");
    expect(result.columns).toEqual(['one', 'two', 'three']);
    expect(result.rows).toEqual([[1, 'two', null]]);
    expect(result.mutated).toBe(false);
    expect(result.truncated).toBe(false);
  });

  it('runs multi-statement scripts and returns the last result set', () => {
    const result = engine.run(`
      CREATE TABLE t (id INTEGER PRIMARY KEY, label TEXT);
      INSERT INTO t (label) VALUES ('a'), ('b'), ('c');
      SELECT count(*) AS n FROM t;
    `);
    expect(result.statementCount).toBe(3);
    expect(result.rows).toEqual([[3]]);
    expect(result.mutated).toBe(true);
  });

  it('reports rows changed by a write', () => {
    engine.run('CREATE TABLE t (n INTEGER); INSERT INTO t VALUES (1), (2), (3)');
    expect(engine.run('UPDATE t SET n = n + 1 WHERE n > 1').changes).toBe(2);
  });

  it('caps the rows it returns and flags the truncation', () => {
    const result = engine.run(
      'WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1000) SELECT n FROM seq',
      100,
    );
    expect(result.rows).toHaveLength(100);
    expect(result.truncated).toBe(true);
  });

  it('summarises blobs instead of shipping raw bytes to the UI', () => {
    expect(engine.run("SELECT x'DEADBEEF' AS payload").rows[0]).toEqual(['<blob 4 bytes>']);
  });

  it('supports window functions and CTEs', () => {
    const result = engine.run(`
      WITH sales(region, amount) AS (VALUES ('east', 10), ('east', 30), ('west', 5))
      SELECT region, amount, SUM(amount) OVER (PARTITION BY region ORDER BY amount) AS running
      FROM sales ORDER BY region, amount
    `);
    expect(result.rows).toEqual([
      ['east', 10, 10],
      ['east', 30, 40],
      ['west', 5, 5],
    ]);
  });

  it('throws a readable error for invalid SQL', () => {
    expect(() => engine.run('SELEC 1')).toThrow(/syntax error/i);
  });

  it('rejects an empty script', () => {
    expect(() => engine.run('   -- nothing here')).toThrow(/no sql/i);
  });
});

describe('Engine.importTable', () => {
  it('infers column types and coerces values', () => {
    const summary = engine.importTable(
      'Sales Report 2026',
      ['Order ID', 'Unit Price', 'Postal Code', 'Notes'],
      [
        ['1', '19.99', '01234', 'first'],
        ['2', '5', '90210', ''],
        ['3', '', '00501', 'third'],
      ],
    );
    expect(summary.table).toBe('sales_report_2026');
    expect(summary.columns).toEqual([
      { name: 'order_id', type: 'INTEGER' },
      { name: 'unit_price', type: 'REAL' },
      { name: 'postal_code', type: 'TEXT' },
      { name: 'notes', type: 'TEXT' },
    ]);
    const rows = engine.run(
      'SELECT order_id, unit_price, postal_code, typeof(unit_price) FROM sales_report_2026',
    ).rows;
    expect(rows[0]).toEqual([1, 19.99, '01234', 'real']);
    expect(rows[2]).toEqual([3, null, '00501', 'null']);
  });

  it('never overwrites an existing table', () => {
    engine.importTable('people', ['name'], [['Ada']]);
    const second = engine.importTable('people', ['name'], [['Grace']]);
    expect(second.table).toBe('people_2');
    expect(engine.schema().map((table) => table.name)).toEqual(['people', 'people_2']);
  });

  it('rolls back completely when a row fails', () => {
    // A value that cannot be serialised makes the load fail part-way through.
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => engine.importTable('broken', ['a'], [['1'], [circular]])).toThrow();
    expect(engine.schema()).toEqual([]);
  });

  it('reports progress on large imports', () => {
    const rows = Array.from({ length: 12_000 }, (_, index) => [String(index)]);
    const ticks: number[] = [];
    engine.importTable('big', ['n'], rows, (done) => ticks.push(done));
    expect(ticks).toEqual([5000, 10_000, 12_000]);
  });
});

describe('Engine.schema', () => {
  it('describes tables, views, keys and row counts', () => {
    engine.run(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL, age INT);
      INSERT INTO users (email, age) VALUES ('a@example.com', 30), ('b@example.com', 41);
      CREATE VIEW adults AS SELECT * FROM users WHERE age >= 18;
    `);
    const [users, adults] = engine.schema();
    expect(users).toMatchObject({ name: 'users', kind: 'table', rowCount: 2 });
    expect(users?.columns[0]).toEqual({
      name: 'id',
      type: 'INTEGER',
      notNull: false,
      primaryKey: true,
    });
    expect(users?.columns[1]).toMatchObject({ name: 'email', notNull: true });
    expect(adults).toMatchObject({ name: 'adults', kind: 'view', rowCount: null });
  });
});

describe('Engine.explain', () => {
  it('shows whether a query uses an index', () => {
    engine.run('CREATE TABLE t (id INTEGER PRIMARY KEY, k TEXT); CREATE INDEX idx_k ON t (k)');
    const plan = engine.explain("SELECT * FROM t WHERE k = 'x'");
    expect(plan.map((node) => node.detail).join(' ')).toMatch(/USING (COVERING )?INDEX idx_k/);
  });
});

describe('Engine persistence', () => {
  it('round-trips through the SQLite file format', () => {
    engine.run("CREATE TABLE notes (body TEXT); INSERT INTO notes VALUES ('remember me')");
    const bytes = engine.export();
    expect(new TextDecoder().decode(bytes.slice(0, 15))).toBe('SQLite format 3');

    const restored = new Engine(sql, bytes);
    expect(restored.run('SELECT body FROM notes').rows).toEqual([['remember me']]);
  });

  it('refuses to open a file that is not a database, and keeps the current one', () => {
    engine.run('CREATE TABLE keep (n INTEGER)');
    expect(() => engine.replace(new TextEncoder().encode('definitely not sqlite'))).toThrow(
      /not a SQLite database/,
    );
    expect(engine.schema().map((table) => table.name)).toEqual(['keep']);
  });
});

describe('Engine.loadSample', () => {
  it('loads a consistent, joinable dataset', () => {
    engine.loadSample(undefined, { customers: 200, products: 24, orders: 3000 });
    const names = engine.schema().map((table) => table.name);
    expect(names).toEqual(['customers', 'orders', 'products', 'order_facts']);

    // Every order points at a real customer and product.
    expect(engine.run('SELECT count(*) FROM order_facts').rows).toEqual([[3000]]);
    const months = engine.run("SELECT count(DISTINCT strftime('%Y-%m', ordered_at)) FROM orders")
      .rows[0]?.[0];
    expect(months).toBe(24);
  });

  it('is deterministic and safe to run twice', () => {
    const sizes = { customers: 50, products: 12, orders: 500 };
    engine.loadSample(undefined, sizes);
    const first = engine.run('SELECT round(sum(revenue), 2) FROM order_facts').rows;
    engine.loadSample(undefined, sizes);
    expect(engine.run('SELECT round(sum(revenue), 2) FROM order_facts').rows).toEqual(first);
  });
});
