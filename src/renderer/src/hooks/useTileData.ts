import { useEffect, useState } from 'react';
import type { QueryResult } from '@/lib/types';
import { engine, useWorkspace } from '@/store/workspace';

export type TileData =
  | { status: 'loading'; result?: QueryResult }
  | { status: 'ready'; result: QueryResult }
  | { status: 'error'; error: string };

const TILE_ROW_LIMIT = 2000;

/** Runs a dashboard tile's query, and again whenever the underlying data changes. */
export function useTileData(sql: string, refreshKey: number): TileData {
  const ready = useWorkspace((state) => state.engineStatus === 'ready');
  const dataVersion = useWorkspace((state) => state.dataVersion);
  const [data, setData] = useState<TileData>({ status: 'loading' });

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setData((previous) => ({
      status: 'loading',
      result: 'result' in previous ? previous.result : undefined,
    }));
    engine()
      .call('run', { sql, maxRows: TILE_ROW_LIMIT })
      .then(
        (result) => {
          if (!cancelled) setData({ status: 'ready', result });
        },
        (error: unknown) => {
          if (!cancelled)
            setData({
              status: 'error',
              error: error instanceof Error ? error.message : String(error),
            });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [sql, ready, dataVersion, refreshKey]);

  return data;
}
