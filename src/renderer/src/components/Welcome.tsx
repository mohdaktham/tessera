import { FileUp, Sparkles } from 'lucide-react';
import { runAction } from '@/actions';
import { platform } from '@/platform';
import { useWorkspace } from '@/store/workspace';
import { MosaicArt, MosaicLoader } from './Mosaic';

/** First-run screen, shown until the workspace has a table in it. */
export function Welcome({ onSkip }: { onSkip: () => void }) {
  const ready = useWorkspace((state) => state.engineStatus === 'ready');
  const failed = useWorkspace((state) => state.engineStatus === 'failed');
  const engineError = useWorkspace((state) => state.engineError);
  const loading = useWorkspace((state) => state.progress !== null);

  return (
    <div className="grid h-full place-items-center overflow-y-auto px-5 py-8 sm:px-8 sm:py-10">
      <div className="flex w-full max-w-[880px] flex-col items-center gap-8 sm:gap-12 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-[400px]">
          <h1 className="text-3xl leading-[1.12] font-semibold tracking-tight">
            Ask questions of your data, in SQL.
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Tessera turns CSV, JSON and SQLite files into tables you can query, chart and pin to a
            dashboard. Everything runs {platform.isDesktop ? 'on this computer' : 'in your browser'}
            ; your data is never uploaded.
          </p>

          {failed ? (
            <p className="selectable mt-6 rounded-lg border border-danger bg-danger-soft p-3 text-sm text-ink">
              The database engine could not start. {engineError}
            </p>
          ) : (
            <>
              <div className="mt-7 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn btn-primary btn-lg"
                  disabled={!ready || loading}
                  onClick={() => runAction('load-sample')}
                >
                  {loading ? (
                    <MosaicLoader size={12} label="Loading sample data" />
                  ) : (
                    <Sparkles size={15} />
                  )}
                  Load sample data
                </button>
                <button
                  type="button"
                  className="btn btn-lg"
                  disabled={!ready || loading}
                  onClick={() => runAction('import-file')}
                >
                  <FileUp size={15} />
                  Import a file
                </button>
              </div>
              <p className="mt-4 text-sm text-muted">
                You can also drop files anywhere in this window, or{' '}
                <button
                  type="button"
                  className="font-medium text-accent underline-offset-2 hover:underline"
                  onClick={onSkip}
                >
                  start with an empty query
                </button>
                .
              </p>
            </>
          )}
        </div>
        <MosaicArt />
      </div>
    </div>
  );
}
