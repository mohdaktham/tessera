import type { CellValue, ColumnSpec, ColumnType } from './types';

const INTEGER = /^[+-]?\d{1,15}$/;
const REAL = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NULLISH = new Set(['', 'null', 'NULL', 'NA', 'N/A', 'NaN', 'nan']);

export const isNullish = (raw: string): boolean => NULLISH.has(raw.trim());

/**
 * Infers the narrowest SQLite type that fits every non-empty value in a sample.
 * Values with leading zeros ("00123") stay text so codes and postal codes survive.
 */
export function inferColumnType(values: Iterable<unknown>): ColumnType {
  let type: ColumnType = 'INTEGER';
  let seen = 0;
  for (const value of values) {
    if (value == null) continue;
    if (typeof value === 'number') {
      seen++;
      if (!Number.isInteger(value)) type = 'REAL';
      continue;
    }
    if (typeof value === 'boolean') {
      seen++;
      continue;
    }
    if (typeof value !== 'string') return 'TEXT';
    const raw = value.trim();
    if (NULLISH.has(raw)) continue;
    seen++;
    if (/^[+-]?0\d/.test(raw)) return 'TEXT';
    if (INTEGER.test(raw)) continue;
    // Digits-only values too long for a double (card numbers, big ids) would lose precision.
    if (/^[+-]?\d+$/.test(raw)) return 'TEXT';
    if (REAL.test(raw)) type = 'REAL';
    else return 'TEXT';
  }
  return seen === 0 ? 'TEXT' : type;
}

/** Converts a raw parsed value into what gets stored for the given column type. */
export function coerceValue(raw: unknown, type: ColumnType): CellValue {
  if (raw == null) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  if (typeof raw === 'object') return JSON.stringify(raw);
  const text = String(raw);
  if (type === 'TEXT') return text;
  const trimmed = text.trim();
  if (NULLISH.has(trimmed)) return null;
  const numeric = Number(trimmed);
  // A stray non-numeric value past the sampled rows is kept as text rather than dropped.
  return Number.isFinite(numeric) ? numeric : text;
}

/** Turns an arbitrary header or file name into a tidy snake_case identifier. */
export function sanitizeIdentifier(raw: string, fallback = 'column'): string {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  if (!cleaned) return fallback;
  return /^\d/.test(cleaned) ? `${fallback}_${cleaned}` : cleaned;
}

/** Makes names unique by appending _2, _3… to repeats. */
export function uniqueNames(names: readonly string[], taken: Iterable<string> = []): string[] {
  const used = new Set<string>([...taken].map((name) => name.toLowerCase()));
  return names.map((name) => {
    let candidate = name;
    for (let suffix = 2; used.has(candidate.toLowerCase()); suffix++)
      candidate = `${name}_${suffix}`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

export function tableNameFromFile(fileName: string): string {
  return sanitizeIdentifier(fileName.replace(/\.[^.]+$/, ''), 'table');
}

/** Builds column specs from headers and a sample of rows. */
export function inferColumns(
  headers: readonly string[],
  rows: readonly unknown[][],
  sampleSize = 2000,
): ColumnSpec[] {
  const names = uniqueNames(
    headers.map((header, index) => sanitizeIdentifier(header, `column_${index + 1}`)),
  );
  const sample = rows.length > sampleSize ? rows.slice(0, sampleSize) : rows;
  return names.map((name, index) => ({
    name,
    type: inferColumnType(sample.map((row) => row[index])),
  }));
}
