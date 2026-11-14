import { ClipboardCopy, Download } from 'lucide-react';
import { suggestTitle } from '@/lib/chart';
import { formatDuration, formatInteger, pluralize } from '@/lib/format';
import { useWorkspace, type QueryTab, type ResultPane } from '@/store/workspace';
import { ChartBuilder } from './ChartBuilder';
import { DataGrid } from './DataGrid';
import { MosaicLoader } from './Mosaic';
import { PlanView } from './PlanView';
import { ProfileView } from './ProfileView';

const PANES: Array<{ id: ResultPane; label: string }> = [
  { id: 'results', label: 'Results' },
  { id: 'chart', label: 'Chart' },
  { id: 'profile', label: 'Profile' },
  { id: 'plan', label: 'Plan' },
];

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid h-full place-items-center px-6 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  );
}

export function ResultsPanel({ tab }: { tab: QueryTab }) {
  const run = useWorkspace((state) => state.runs[tab.id]);
  const pane = useWorkspace((state) => state.panes[tab.id] ?? 'results');
  const chart = useWorkspace((state) => state.charts[tab.id] ?? null);
  const { setPane, setChart, pinTile, askPrompt, exportResult, copyResult, toast } =
    useWorkspace.getState();

  const result = run?.result;
  const hasRows = Boolean(result && result.columns.length > 0);
  const running = run?.status === 'running';

  let body: React.ReactNode;
  if (pane === 'plan') {
    body = <PlanView plan={run?.plan} error={run?.planError} />;
  } else if (run?.status === 'error') {
    body = (
      <div className="h-full overflow-auto p-4">
        <p className="text-sm font-semibold text-danger">The query failed</p>
        <p className="selectable mt-1 max-w-[80ch] font-mono text-xs leading-relaxed whitespace-pre-wrap text-ink">
          {run.error}
        </p>
      </div>
    );
  } else if (!result) {
    body = running ? (
      <Message>
        <span className="flex items-center gap-3">
          <MosaicLoader label="Running query" /> Running…
        </span>
      </Message>
    ) : (
      <Message>Run a query to see its results here.</Message>
    );
  } else if (!hasRows) {
    body = (
      <Message>
        Done in {formatDuration(result.durationMs)}. {pluralize(result.statementCount, 'statement')}{' '}
        ran
        {result.changes > 0 ? ` and ${pluralize(result.changes, 'row')} changed` : ''}.
      </Message>
    );
  } else if (pane === 'chart') {
    body = (
      <ChartBuilder
        columns={result.columns}
        rows={result.rows}
        config={chart}
        onChange={(config) => setChart(tab.id, config)}
        onPin={(config) =>
          askPrompt({
            title: 'Pin to dashboard',
            label: 'Tile title',
            initialValue: /^Query \d+$/.test(tab.title) ? suggestTitle(config) : tab.title,
            confirmLabel: 'Pin chart',
            onSubmit: (title) =>
              pinTile({
                title,
                sql: run?.ranSql ?? tab.sql,
                chart: config,
                span: config.type === 'number' ? 4 : 2,
              }),
          })
        }
      />
    );
  } else if (pane === 'profile') {
    body = <ProfileView columns={result.columns} rows={result.rows} />;
  } else {
    body = (
      <DataGrid
        columns={result.columns}
        rows={result.rows}
        onCopy={(text) => {
          void navigator.clipboard.writeText(text).then(
            () => toast('success', 'Cell copied.'),
            () => toast('error', 'The clipboard is not available.'),
          );
        }}
      />
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface" aria-label="Results">
      <div className="flex h-9 flex-none items-center gap-1 overflow-x-auto overflow-y-hidden border-b border-line-soft px-2">
        <div role="tablist" aria-label="Result views" className="flex items-center gap-0.5">
          {PANES.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={pane === id}
              onClick={() => setPane(tab.id, id)}
              className={`rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
                pane === id ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="ml-auto flex flex-none items-center gap-1 pl-2">
          {running && result && <MosaicLoader size={12} label="Running query" />}
          {result && hasRows && run?.status !== 'error' && (
            <p
              className="mr-1 text-xs whitespace-nowrap text-muted tabular-nums"
              data-testid="result-summary"
            >
              {result.truncated
                ? `First ${formatInteger(result.rows.length)} rows`
                : pluralize(result.rows.length, 'row')}
              <span className="text-faint"> in {formatDuration(result.durationMs)}</span>
            </p>
          )}
          <button
            type="button"
            className="icon-btn"
            disabled={!hasRows}
            onClick={() => void copyResult(tab.id)}
            title="Copy as Markdown table"
            aria-label="Copy as Markdown table"
          >
            <ClipboardCopy size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 px-2"
            disabled={!hasRows}
            onClick={() => void exportResult(tab.id, 'csv')}
            title="Export results as CSV"
          >
            <Download size={14} />
            CSV
          </button>
          <button
            type="button"
            className="btn btn-ghost h-7 px-2"
            disabled={!hasRows}
            onClick={() => void exportResult(tab.id, 'json')}
            title="Export results as JSON"
          >
            <Download size={14} />
            JSON
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">{body}</div>
    </section>
  );
}
