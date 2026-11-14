import { useRef } from 'react';
import { Bookmark, Network, Play, Plus, Save, Square, WandSparkles, X } from 'lucide-react';
import { formatKeys, keysFor, runAction, type ActionId } from '@/actions';
import { ROW_LIMITS, useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';
import { ResultsPanel } from './ResultsPanel';
import { Splitter } from './Splitter';
import { SqlEditor, forgetEditorState } from './SqlEditor';

function Keys({ action }: { action: ActionId }) {
  const keys = keysFor(action);
  if (!keys) return null;
  return (
    <span className="ml-1 hidden text-2xs font-medium opacity-70 sm:inline">
      {formatKeys(keys).join(' ')}
    </span>
  );
}

function TabStrip() {
  const tabs = useWorkspace((state) => state.tabs);
  const activeTabId = useWorkspace((state) => state.activeTabId);
  const runs = useWorkspace((state) => state.runs);
  const { selectTab, closeTab, newTab } = useWorkspace.getState();

  return (
    <div
      className="flex h-9 flex-none items-end gap-px overflow-x-auto overflow-y-hidden border-b border-line bg-canvas px-2"
      role="tablist"
      aria-label="Query tabs"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const status = runs[tab.id]?.status;
        return (
          <div
            key={tab.id}
            className={`group relative flex h-8 max-w-[200px] min-w-[96px] flex-none items-center rounded-t-md border border-b-0 pr-1 pl-2.5 ${
              active
                ? 'border-line bg-surface text-ink'
                : 'border-transparent text-muted hover:bg-raised/60 hover:text-ink'
            }`}
            // The active tab sits on top of the strip's bottom border.
            style={active ? { marginBottom: -1, height: 33 } : undefined}
            onAuxClick={(event) => {
              if (event.button === 1) {
                forgetEditorState(tab.id);
                closeTab(tab.id);
              }
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(tab.id)}
              className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm"
            >
              {tab.savedId ? (
                <Bookmark size={11} className="flex-none text-ochre" />
              ) : (
                <span
                  className={`tile ${status === 'error' ? 'bg-danger' : status === 'running' ? 'bg-ochre' : status === 'done' ? 'bg-malachite' : 'bg-line'}`}
                />
              )}
              <span className="truncate">{tab.title}</span>
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => {
                forgetEditorState(tab.id);
                closeTab(tab.id);
              }}
              className={`icon-btn h-5 w-5 ${active ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100'}`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        className="icon-btn mb-1 ml-1 h-6 w-6"
        onClick={() => newTab()}
        aria-label="New query tab"
        title="New query tab"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

function Toolbar({ running, ready }: { running: boolean; ready: boolean }) {
  const rowLimit = useSettings((state) => state.rowLimit);
  const setRowLimit = useSettings((state) => state.setRowLimit);

  return (
    <div className="flex h-10 flex-none items-center gap-1 border-b border-line-soft bg-surface px-2">
      {running ? (
        <button type="button" className="btn btn-danger" onClick={() => runAction('stop-query')}>
          <Square size={12} fill="currentColor" />
          Stop
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          disabled={!ready}
          onClick={() => runAction('run-query')}
        >
          <Play size={12} fill="currentColor" />
          Run
          <Keys action="run-query" />
        </button>
      )}
      <button
        type="button"
        className="btn btn-ghost"
        disabled={!ready}
        onClick={() => runAction('explain-query')}
        title="Show how SQLite will run this query"
      >
        <Network size={14} />
        <span className="hidden sm:inline">Explain</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => runAction('format-query')}
        title="Tidy up the SQL"
      >
        <WandSparkles size={14} />
        <span className="hidden sm:inline">Format</span>
      </button>
      <button
        type="button"
        className="btn btn-ghost"
        onClick={() => runAction('save-query')}
        title="Save this query to the sidebar"
      >
        <Save size={14} />
        <span className="hidden sm:inline">Save</span>
      </button>

      <label className="ml-auto flex items-center gap-2 text-xs text-muted">
        <span className="hidden sm:inline">Row limit</span>
        <select
          aria-label="Row limit"
          className="field h-7 w-auto pr-1 font-mono text-xs"
          value={rowLimit}
          onChange={(event) => setRowLimit(Number(event.target.value))}
        >
          {ROW_LIMITS.map((limit) => (
            <option key={limit} value={limit}>
              {limit.toLocaleString('en-US')}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function QueryView() {
  const container = useRef<HTMLDivElement>(null);
  const tab = useWorkspace((state) =>
    state.tabs.find((candidate) => candidate.id === state.activeTabId),
  );
  const running = useWorkspace((state) => state.runs[state.activeTabId]?.status === 'running');
  const ready = useWorkspace((state) => state.engineStatus === 'ready');
  const schema = useWorkspace((state) => state.schema);
  const updateSql = useWorkspace((state) => state.updateSql);
  const editorRatio = useSettings((state) => state.editorRatio);
  const setEditorRatio = useSettings((state) => state.setEditorRatio);

  if (!tab) return null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TabStrip />
      <Toolbar running={running} ready={ready} />
      <div ref={container} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-none" style={{ height: `${editorRatio * 100}%` }}>
          <SqlEditor
            key={tab.id}
            tabId={tab.id}
            value={tab.sql}
            tables={schema}
            onChange={(sql) => updateSql(tab.id, sql)}
          />
        </div>
        <Splitter
          orientation="horizontal"
          label="Resize editor and results"
          onResize={(clientY) => {
            const box = container.current?.getBoundingClientRect();
            if (box) setEditorRatio((clientY - box.top) / box.height);
          }}
          onNudge={(delta) => {
            const height = container.current?.getBoundingClientRect().height ?? 600;
            setEditorRatio(editorRatio + delta / height);
          }}
        />
        <div className="min-h-0 flex-1">
          <ResultsPanel tab={tab} />
        </div>
      </div>
    </div>
  );
}
