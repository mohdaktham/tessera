export type ImportFormat = 'csv' | 'json';

/** Decides how to read a file from its extension. Null means unsupported. */
export function detectFormat(fileName: string): ImportFormat | 'sqlite' | null {
  const extension = fileName.toLowerCase().split('.').pop() ?? '';
  if (['csv', 'tsv', 'txt', 'tab'].includes(extension)) return 'csv';
  if (['json', 'ndjson', 'jsonl'].includes(extension)) return 'json';
  if (['sqlite', 'sqlite3', 'db'].includes(extension)) return 'sqlite';
  return null;
}
