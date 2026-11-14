import Papa from 'papaparse';
import type { ImportFormat } from './fileFormats';

export interface ParsedTable {
  headers: string[];
  rows: unknown[][];
}

/** Removes the byte-order mark some editors put at the start of a file. */
const stripBom = (text: string): string => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

/** Parses CSV or TSV text. The delimiter is detected; the first row is the header. */
export function parseDelimited(text: string): ParsedTable {
  const parsed = Papa.parse<string[]>(stripBom(text), { skipEmptyLines: 'greedy' });
  const fatal = parsed.errors.find((error) => error.type === 'Quotes');
  if (fatal)
    throw new Error(`Could not parse the file: ${fatal.message} (row ${(fatal.row ?? 0) + 1})`);
  const [headers, ...rows] = parsed.data;
  if (!headers || headers.length === 0) throw new Error('The file is empty.');
  if (rows.length === 0) throw new Error('The file has a header row but no data rows.');
  return { headers: headers.map((header) => String(header)), rows };
}

/**
 * Parses a JSON array of objects, a `{ "data": [...] }` wrapper, or
 * newline-delimited JSON. Columns are the union of all keys, in first-seen order.
 */
export function parseJsonRecords(text: string): ParsedTable {
  const trimmed = stripBom(text).trim();
  if (!trimmed) throw new Error('The file is empty.');

  let records: unknown;
  try {
    records = JSON.parse(trimmed);
  } catch (error) {
    // Not one JSON document: try one document per line.
    try {
      records = trimmed
        .split(/\r?\n/)
        .filter((line) => line.trim() !== '')
        .map((line) => JSON.parse(line) as unknown);
    } catch {
      throw new Error(`The file is not valid JSON: ${(error as Error).message}`);
    }
  }

  if (!Array.isArray(records) && records && typeof records === 'object') {
    const firstArray = Object.values(records).find(Array.isArray);
    records = firstArray ?? [records];
  }
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Expected a JSON array of objects with at least one item.');
  }

  const headers: string[] = [];
  const positions = new Map<string, number>();
  for (const record of records) {
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      for (const key of Object.keys(record)) {
        if (!positions.has(key)) {
          positions.set(key, headers.length);
          headers.push(key);
        }
      }
    }
  }
  if (headers.length === 0) {
    return { headers: ['value'], rows: records.map((value) => [value]) };
  }
  const rows = records.map((record) => {
    const row: unknown[] = new Array(headers.length).fill(null);
    if (record && typeof record === 'object') {
      for (const [key, value] of Object.entries(record)) {
        const position = positions.get(key);
        if (position !== undefined) row[position] = value;
      }
    }
    return row;
  });
  return { headers, rows };
}

export function parseFile(text: string, format: ImportFormat): ParsedTable {
  return format === 'json' ? parseJsonRecords(text) : parseDelimited(text);
}
