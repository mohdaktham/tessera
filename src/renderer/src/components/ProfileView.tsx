import { useMemo } from 'react';
import { formatCell, formatInteger, formatNumber } from '@/lib/format';
import { profileColumns, type ColumnProfile } from '@/lib/profile';
import type { CellValue } from '@/lib/types';

function Histogram({ bins }: { bins: number[] }) {
  const peak = Math.max(...bins, 1);
  return (
    <div className="flex h-7 items-end gap-px" aria-hidden="true">
      {bins.map((count, index) => (
        <span
          key={index}
          className="w-1.5 rounded-t-[1px] bg-lapis"
          style={{
            height: `${Math.max(count > 0 ? 8 : 0, (count / peak) * 100)}%`,
            opacity: count > 0 ? 1 : 0.15,
          }}
        />
      ))}
    </div>
  );
}

function TopValues({ profile }: { profile: ColumnProfile }) {
  const filled = profile.count - profile.nulls;
  return (
    <div className="flex flex-col gap-0.5">
      {profile.top.slice(0, 3).map(({ value, count }) => (
        <div key={value} className="flex items-center gap-2">
          <span
            className="h-1 flex-none rounded-full bg-verdigris"
            style={{ width: Math.max(3, (count / filled) * 64) }}
          />
          <span className="max-w-[150px] truncate font-mono text-2xs">{value}</span>
          <span className="text-2xs text-faint tabular-nums">
            {Math.round((count / filled) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** A per-column summary of the current result: completeness, cardinality, range and distribution. */
export function ProfileView({ columns, rows }: { columns: string[]; rows: CellValue[][] }) {
  const profiles = useMemo(() => profileColumns(columns, rows), [columns, rows]);

  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead className="sticky top-0 z-10 bg-canvas text-xs text-muted">
          <tr className="border-b border-line">
            {['Column', 'Filled', 'Distinct', 'Min', 'Max', 'Mean', 'Median', 'Distribution'].map(
              (heading, index) => (
                <th
                  key={heading}
                  className={`px-3 py-2 font-semibold whitespace-nowrap ${index > 0 && index < 7 ? 'text-right' : ''}`}
                >
                  {heading}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {profiles.map((profile) => {
            const filled =
              profile.count === 0 ? 0 : (profile.count - profile.nulls) / profile.count;
            return (
              <tr key={profile.name} className="border-b border-line-soft align-middle">
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`tile ${profile.kind === 'number' ? 'bg-lapis' : profile.kind === 'text' ? 'bg-verdigris' : 'bg-line'}`}
                    />
                    <span className="font-mono text-xs font-medium">{profile.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="h-1 w-12 overflow-hidden rounded-full bg-raised">
                      <span
                        className={`block h-full rounded-full ${filled < 0.9 ? 'bg-ochre' : 'bg-malachite'}`}
                        style={{ width: `${filled * 100}%` }}
                      />
                    </span>
                    <span className="w-10 text-xs tabular-nums">
                      {(filled * 100).toFixed(filled === 1 || filled === 0 ? 0 : 1)}%
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                  {formatInteger(profile.distinct)}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-right font-mono text-xs">
                  {profile.min === null ? '–' : formatCell(profile.min)}
                </td>
                <td className="max-w-[140px] truncate px-3 py-2 text-right font-mono text-xs">
                  {profile.max === null ? '–' : formatCell(profile.max)}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                  {profile.mean === null ? '–' : formatNumber(Number(profile.mean.toPrecision(6)))}
                </td>
                <td className="px-3 py-2 text-right font-mono text-xs tabular-nums">
                  {profile.median === null
                    ? '–'
                    : formatNumber(Number(profile.median.toPrecision(6)))}
                </td>
                <td className="px-3 py-2">
                  {profile.kind === 'number' ? (
                    <Histogram bins={profile.histogram} />
                  ) : profile.kind === 'text' ? (
                    <TopValues profile={profile} />
                  ) : (
                    <span className="text-xs text-faint">All values are empty</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
