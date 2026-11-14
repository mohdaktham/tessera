import type { CSSProperties } from 'react';

const TILE_COLORS = ['bg-lapis', 'bg-verdigris', 'bg-porphyry', 'bg-ochre'] as const;

/** The Tessera mark: four tiles. */
export function Logo({ size = 18 }: { size?: number }) {
  const gap = Math.max(2, Math.round(size / 8));
  return (
    <span
      aria-hidden="true"
      className="grid flex-none grid-cols-2"
      style={{ width: size, height: size, gap }}
    >
      {TILE_COLORS.map((color) => (
        <span key={color} className={`${color} rounded-[22%]`} />
      ))}
    </span>
  );
}

/** The same mark, animated, for "working on it" states. */
export function MosaicLoader({ size = 18, label }: { size?: number; label: string }) {
  const gap = Math.max(2, Math.round(size / 8));
  return (
    <span
      role="status"
      aria-label={label}
      className="mosaic-loader grid flex-none grid-cols-2"
      style={{ width: size, height: size, gap }}
    >
      {TILE_COLORS.map((color) => (
        <span key={color} className={`${color} rounded-[22%]`} />
      ))}
    </span>
  );
}

const ART_PALETTE = [
  'var(--lapis)',
  'var(--verdigris)',
  'var(--ochre)',
  'var(--porphyry)',
  'var(--malachite)',
  'var(--coral)',
];

/**
 * A field of tiles that resolves from scattered to ordered, left to right:
 * raw rows becoming a tidy result. Deterministic, so it renders the same
 * every time.
 */
export function MosaicArt({ columns = 18, rows = 7 }: { columns?: number; rows?: number }) {
  const tiles: Array<{ key: string; style: CSSProperties }> = [];
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const order = column / (columns - 1);
      // A cheap, stable hash stands in for randomness.
      const noise =
        Math.abs(Math.sin((row + 1) * 12.9898 + (column + 1) * 78.233) * 43758.5453) % 1;
      const present = noise < 0.28 + order * 0.72;
      const sorted = order > 0.62;
      const color = sorted
        ? ART_PALETTE[row % ART_PALETTE.length]
        : ART_PALETTE[Math.floor(noise * 97) % ART_PALETTE.length];
      tiles.push({
        key: `${row}-${column}`,
        style: {
          background: color,
          opacity: present ? 0.3 + order * 0.7 : 0,
          transform: sorted
            ? undefined
            : `rotate(${Math.round((noise - 0.5) * 34 * (1 - order))}deg) scale(${0.72 + order * 0.28})`,
        },
      });
    }
  }
  return (
    <div
      aria-hidden="true"
      className="grid w-full max-w-[420px] gap-[5px]"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {tiles.map((tile) => (
        <span key={tile.key} className="aspect-square rounded-[3px]" style={tile.style} />
      ))}
    </div>
  );
}
