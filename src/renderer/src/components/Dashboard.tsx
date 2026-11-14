import { lazy, Suspense, useState } from 'react';
import { ArrowLeft, ArrowRight, Columns2, RefreshCw, SquareTerminal, Trash2 } from 'lucide-react';
import { useTileData } from '@/hooks/useTileData';
import { formatDuration } from '@/lib/format';
import { useWorkspace, type DashboardTile } from '@/store/workspace';
import { ChartMessage } from './ChartMessage';
import { MosaicLoader } from './Mosaic';

const ChartView = lazy(() => import('./ChartView'));

const SPAN_CLASS = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 4: 'lg:col-span-4' } as const;
const NEXT_SPAN = { 1: 2, 2: 4, 4: 1 } as const;

function Tile({
  tile,
  refreshKey,
  isFirst,
  isLast,
}: {
  tile: DashboardTile;
  refreshKey: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const data = useTileData(tile.sql, refreshKey);
  const { removeTile, updateTile, moveTile, newTab } = useWorkspace.getState();
  const result = 'result' in data ? data.result : undefined;
  const isNumber = tile.chart.type === 'number';

  return (
    <article
      className={`group flex flex-col rounded-lg border border-line bg-surface sm:col-span-2 ${SPAN_CLASS[tile.span]} ${isNumber ? '' : 'h-[300px]'}`}
      aria-label={tile.title}
    >
      <header className="flex h-9 flex-none items-center gap-1 pr-1.5 pl-3.5">
        <h3 className="truncate text-sm font-semibold" title={tile.title}>
          {tile.title}
        </h3>
        {data.status === 'loading' && <MosaicLoader size={10} label={`Loading ${tile.title}`} />}
        {data.status === 'ready' && (
          <span className="hidden flex-none text-2xs text-faint group-hover:inline">
            {formatDuration(data.result.durationMs)}
          </span>
        )}
        <div className="ml-auto hidden flex-none items-center group-focus-within:flex group-hover:flex pointer-coarse:flex">
          <button
            type="button"
            className="icon-btn h-6 w-6"
            disabled={isFirst}
            onClick={() => moveTile(tile.id, -1)}
            aria-label={`Move ${tile.title} earlier`}
            title="Move earlier"
          >
            <ArrowLeft size={13} />
          </button>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            disabled={isLast}
            onClick={() => moveTile(tile.id, 1)}
            aria-label={`Move ${tile.title} later`}
            title="Move later"
          >
            <ArrowRight size={13} />
          </button>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => updateTile(tile.id, { span: NEXT_SPAN[tile.span] })}
            aria-label={`Change width of ${tile.title}`}
            title="Change width"
          >
            <Columns2 size={13} />
          </button>
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => newTab(tile.sql, tile.title)}
            aria-label={`Open the query for ${tile.title}`}
            title="Open query in editor"
          >
            <SquareTerminal size={13} />
          </button>
          <button
            type="button"
            className="icon-btn h-6 w-6 hover:text-danger"
            onClick={() => removeTile(tile.id)}
            aria-label={`Remove ${tile.title}`}
            title="Remove from dashboard"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </header>
      <div className={`min-h-0 flex-1 ${isNumber ? 'pb-2' : 'px-1 pb-2'}`}>
        {data.status === 'error' ? (
          <div className="h-full overflow-auto px-3">
            <p className="text-sm font-medium text-danger">This tile's query failed</p>
            <p className="selectable mt-1 font-mono text-xs text-muted">{data.error}</p>
          </div>
        ) : result ? (
          <Suspense fallback={<ChartMessage>Loading chart…</ChartMessage>}>
            <ChartView config={tile.chart} columns={result.columns} rows={result.rows} compact />
          </Suspense>
        ) : (
          <div className={isNumber ? 'h-[68px]' : 'h-full'} />
        )}
      </div>
    </article>
  );
}

export function Dashboard() {
  const tiles = useWorkspace((state) => state.tiles);
  const hasTables = useWorkspace((state) => state.schema.length > 0);
  const setView = useWorkspace((state) => state.setView);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-12 flex-none items-center gap-3 border-b border-line px-4 sm:px-5">
        <h1 className="text-lg font-semibold tracking-tight">Dashboard</h1>
        <p className="hidden truncate text-sm text-muted md:block">
          {tiles.length === 0
            ? ''
            : 'Each tile is a saved query. They refresh when your data changes.'}
        </p>
        <button
          type="button"
          className="btn ml-auto"
          disabled={tiles.length === 0}
          onClick={() => setRefreshKey((key) => key + 1)}
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </header>

      {tiles.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center px-6">
          <div className="max-w-sm text-center">
            <h2 className="text-lg font-semibold">Nothing is pinned yet</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {hasTables
                ? 'Run a query, open its Chart tab, and choose Pin to dashboard. The chart will live here and stay up to date.'
                : 'Load some data first. Then any chart you build from a query can be pinned here.'}
            </p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => setView('query')}>
              Go to the query editor
            </button>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tiles.map((tile, index) => (
              <Tile
                key={tile.id}
                tile={tile}
                refreshKey={refreshKey}
                isFirst={index === 0}
                isLast={index === tiles.length - 1}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
