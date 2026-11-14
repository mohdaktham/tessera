import type { CellValue } from './types';

const csvCell = (value: CellValue): string => {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** RFC 4180 CSV with CRLF line endings. */
export function toCsv(columns: readonly string[], rows: readonly CellValue[][]): string {
  const lines = [columns.map(csvCell).join(',')];
  for (const row of rows) lines.push(row.map(csvCell).join(','));
  return lines.join('\r\n') + '\r\n';
}

export function toJson(columns: readonly string[], rows: readonly CellValue[][]): string {
  const records = rows.map((row) =>
    Object.fromEntries(columns.map((column, index) => [column, row[index] ?? null])),
  );
  return JSON.stringify(records, null, 2);
}

const markdownCell = (value: CellValue): string =>
  value === null ? '' : String(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');

/** A GitHub-flavoured Markdown table, handy for pasting into issues and docs. */
export function toMarkdown(columns: readonly string[], rows: readonly CellValue[][]): string {
  const header = `| ${columns.map(markdownCell).join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${row.map(markdownCell).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}
