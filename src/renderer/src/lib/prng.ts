/**
 * mulberry32: a tiny, fast, seedable pseudo-random generator. Seeding makes the
 * sample dataset identical on every machine, which keeps demos and tests stable.
 */
export interface Random {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max]. */
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  /** Picks an index with probability proportional to its weight. */
  weighted(weights: readonly number[]): number;
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0;
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number): number => min + Math.floor(next() * (max - min + 1));
  return {
    next,
    int,
    pick: <T>(items: readonly T[]): T => items[int(0, items.length - 1)] as T,
    weighted: (weights) => {
      const total = weights.reduce((sum, weight) => sum + weight, 0);
      let roll = next() * total;
      for (let index = 0; index < weights.length; index++) {
        roll -= weights[index] as number;
        if (roll < 0) return index;
      }
      return weights.length - 1;
    },
  };
}
