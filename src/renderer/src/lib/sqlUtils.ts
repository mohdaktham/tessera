/** Quotes an identifier for SQLite, escaping embedded double quotes. */
export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Removes comments and the contents of string literals so keywords can be matched safely. */
export function stripSqlNoise(sql: string): string {
  let out = '';
  let index = 0;
  while (index < sql.length) {
    const char = sql[index] as string;
    const next = sql[index + 1];
    if (char === '-' && next === '-') {
      const end = sql.indexOf('\n', index);
      index = end === -1 ? sql.length : end;
    } else if (char === '/' && next === '*') {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      out += ' ';
    } else if (char === "'" || char === '"' || char === '`') {
      // Skip to the matching quote; a doubled quote is an escape.
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === char) {
          if (sql[cursor + 1] === char) cursor += 2;
          else break;
        } else cursor++;
      }
      out += char === "'" ? "''" : ' x ';
      index = cursor + 1;
    } else {
      out += char;
      index++;
    }
  }
  return out;
}

const MUTATING =
  /\b(insert|update|delete|replace|create|drop|alter|attach|detach|vacuum|reindex)\b/i;

/**
 * Conservative check for whether a script might change data or schema. A false
 * positive only costs an extra autosave; a false negative would lose work, so
 * this errs towards true.
 */
export function mayMutate(sql: string): boolean {
  return MUTATING.test(stripSqlNoise(sql));
}

/** A short, human title for a query tab, taken from its first meaningful line. */
export function describeSql(sql: string, maxLength = 48): string {
  const compact = stripSqlNoise(sql).replace(/\s+/g, ' ').trim();
  if (!compact) return 'Empty query';
  return compact.length > maxLength ? `${compact.slice(0, maxLength - 1)}…` : compact;
}
