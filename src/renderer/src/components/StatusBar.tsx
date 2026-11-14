import { formatBytes, formatInteger, pluralize } from '@/lib/format';
import { platform } from '@/platform';
import { useWorkspace } from '@/store/workspace';
import { MosaicLoader } from './Mosaic';

const SAVE_LABEL = {
  saved: 'All changes saved',
  saving: 'Saving…',
  unsaved: 'Unsaved changes',
} as const;

export function StatusBar() {
  const engineStatus = useWorkspace((state) => state.engineStatus);
  const saveState = useWorkspace((state) => state.saveState);
  const tableCount = useWorkspace((state) => state.schema.length);
  const databaseBytes = useWorkspace((state) => state.databaseBytes);
  const sqliteVersion = useWorkspace((state) => state.sqliteVersion);
  const progress = useWorkspace((state) => state.progress);

  const engineTile =
    engineStatus === 'ready'
      ? 'bg-malachite'
      : engineStatus === 'failed'
        ? 'bg-danger'
        : 'bg-ochre';
  const engineLabel =
    engineStatus === 'ready'
      ? 'Ready'
      : engineStatus === 'failed'
        ? 'Engine failed to start'
        : 'Starting engine…';

  return (
    <footer className="flex h-7 flex-none items-center gap-4 overflow-hidden border-t border-line bg-canvas px-3 text-xs whitespace-nowrap text-muted">
      <span className="flex items-center gap-1.5" data-testid="engine-status">
        <span className={`tile ${engineTile}`} />
        {engineLabel}
      </span>

      {progress ? (
        <span className="flex items-center gap-2" role="status">
          <MosaicLoader size={10} label={progress.label} />
          {progress.label}
          <span className="h-1 w-28 overflow-hidden rounded-full bg-raised">
            <span
              className="block h-full rounded-full bg-accent transition-[width] duration-150"
              style={{
                width: `${Math.min(100, (progress.done / Math.max(1, progress.total)) * 100)}%`,
              }}
            />
          </span>
          {progress.total > 1 && (
            <span className="tabular-nums">{formatInteger(progress.done)}</span>
          )}
        </span>
      ) : (
        engineStatus === 'ready' && (
          <>
            <span className="hidden sm:inline">{pluralize(tableCount, 'table')}</span>
            {databaseBytes > 0 && (
              <span className="hidden tabular-nums sm:inline">{formatBytes(databaseBytes)}</span>
            )}
            <span data-testid="save-state">{SAVE_LABEL[saveState]}</span>
          </>
        )
      )}

      <span className="ml-auto flex items-center gap-4 text-faint">
        <span>{platform.isDesktop ? 'Stored on this computer' : 'Stored in this browser'}</span>
        {sqliteVersion && <span className="hidden md:inline">SQLite {sqliteVersion}</span>}
        <span>v{__APP_VERSION__}</span>
      </span>
    </footer>
  );
}
