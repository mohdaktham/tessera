// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { buildChartData, columnKinds, reconcileChart, suggestChart, suggestTitle } from './chart';
import { toCsv, toJson, toMarkdown } from './exporters';
import { detectFormat } from './fileFormats';
import {
  formatBytes,
  formatCell,
  formatDuration,
  formatRelativeTime,
  isIdentifierColumn,
  pluralize,
} from './format';
import { fuzzyFilter, fuzzyMatch } from './fuzzy';
import { compareCells, sortedRowOrder } from './gridSort';
import { parseDelimited, parseJsonRecords } from './importers';
import {
  coerceValue,
  inferColumnType,
  inferColumns,
  sanitizeIdentifier,
  tableNameFromFile,
  uniqueNames,
} from './inferTypes';
import { layoutPlan } from './plan';
import { profileColumns } from './profile';
import { createRandom } from './prng';
import { buildSampleDataset } from './sampleData';
import { SAMPLE_QUERIES } from './sampleQueries';
import { eventToCombo, formatKeys } from './shortcuts';
import { describeSql, mayMutate, quoteIdent, stripSqlNoise } from './sqlUtils';
import type { CellValue } from './types';

describe('type inference', () => {
  it('picks the narrowest type that fits', () => {
    expect(inferColumnType(['1', '2', '-3'])).toBe('INTEGER');
    expect(inferColumnType(['1', '2.5', '1e3'])).toBe('REAL');
    expect(inferColumnType(['1', 'two'])).toBe('TEXT');
    expect(inferColumnType([1, 2.5, null])).toBe('REAL');
    expect(inferColumnType([true, false])).toBe('INTEGER');
  });

  it('ignores blanks and null markers, and treats all-empty columns as text', () => {
    expect(inferColumnType(['1', '', 'NULL', 'N/A', '4'])).toBe('INTEGER');
    expect(inferColumnType(['', '', null])).toBe('TEXT');
  });

  it('keeps codes with leading zeros as text', () => {
    expect(inferColumnType(['00123', '04567'])).toBe('TEXT');
    expect(inferColumnType(['0', '0.5'])).toBe('REAL');
  });

  it('keeps integers too large for a double as text', () => {
    expect(inferColumnType(['12345678901234567890'])).toBe('TEXT');
  });

  it('coerces values for storage', () => {
    expect(coerceValue('42', 'INTEGER')).toBe(42);
    expect(coerceValue(' 3.5 ', 'REAL')).toBe(3.5);
    expect(coerceValue('', 'INTEGER')).toBeNull();
    expect(coerceValue('', 'TEXT')).toBe('');
    expect(coerceValue('oops', 'INTEGER')).toBe('oops');
    expect(coerceValue(true, 'INTEGER')).toBe(1);
    expect(coerceValue({ a: 1 }, 'TEXT')).toBe('{"a":1}');
    expect(coerceValue(Number.NaN, 'REAL')).toBeNull();
  });

  it('turns headers into tidy unique identifiers', () => {
    expect(sanitizeIdentifier('Unit Price ($)')).toBe('unit_price');
    expect(sanitizeIdentifier('orderID')).toBe('order_id');
    expect(sanitizeIdentifier('Café Münster')).toBe('cafe_munster');
    expect(sanitizeIdentifier('2024 sales')).toBe('column_2024_sales');
    expect(sanitizeIdentifier('!!!')).toBe('column');
    expect(uniqueNames(['a', 'a', 'A', 'b'], ['b'])).toEqual(['a', 'a_2', 'A_3', 'b_2']);
    expect(tableNameFromFile('Q3 Sales (final).v2.csv')).toBe('q3_sales_final_v2');
    expect(inferColumns(['Name', 'Name', ''], [['x', 'y', '1']])).toEqual([
      { name: 'name', type: 'TEXT' },
      { name: 'name_2', type: 'TEXT' },
      { name: 'column_3', type: 'INTEGER' },
    ]);
  });
});

describe('file parsing', () => {
  it('detects formats by extension', () => {
    expect(detectFormat('Sales.CSV')).toBe('csv');
    expect(detectFormat('events.ndjson')).toBe('json');
    expect(detectFormat('app.sqlite3')).toBe('sqlite');
    expect(detectFormat('photo.png')).toBeNull();
  });

  it('parses CSV with quotes, embedded commas and newlines', () => {
    const parsed = parseDelimited('id,note\r\n1,"hello, world"\r\n2,"line one\nline two"\r\n\r\n');
    expect(parsed.headers).toEqual(['id', 'note']);
    expect(parsed.rows).toEqual([
      ['1', 'hello, world'],
      ['2', 'line one\nline two'],
    ]);
  });

  it('detects tab and semicolon delimiters and strips a byte-order mark', () => {
    expect(parseDelimited('a\tb\n1\t2\n').rows).toEqual([['1', '2']]);
    expect(parseDelimited('a;b\n1;2\n').rows).toEqual([['1', '2']]);
    expect(parseDelimited(String.fromCharCode(0xfeff) + 'a,b\n1,2\n').headers).toEqual(['a', 'b']);
  });

  it('explains what is wrong with unusable files', () => {
    expect(() => parseDelimited('')).toThrow(/empty/);
    expect(() => parseDelimited('only,a,header\n')).toThrow(/no data rows/);
    expect(() => parseJsonRecords('{not json')).toThrow(/not valid JSON/);
    expect(() => parseJsonRecords('[]')).toThrow(/at least one item/);
  });

  it('reads JSON arrays, wrapped arrays and newline-delimited JSON', () => {
    const expected = {
      headers: ['a', 'b'],
      rows: [
        [1, null],
        [2, 'x'],
      ],
    };
    expect(parseJsonRecords('[{"a":1},{"a":2,"b":"x"}]')).toEqual(expected);
    expect(parseJsonRecords('{"total":2,"data":[{"a":1},{"a":2,"b":"x"}]}')).toEqual(expected);
    expect(parseJsonRecords('{"a":1}\n{"a":2,"b":"x"}\n')).toEqual(expected);
    expect(parseJsonRecords('[1,2,3]')).toEqual({ headers: ['value'], rows: [[1], [2], [3]] });
  });
});

describe('exporters', () => {
  const columns = ['name', 'note', 'n'];
  const rows: CellValue[][] = [
    ['Ada', 'said "hi", twice', 1],
    ['Bo', null, 2.5],
  ];

  it('writes RFC 4180 CSV', () => {
    expect(toCsv(columns, rows)).toBe('name,note,n\r\nAda,"said ""hi"", twice",1\r\nBo,,2.5\r\n');
  });

  it('round-trips through its own CSV parser', () => {
    const tricky: CellValue[][] = [['a,b', 'line\nbreak', '"quoted"']];
    expect(parseDelimited(toCsv(['x', 'y', 'z'], tricky)).rows).toEqual(tricky);
  });

  it('writes JSON records and Markdown tables', () => {
    expect(JSON.parse(toJson(columns, rows))).toEqual([
      { name: 'Ada', note: 'said "hi", twice', n: 1 },
      { name: 'Bo', note: null, n: 2.5 },
    ]);
    expect(toMarkdown(['a', 'b'], [['x|y', null]])).toBe('| a | b |\n| --- | --- |\n| x\\|y |  |');
  });
});

describe('SQL helpers', () => {
  it('quotes identifiers safely', () => {
    expect(quoteIdent('orders')).toBe('"orders"');
    expect(quoteIdent('we"ird')).toBe('"we""ird"');
  });

  it('strips comments and string contents', () => {
    expect(
      stripSqlNoise("SELECT 'drop table x' -- delete\nFROM t /* update */").replace(/\s+/g, ' '),
    ).toBe("SELECT '' FROM t ");
  });

  it('detects statements that may change data', () => {
    expect(mayMutate('SELECT * FROM t')).toBe(false);
    expect(mayMutate("SELECT 'please delete me' AS note -- drop it")).toBe(false);
    expect(mayMutate('WITH x AS (SELECT 1) INSERT INTO t SELECT * FROM x')).toBe(true);
    expect(mayMutate('select 1; Drop Table t')).toBe(true);
    expect(mayMutate('SELECT updated_at, created FROM t')).toBe(false);
  });

  it('summarises a query for tab titles and history', () => {
    expect(describeSql('-- note\n  SELECT   a,\n b FROM t')).toBe('SELECT a, b FROM t');
    expect(describeSql('')).toBe('Empty query');
    expect(describeSql('SELECT ' + 'x'.repeat(100), 20)).toHaveLength(20);
  });
});

describe('fuzzy search', () => {
  it('matches subsequences and reports where', () => {
    expect(fuzzyMatch('ord', 'orders')?.indices).toEqual([0, 1, 2]);
    expect(fuzzyMatch('pvc', 'Preview customers')?.indices).toEqual([0, 3, 8]);
    expect(fuzzyMatch('xyz', 'orders')).toBeNull();
    expect(fuzzyMatch('', 'anything')).toEqual({ score: 0, indices: [] });
  });

  it('ranks prefixes and word starts above scattered matches', () => {
    const items = [
      'Format SQL',
      'Export database as SQLite file',
      'Toggle sidebar',
      'Go to dashboard',
    ];
    expect(fuzzyFilter('exp', items, (item) => item)[0]?.item).toBe(
      'Export database as SQLite file',
    );
    expect(fuzzyFilter('dash', items, (item) => item)[0]?.item).toBe('Go to dashboard');
    expect(fuzzyFilter('ts', items, (item) => item)[0]?.item).toBe('Toggle sidebar');
  });

  it('keeps the original order when there is no query', () => {
    expect(fuzzyFilter('', ['b', 'a', 'c'], (item) => item).map((entry) => entry.item)).toEqual([
      'b',
      'a',
      'c',
    ]);
  });
});

describe('grid sorting', () => {
  const rows: CellValue[][] = [['item 10'], [null], ['item 2'], [3], ['Item 1']];

  it('sorts naturally, numbers first, nulls last in both directions', () => {
    const asc = sortedRowOrder(rows, { column: 0, direction: 'asc' });
    expect([...(asc ?? [])].map((index) => rows[index]?.[0])).toEqual([
      3,
      'Item 1',
      'item 2',
      'item 10',
      null,
    ]);
    const desc = sortedRowOrder(rows, { column: 0, direction: 'desc' });
    expect([...(desc ?? [])].map((index) => rows[index]?.[0])).toEqual([
      'item 10',
      'item 2',
      'Item 1',
      3,
      null,
    ]);
  });

  it('leaves the rows untouched and returns null without a sort', () => {
    const copy = structuredClone(rows);
    sortedRowOrder(rows, { column: 0, direction: 'asc' });
    expect(rows).toEqual(copy);
    expect(sortedRowOrder(rows, null)).toBeNull();
    expect(compareCells(1, 2)).toBeLessThan(0);
  });
});

describe('charts', () => {
  const columns = ['month', 'revenue', 'orders'];
  const rows: CellValue[][] = [
    ['2026-01', 100, 4],
    ['2026-02', 150, null],
  ];

  it('classifies columns', () => {
    expect(columnKinds(columns, rows)).toEqual(['text', 'number', 'number']);
    expect(columnKinds(['empty'], [[null], [null]])).toEqual(['text']);
  });

  it('suggests a chart that suits the shape of the result', () => {
    expect(suggestChart(columns, rows)).toEqual({
      type: 'line',
      x: 'month',
      y: ['revenue', 'orders'],
    });
    expect(
      suggestChart(
        ['month', 'revenue'],
        [
          ['2026-01', 1],
          ['2026-02', 2],
        ],
      )?.type,
    ).toBe('area');
    expect(
      suggestChart(
        ['country', 'n'],
        [
          ['CA', 1],
          ['US', 2],
        ],
      ),
    ).toEqual({ type: 'bar', x: 'country', y: ['n'] });
    expect(suggestChart(['total', 'avg'], [[10, 2]])).toEqual({
      type: 'number',
      x: null,
      y: ['total', 'avg'],
    });
    expect(suggestChart(['name'], [['a'], ['b']])).toBeNull();
    expect(suggestChart([], [])).toBeNull();
  });

  it('keeps a chart across re-runs unless its columns disappear', () => {
    const config = { type: 'bar' as const, x: 'month', y: ['revenue'] };
    expect(reconcileChart(config, columns, rows)).toEqual(config);
    expect(
      reconcileChart(
        config,
        ['month', 'orders'],
        [
          ['2026-01', 1],
          ['2026-02', 2],
        ],
      )?.y,
    ).toEqual(['orders']);
    expect(reconcileChart({ ...config, x: 'gone' }, columns, rows)?.x).toBeNull();
  });

  it('builds chart records, capping the number of points', () => {
    const { data, truncated } = buildChartData(
      { type: 'bar', x: 'month', y: ['revenue', 'orders'] },
      columns,
      rows,
    );
    expect(data).toEqual([
      { __x: '2026-01', revenue: 100, orders: 4 },
      { __x: '2026-02', revenue: 150, orders: null },
    ]);
    expect(truncated).toBe(false);

    const many: CellValue[][] = Array.from({ length: 100 }, (_, index) => [`c${index}`, index]);
    const capped = buildChartData({ type: 'pie', x: 'label', y: ['n'] }, ['label', 'n'], many);
    expect(capped.data).toHaveLength(12);
    expect(capped.truncated).toBe(true);
  });

  it('names charts readably', () => {
    expect(suggestTitle({ type: 'bar', x: 'category', y: ['revenue', 'profit'] })).toBe(
      'Revenue and profit by category',
    );
    expect(suggestTitle({ type: 'number', x: null, y: ['average_order'] })).toBe('Average order');
  });

  it('ships sample queries whose charts reference real columns', () => {
    for (const query of SAMPLE_QUERIES) {
      for (const column of [...query.chart.y, ...(query.chart.x ? [query.chart.x] : [])]) {
        expect(query.sql, `${query.name} should select ${column}`).toMatch(
          new RegExp(`\\b${column}\\b`),
        );
      }
    }
  });
});

describe('profiling', () => {
  it('summarises numeric and text columns', () => {
    const [n, t, e] = profileColumns(
      ['n', 't', 'e'],
      [
        [1, 'a', null],
        [2, 'b', null],
        [3, 'a', null],
        [null, null, null],
        [10, 'a', null],
      ],
    );
    expect(n).toMatchObject({
      kind: 'number',
      count: 5,
      nulls: 1,
      distinct: 4,
      min: 1,
      max: 10,
      mean: 4,
      median: 2.5,
    });
    expect(n?.histogram.reduce((sum, bin) => sum + bin, 0)).toBe(4);
    expect(t).toMatchObject({ kind: 'text', nulls: 1, distinct: 2, min: 'a', max: 'b' });
    expect(t?.top[0]).toEqual({ value: 'a', count: 3 });
    expect(e).toMatchObject({ kind: 'empty', distinct: 0, min: null });
  });

  it('handles a constant column without dividing by zero', () => {
    const [constant] = profileColumns(['c'], [[7], [7], [7]]);
    expect(constant?.histogram[0]).toBe(3);
    expect(constant?.median).toBe(7);
  });
});

describe('query plans', () => {
  it('lays out the tree and separates table scans from index searches', () => {
    const rows = layoutPlan([
      { id: 2, parent: 0, detail: 'CO-ROUTINE totals' },
      { id: 5, parent: 2, detail: 'SCAN o' },
      { id: 7, parent: 2, detail: 'SEARCH c USING INTEGER PRIMARY KEY (rowid=?)' },
      { id: 20, parent: 0, detail: 'SCAN totals' },
      { id: 30, parent: 0, detail: 'SCAN (subquery-4)' },
    ]);
    expect(rows.map((row) => [row.depth, row.kind])).toEqual([
      [0, 'other'],
      [1, 'scan'],
      [1, 'search'],
      [0, 'other'],
      [0, 'other'],
    ]);
  });

  it('shows bytecode plans flat', () => {
    expect(layoutPlan([{ id: 1, parent: 99, detail: 'Init' }])).toEqual([
      { id: 1, parent: 99, detail: 'Init', depth: 0, kind: 'other' },
    ]);
  });
});

describe('formatting', () => {
  it('formats cells, sizes, durations and counts', () => {
    expect(formatCell(null)).toBe('NULL');
    expect(formatCell(1234567)).toBe('1,234,567');
    expect(formatCell(2026, true)).toBe('2026');
    expect(formatCell(0.123456789)).toBe('0.1235');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(6_600_000)).toBe('6.3 MB');
    expect(formatDuration(0.4)).toBe('<1 ms');
    expect(formatDuration(167.2)).toBe('167 ms');
    expect(formatDuration(2500)).toBe('2.50 s');
    expect(formatDuration(125_000)).toBe('2 min 5 s');
    expect(pluralize(1, 'row')).toBe('1 row');
    expect(pluralize(60000, 'row')).toBe('60,000 rows');
  });

  it('recognises columns that hold labels rather than quantities', () => {
    expect(['id', 'customer_id', 'year', 'postal_code'].every(isIdentifierColumn)).toBe(true);
    expect(['revenue', 'paid', 'years_active', 'idle'].some(isIdentifierColumn)).toBe(false);
  });

  it('describes times relative to now', () => {
    const now = Date.UTC(2026, 10, 11, 12);
    expect(formatRelativeTime(now - 5_000, now)).toBe('just now');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(formatRelativeTime(now - 26 * 3_600_000, now)).toBe('yesterday');
  });
});

describe('keyboard shortcuts', () => {
  const key = (init: Partial<KeyboardEvent>): KeyboardEvent =>
    ({ altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...init }) as KeyboardEvent;

  it('normalises events per platform', () => {
    expect(eventToCombo(key({ key: 'Enter', ctrlKey: true }), false)).toBe('mod+enter');
    expect(eventToCombo(key({ key: 'Enter', metaKey: true }), true)).toBe('mod+enter');
    expect(eventToCombo(key({ key: 'F', ctrlKey: true, shiftKey: true }), false)).toBe(
      'mod+shift+f',
    );
    expect(eventToCombo(key({ key: '?', ctrlKey: true, shiftKey: true }), false)).toBe(
      'mod+shift+/',
    );
  });

  it('ignores bare keys, lone modifiers and AltGr combinations', () => {
    expect(eventToCombo(key({ key: 'k' }), false)).toBeNull();
    expect(eventToCombo(key({ key: 'Control', ctrlKey: true }), false)).toBeNull();
    expect(eventToCombo(key({ key: 'e', ctrlKey: true, altKey: true }), false)).toBeNull();
    expect(eventToCombo(key({ key: 'k', ctrlKey: true }), true)).toBeNull();
  });

  it('reads Alt shortcuts from the physical key', () => {
    // On macOS, Alt+T types a dagger, so the character cannot be trusted.
    expect(eventToCombo(key({ key: '†', code: 'KeyT', altKey: true }), true)).toBe('alt+t');
    expect(eventToCombo(key({ key: '1', code: 'Digit1', altKey: true }), false)).toBe('alt+1');
    expect(
      eventToCombo(key({ key: 'ArrowLeft', code: 'ArrowLeft', altKey: true }), false),
    ).toBeNull();
    expect(
      eventToCombo(key({ key: 't', code: 'KeyT', altKey: true, shiftKey: true }), false),
    ).toBeNull();
  });

  it('labels key caps for each platform', () => {
    expect(formatKeys('alt+t', false)).toEqual(['Alt', 'T']);
    expect(formatKeys('alt+1', true)).toEqual(['⌥', '1']);
    expect(formatKeys('mod+shift+f', false)).toEqual(['Ctrl', 'Shift', 'F']);
    expect(formatKeys('mod+enter', true)).toEqual(['⌘', 'Enter']);
  });
});

describe('sample data', () => {
  it('is reproducible from its seed', () => {
    const a = createRandom(42);
    const b = createRandom(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(
      Array.from({ length: 5 }, () => b.next()),
    );
    expect(createRandom(43).next()).not.toBe(createRandom(42).next());
  });

  it('respects weights and ranges', () => {
    const random = createRandom(7);
    const picks = Array.from({ length: 2000 }, () => random.weighted([0, 3, 1]));
    expect(picks).not.toContain(0);
    expect(picks.filter((pick) => pick === 1).length).toBeGreaterThan(1300);
    expect(Array.from({ length: 500 }, () => random.int(2, 4)).every((n) => n >= 2 && n <= 4)).toBe(
      true,
    );
  });

  it('generates consistent tables', () => {
    const sizes = { customers: 30, products: 12, orders: 400 };
    const dataset = buildSampleDataset(1, sizes);
    expect(dataset).toEqual(buildSampleDataset(1, sizes));
    const [customers, products, orders] = dataset.tables;
    expect([customers?.rows.length, products?.rows.length, orders?.rows.length]).toEqual([
      30, 12, 400,
    ]);
    for (const table of dataset.tables) {
      expect(table.rows.every((row) => row.length === table.columns.length)).toBe(true);
    }
    expect(new Set(products?.rows.map((row) => row[1])).size).toBe(12);
    for (const [, customerId, productId, quantity, discount] of orders?.rows ?? []) {
      expect(customerId).toBeGreaterThanOrEqual(1);
      expect(customerId).toBeLessThanOrEqual(30);
      expect(productId).toBeLessThanOrEqual(12);
      expect(quantity).toBeGreaterThanOrEqual(1);
      expect(discount).toBeLessThan(1);
    }
  });
});
