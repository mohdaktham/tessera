export interface FuzzyMatch {
  score: number;
  /** Positions in the text that matched, for highlighting. */
  indices: number[];
}

const isBoundary = (text: string, index: number): boolean => {
  if (index === 0) return true;
  const previous = text[index - 1] as string;
  const current = text[index] as string;
  return (
    /[\s_\-./:]/.test(previous) ||
    (previous === previous.toLowerCase() && current !== current.toLowerCase())
  );
};

/**
 * Subsequence fuzzy matcher. Every query character must appear in order;
 * matches score higher when they are consecutive, start a word, or sit near
 * the beginning of the text. Returns null when the query does not match.
 */
export function fuzzyMatch(query: string, text: string): FuzzyMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return { score: 0, indices: [] };
  const haystack = text.toLowerCase();

  const indices: number[] = [];
  let score = 0;
  let cursor = 0;
  let previous = -2;

  for (const char of needle) {
    if (char === ' ') continue;
    const found = haystack.indexOf(char, cursor);
    if (found === -1) return null;
    score += 1;
    if (found === previous + 1) score += 6;
    if (isBoundary(text, found)) score += 4;
    score -= Math.min(3, (found - cursor) * 0.25);
    indices.push(found);
    previous = found;
    cursor = found + 1;
  }

  if (haystack.startsWith(needle)) score += 12;
  else if (haystack.includes(needle)) score += 6;
  score -= text.length * 0.02;
  return { score, indices };
}

export interface Ranked<T> {
  item: T;
  match: FuzzyMatch;
}

/** Filters and ranks items, best match first. Ties keep their original order. */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  getText: (item: T) => string,
): Ranked<T>[] {
  const ranked: Array<Ranked<T> & { order: number }> = [];
  items.forEach((item, order) => {
    const match = fuzzyMatch(query, getText(item));
    if (match) ranked.push({ item, match, order });
  });
  return ranked.sort((a, b) => b.match.score - a.match.score || a.order - b.order);
}
