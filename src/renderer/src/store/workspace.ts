/**
 * Application state and the actions that change it.
 *
 * Components stay declarative: they read slices of this store and call
 * actions. Everything that talks to the database worker or the host platform
 * goes through here, which keeps side effects in one place.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { EngineCancelledError, EngineClient } from '@/engine/client';
import { reconcileChart, type ChartConfig } from '@/lib/chart';
import { editorBridge } from '@/lib/editorBridge';
import { toCsv, toJson, toMarkdown } from '@/lib/exporters';
import { formatInteger, pluralize } from '@/lib/format';
import { detectFormat } from '@/lib/fileFormats';
import { DEFAULT_SAMPLE_SIZES } from '@/lib/sampleData';
import { SAMPLE_QUERIES, WELCOME_SQL } from '@/lib/sampleQueries';
import { quoteIdent } from '@/lib/sqlUtils';
import type { PlanNode, QueryResult, TableInfo } from '@/lib/types';
import { platform } from '@/platform';
import { useSettings } from './settings';

export type View = 'query' | 'dashboard';
export type ResultPane = 'results' | 'chart' | 'profile' | 'plan';

export interface QueryTab {
  id: string;
  title: string;
  sql: string;
  /** Set when the tab was opened from, or saved as, a saved query. */
  savedId?: string;
}

export interface TabRun {
  status: 'idle' | 'running' | 'done' | 'error';
  result?: QueryResult;
  error?: string;
  /** The SQL that produced `result`, which may be a selection rather than the whole tab. */
  ranSql?: string;
  plan?: PlanNode[];
  planError?: string;
}

export interface HistoryEntry {
  id: string;
  sql: string;
  ranAt: number;
  durationMs: number;
  rowCount: number;
  ok: boolean;
  error?: string;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  /** The chart that was showing when the query was saved, restored when it is reopened. */
  chart?: ChartConfig | null;
  updatedAt: number;
}

export interface DashboardTile {
  id: string;
  title: string;
  sql: string;
  chart: ChartConfig;
  span: 1 | 2 | 4;
}

export interface Toast {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

export interface ConfirmRequest {
  title: string;
  body: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

export interface PromptRequest {
  title: string;
  label: string;
  initialValue: string;
  confirmLabel: string;
  onSubmit: (value: string) => void;
}

interface WorkspaceState {
  // Engine
  engineStatus: 'starting' | 'ready' | 'failed';
  engineError: string | null;
  sqliteVersion: string;
  schema: TableInfo[];
  /** Bumped whenever data changes, so dashboards know to refresh. */
  dataVersion: number;
  saveState: 'saved' | 'saving' | 'unsaved';
  databaseBytes: number;
  progress: { label: string; done: number; total: number } | null;

  // Workspace (persisted)
  view: View;
  tabs: QueryTab[];
  activeTabId: string;
  history: HistoryEntry[];
  saved: SavedQuery[];
  tiles: DashboardTile[];

  // Per-tab, in memory only
  runs: Record<string, TabRun>;
  charts: Record<string, ChartConfig | null>;
  panes: Record<string, ResultPane>;

  // Overlays
  paletteOpen: boolean;
  /** The phone-sized sidebar drawer. Never persisted: it starts closed on every visit. */
  drawerOpen: boolean;
  shortcutsOpen: boolean;
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  toasts: Toast[];

  boot(): Promise<void>;
  refreshSchema(): Promise<void>;

  setView(view: View): void;
  newTab(sql?: string, title?: string, savedId?: string): string;
  closeTab(id: string): void;
  selectTab(id: string): void;
  updateSql(id: string, sql: string): void;
  setPane(tabId: string, pane: ResultPane): void;
  setChart(tabId: string, chart: ChartConfig): void;

  runQuery(options?: { tabId?: string; sql?: string }): Promise<void>;
  stopQuery(): Promise<void>;
  explainQuery(tabId?: string): Promise<void>;

  importFiles(files: File[]): Promise<void>;
  loadSample(): Promise<void>;
  exportDatabase(): Promise<void>;
  resetWorkspace(): void;
  previewTable(name: string): void;
  dropTable(table: TableInfo): void;
  exportResult(tabId: string, format: 'csv' | 'json'): Promise<void>;
  copyResult(tabId: string): Promise<void>;

  saveActiveQuery(): void;
  openSaved(id: string): void;
  deleteSaved(id: string): void;
  clearHistory(): void;

  pinTile(tile: Omit<DashboardTile, 'id'>): void;
  updateTile(id: string, patch: Partial<Omit<DashboardTile, 'id'>>): void;
  removeTile(id: string): void;
  moveTile(id: string, direction: -1 | 1): void;

  setPaletteOpen(open: boolean): void;
  setDrawerOpen(open: boolean): void;
  setShortcutsOpen(open: boolean): void;
  askConfirm(request: ConfirmRequest): void;
  closeConfirm(): void;
  askPrompt(request: PromptRequest): void;
  closePrompt(): void;
  toast(kind: Toast['kind'], message: string): void;
  dismissToast(id: string): void;
}

const HISTORY_LIMIT = 200;
const SAVE_DEBOUNCE_MS = 500;

const newId = (): string => crypto.randomUUID();
const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

let client: EngineClient | null = null;
/** The worker is created on first use so the store can be imported in tests. */
export function engine(): EngineClient {
  client ??= new EngineClient();
  return client;
}

let saveTimer: ReturnType<typeof setTimeout> | undefined;
let saveGeneration = 0;

function nextTabTitle(tabs: QueryTab[]): string {
  const used = new Set(tabs.map((tab) => tab.title));
  for (let n = 1; ; n++) {
    if (!used.has(`Query ${n}`)) return `Query ${n}`;
  }
}

export const useWorkspace = create<WorkspaceState>()(
  persist(
    (set, get) => {
      /** Persists the database a moment after the last change. */
      const scheduleSave = (): void => {
        set({ saveState: 'unsaved' });
        clearTimeout(saveTimer);
        const generation = ++saveGeneration;
        saveTimer = setTimeout(async () => {
          set({ saveState: 'saving' });
          try {
            const bytes = await engine().call('export', undefined);
            await platform.saveWorkspace(bytes);
            // A newer change may have arrived while this save was in flight.
            if (generation === saveGeneration) set({ saveState: 'saved' });
            set({ databaseBytes: bytes.byteLength });
          } catch (error) {
            if (error instanceof EngineCancelledError) return;
            set({ saveState: 'unsaved' });
            get().toast('error', `Could not save the workspace: ${errorMessage(error)}`);
          }
        }, SAVE_DEBOUNCE_MS);
      };

      const dataChanged = async (): Promise<void> => {
        await get().refreshSchema();
        set((state) => ({ dataVersion: state.dataVersion + 1 }));
        scheduleSave();
      };

      const startEngine = async (): Promise<void> => {
        const bytes = await platform.loadWorkspace();
        const { sqliteVersion, recovered } = await engine().call('init', { bytes });
        set({
          engineStatus: 'ready',
          engineError: null,
          sqliteVersion,
          databaseBytes: bytes?.byteLength ?? 0,
        });
        if (recovered) {
          get().toast(
            'error',
            'The saved workspace could not be read, so Tessera started with an empty one.',
          );
        }
        await get().refreshSchema();
      };

      const pushHistory = (entry: Omit<HistoryEntry, 'id' | 'ranAt'>): void => {
        set((state) => ({
          history: [{ ...entry, id: newId(), ranAt: Date.now() }, ...state.history].slice(
            0,
            HISTORY_LIMIT,
          ),
        }));
      };

      return {
        engineStatus: 'starting',
        engineError: null,
        sqliteVersion: '',
        schema: [],
        dataVersion: 0,
        saveState: 'saved',
        databaseBytes: 0,
        progress: null,

        view: 'query',
        tabs: [],
        activeTabId: '',
        history: [],
        saved: [],
        tiles: [],

        runs: {},
        charts: {},
        panes: {},

        paletteOpen: false,
        drawerOpen: false,
        shortcutsOpen: false,
        confirm: null,
        prompt: null,
        toasts: [],

        async boot() {
          if (get().tabs.length === 0) get().newTab('');
          else if (!get().tabs.some((tab) => tab.id === get().activeTabId)) {
            set({ activeTabId: get().tabs[0]?.id ?? '' });
          }
          try {
            await startEngine();
          } catch (error) {
            set({ engineStatus: 'failed', engineError: errorMessage(error) });
          }
        },

        async refreshSchema() {
          const schema = await engine().call('schema', undefined);
          set({ schema });
        },

        setView: (view) => set({ view }),

        newTab(sql = '', title, savedId) {
          const id = newId();
          set((state) => ({
            tabs: [...state.tabs, { id, title: title ?? nextTabTitle(state.tabs), sql, savedId }],
            activeTabId: id,
            view: 'query',
            drawerOpen: false,
          }));
          return id;
        },

        closeTab(id) {
          const { tabs, activeTabId } = get();
          const index = tabs.findIndex((tab) => tab.id === id);
          if (index === -1) return;
          const remaining = tabs.filter((tab) => tab.id !== id);
          set((state) => {
            const { [id]: _run, ...runs } = state.runs;
            const { [id]: _chart, ...charts } = state.charts;
            const { [id]: _pane, ...panes } = state.panes;
            return { tabs: remaining, runs, charts, panes };
          });
          if (remaining.length === 0) {
            get().newTab('');
          } else if (activeTabId === id) {
            set({ activeTabId: (remaining[Math.min(index, remaining.length - 1)] as QueryTab).id });
          }
        },

        selectTab: (id) => set({ activeTabId: id, view: 'query', drawerOpen: false }),

        updateSql: (id, sql) =>
          set((state) => ({
            tabs: state.tabs.map((tab) => (tab.id === id ? { ...tab, sql } : tab)),
          })),

        setPane: (tabId, pane) => set((state) => ({ panes: { ...state.panes, [tabId]: pane } })),

        setChart: (tabId, chart) =>
          set((state) => ({ charts: { ...state.charts, [tabId]: chart } })),

        async runQuery(options = {}) {
          const tabId = options.tabId ?? get().activeTabId;
          const tab = get().tabs.find((candidate) => candidate.id === tabId);
          if (!tab || get().engineStatus !== 'ready') return;
          if (get().runs[tabId]?.status === 'running') return;

          const sql = (options.sql ?? (editorBridge.selection() || tab.sql)).trim();
          if (!sql) {
            get().toast('info', 'Write a query first, then run it.');
            return;
          }

          set((state) => ({
            runs: {
              ...state.runs,
              [tabId]: { ...state.runs[tabId], status: 'running', error: undefined },
            },
          }));

          try {
            const result = await engine().call('run', {
              sql,
              maxRows: useSettings.getState().rowLimit,
            });
            set((state) => ({
              runs: { ...state.runs, [tabId]: { status: 'done', result, ranSql: sql } },
              charts: {
                ...state.charts,
                [tabId]: reconcileChart(state.charts[tabId], result.columns, result.rows),
              },
              // The plan tab describes one specific query, so a new run leaves it.
              panes: {
                ...state.panes,
                [tabId]:
                  state.panes[tabId] === 'plan' ? 'results' : (state.panes[tabId] ?? 'results'),
              },
            }));
            pushHistory({
              sql,
              durationMs: result.durationMs,
              rowCount: result.rows.length,
              ok: true,
            });
            if (result.mutated) await dataChanged();
          } catch (error) {
            if (error instanceof EngineCancelledError) {
              set((state) => ({
                runs: { ...state.runs, [tabId]: { ...state.runs[tabId], status: 'idle' } },
              }));
              return;
            }
            const message = errorMessage(error);
            set((state) => ({
              runs: { ...state.runs, [tabId]: { status: 'error', error: message, ranSql: sql } },
              panes: { ...state.panes, [tabId]: 'results' },
            }));
            pushHistory({ sql, durationMs: 0, rowCount: 0, ok: false, error: message });
          }
        },

        async stopQuery() {
          clearTimeout(saveTimer);
          engine().restart();
          set({ engineStatus: 'starting', progress: null });
          try {
            await startEngine();
            set((state) => ({ dataVersion: state.dataVersion + 1, saveState: 'saved' }));
            get().toast('info', 'Query stopped. The workspace was restored from its last save.');
          } catch (error) {
            set({ engineStatus: 'failed', engineError: errorMessage(error) });
          }
        },

        async explainQuery(tabId = get().activeTabId) {
          const tab = get().tabs.find((candidate) => candidate.id === tabId);
          if (!tab) return;
          const sql = (editorBridge.selection() || tab.sql).trim();
          if (!sql) {
            get().toast('info', 'Write a query first, then explain it.');
            return;
          }
          const patch = (run: Partial<TabRun>): void => {
            set((state) => ({
              runs: { ...state.runs, [tabId]: { status: 'idle', ...state.runs[tabId], ...run } },
              panes: { ...state.panes, [tabId]: 'plan' },
            }));
          };
          try {
            patch({ plan: await engine().call('explain', { sql }), planError: undefined });
          } catch (error) {
            patch({ plan: undefined, planError: errorMessage(error) });
          }
        },

        async importFiles(files) {
          if (get().engineStatus !== 'ready') return;
          set({ drawerOpen: false });
          for (const file of files) {
            const format = detectFormat(file.name);
            if (format === null) {
              get().toast(
                'error',
                `${file.name} is not a supported file. Use CSV, TSV, JSON or a SQLite database.`,
              );
              continue;
            }
            if (format === 'sqlite') {
              const bytes = new Uint8Array(await file.arrayBuffer());
              const open = async (): Promise<void> => {
                try {
                  await engine().call('replace', { bytes });
                  await dataChanged();
                  get().toast('success', `Opened ${file.name}.`);
                } catch (error) {
                  get().toast('error', errorMessage(error));
                }
              };
              if (get().schema.length === 0) await open();
              else {
                get().askConfirm({
                  title: `Replace the workspace with ${file.name}?`,
                  body: 'The tables in the current workspace will be removed. Export the database first if you want to keep them.',
                  confirmLabel: 'Replace workspace',
                  destructive: true,
                  onConfirm: open,
                });
              }
              continue;
            }
            try {
              set({ progress: { label: `Importing ${file.name}`, done: 0, total: 1 } });
              const buffer = await file.arrayBuffer();
              const summary = await engine().call(
                'importFile',
                { fileName: file.name, format, buffer },
                {
                  transfer: [buffer],
                  onProgress: (done, total) =>
                    set({ progress: { label: `Importing ${file.name}`, done, total } }),
                },
              );
              await dataChanged();
              get().toast(
                'success',
                `Imported ${pluralize(summary.rowCount, 'row')} into ${summary.table}.`,
              );
              get().previewTable(summary.table);
            } catch (error) {
              get().toast('error', `Could not import ${file.name}: ${errorMessage(error)}`);
            } finally {
              set({ progress: null });
            }
          }
        },

        async loadSample() {
          if (get().engineStatus !== 'ready' || get().progress) return;
          try {
            set({
              drawerOpen: false,
              progress: { label: 'Loading sample data', done: 0, total: 1 },
            });
            // Progress restarts for each table; fold it into one bar.
            const total = Object.values(DEFAULT_SAMPLE_SIZES).reduce((sum, size) => sum + size, 0);
            let finished = 0;
            let currentLabel = '';
            let currentDone = 0;
            await engine().call('loadSample', undefined, {
              onProgress: (done, _total, label) => {
                if (label !== currentLabel) {
                  finished += currentDone;
                  currentLabel = label;
                }
                currentDone = done;
                set({ progress: { label: `Loading ${label}`, done: finished + done, total } });
              },
            });
            await dataChanged();

            // Add the example saved queries and dashboard tiles once.
            set((state) => {
              const savedIds = new Set(state.saved.map((query) => query.id));
              const tileIds = new Set(state.tiles.map((tile) => tile.id));
              return {
                saved: [
                  ...state.saved,
                  ...SAMPLE_QUERIES.filter((query) => !savedIds.has(query.id)).map((query) => ({
                    id: query.id,
                    name: query.name,
                    sql: query.sql,
                    chart: query.chart,
                    updatedAt: Date.now(),
                  })),
                ],
                tiles: [
                  ...state.tiles,
                  ...SAMPLE_QUERIES.filter(
                    (query) => query.onDashboard && !tileIds.has(query.id),
                  ).map((query) => ({
                    id: query.id,
                    title: query.name,
                    sql: query.sql,
                    chart: query.chart,
                    span: query.span,
                  })),
                ],
              };
            });

            const active = get().tabs.find((tab) => tab.id === get().activeTabId);
            const tabId =
              active && active.sql.trim() === '' ? active.id : get().newTab('', 'Welcome');
            get().updateSql(tabId, WELCOME_SQL);
            set({ progress: null });
            get().toast(
              'success',
              'Sample data loaded: 60,000 orders across three tables and a view.',
            );
            await get().runQuery({ tabId, sql: WELCOME_SQL });
          } catch (error) {
            get().toast('error', `Could not load the sample data: ${errorMessage(error)}`);
          } finally {
            set({ progress: null });
          }
        },

        async exportDatabase() {
          try {
            const bytes = await engine().call('export', undefined);
            const result = await platform.saveFile({
              defaultName: 'tessera-workspace.sqlite',
              filters: [{ name: 'SQLite database', extensions: ['sqlite', 'db'] }],
              data: bytes,
            });
            if (result.saved) get().toast('success', 'Database exported.');
          } catch (error) {
            get().toast('error', `Could not export the database: ${errorMessage(error)}`);
          }
        },

        resetWorkspace() {
          get().askConfirm({
            title: 'Delete every table in this workspace?',
            body: 'All tables and views are removed. Saved queries and dashboard tiles are kept. This cannot be undone.',
            confirmLabel: 'Delete all tables',
            destructive: true,
            onConfirm: async () => {
              await engine().call('replace', { bytes: null });
              await dataChanged();
              set({ runs: {} });
              get().toast('success', 'Workspace cleared.');
            },
          });
        },

        previewTable(name) {
          const sql = `SELECT *\nFROM ${quoteIdent(name)}\nLIMIT 1000;`;
          const active = get().tabs.find((tab) => tab.id === get().activeTabId);
          const tabId = active && active.sql.trim() === '' ? active.id : get().newTab('', name);
          get().updateSql(tabId, sql);
          set((state) => ({
            view: 'query',
            drawerOpen: false,
            panes: { ...state.panes, [tabId]: 'results' },
          }));
          void get().runQuery({ tabId, sql });
        },

        dropTable(table) {
          get().askConfirm({
            title: `Delete the ${table.kind} ${table.name}?`,
            body:
              table.kind === 'table'
                ? `${pluralize(table.rowCount ?? 0, 'row')} will be removed. This cannot be undone.`
                : 'Only the view is removed; the tables it reads from are kept.',
            confirmLabel: `Delete ${table.kind}`,
            destructive: true,
            onConfirm: async () => {
              try {
                await engine().call('run', {
                  sql: `DROP ${table.kind.toUpperCase()} ${quoteIdent(table.name)}`,
                });
                await dataChanged();
                get().toast('success', `Deleted ${table.name}.`);
              } catch (error) {
                get().toast('error', errorMessage(error));
              }
            },
          });
        },

        async exportResult(tabId, format) {
          const result = get().runs[tabId]?.result;
          if (!result || result.columns.length === 0) return;
          const tab = get().tabs.find((candidate) => candidate.id === tabId);
          const baseName =
            (tab?.title ?? 'result').replace(/[^\w-]+/g, '-').toLowerCase() || 'result';
          try {
            const saved = await platform.saveFile({
              defaultName: `${baseName}.${format}`,
              filters: [{ name: format.toUpperCase(), extensions: [format] }],
              data:
                format === 'csv'
                  ? toCsv(result.columns, result.rows)
                  : toJson(result.columns, result.rows),
            });
            if (saved.saved)
              get().toast(
                'success',
                `Exported ${pluralize(result.rows.length, 'row')} as ${format.toUpperCase()}.`,
              );
          } catch (error) {
            get().toast('error', `Could not export: ${errorMessage(error)}`);
          }
        },

        async copyResult(tabId) {
          const result = get().runs[tabId]?.result;
          if (!result || result.columns.length === 0) return;
          const rows = result.rows.slice(0, 200);
          try {
            await navigator.clipboard.writeText(toMarkdown(result.columns, rows));
            const note =
              result.rows.length > rows.length ? ` (first ${formatInteger(rows.length)} rows)` : '';
            get().toast('success', `Copied as a Markdown table${note}.`);
          } catch {
            get().toast('error', 'The clipboard is not available.');
          }
        },

        saveActiveQuery() {
          const tab = get().tabs.find((candidate) => candidate.id === get().activeTabId);
          if (!tab) return;
          if (!tab.sql.trim()) {
            get().toast('info', 'There is nothing to save yet.');
            return;
          }
          const existing = tab.savedId
            ? get().saved.find((query) => query.id === tab.savedId)
            : undefined;
          if (existing) {
            set((state) => ({
              saved: state.saved.map((query) =>
                query.id === existing.id
                  ? {
                      ...query,
                      sql: tab.sql,
                      chart: state.charts[tab.id] ?? query.chart,
                      updatedAt: Date.now(),
                    }
                  : query,
              ),
            }));
            get().toast('success', `Saved changes to ${existing.name}.`);
            return;
          }
          get().askPrompt({
            title: 'Save query',
            label: 'Name',
            initialValue: /^Query \d+$/.test(tab.title) ? '' : tab.title,
            confirmLabel: 'Save query',
            onSubmit: (name) => {
              const id = newId();
              set((state) => ({
                saved: [
                  { id, name, sql: tab.sql, chart: state.charts[tab.id], updatedAt: Date.now() },
                  ...state.saved,
                ],
                tabs: state.tabs.map((candidate) =>
                  candidate.id === tab.id ? { ...candidate, title: name, savedId: id } : candidate,
                ),
              }));
              get().toast('success', `Saved ${name}.`);
            },
          });
        },

        openSaved(id) {
          const query = get().saved.find((candidate) => candidate.id === id);
          if (!query) return;
          const open = get().tabs.find((tab) => tab.savedId === id);
          if (open) {
            get().selectTab(open.id);
            return;
          }
          const tabId = get().newTab(query.sql, query.name, query.id);
          if (query.chart) get().setChart(tabId, query.chart);
        },

        deleteSaved: (id) =>
          set((state) => ({
            saved: state.saved.filter((query) => query.id !== id),
            tabs: state.tabs.map((tab) =>
              tab.savedId === id ? { ...tab, savedId: undefined } : tab,
            ),
          })),

        clearHistory: () => set({ history: [] }),

        pinTile(tile) {
          set((state) => ({ tiles: [...state.tiles, { ...tile, id: newId() }] }));
          get().toast('success', `Pinned ${tile.title} to the dashboard.`);
        },

        updateTile: (id, patch) =>
          set((state) => ({
            tiles: state.tiles.map((tile) => (tile.id === id ? { ...tile, ...patch } : tile)),
          })),

        removeTile: (id) =>
          set((state) => ({ tiles: state.tiles.filter((tile) => tile.id !== id) })),

        moveTile(id, direction) {
          set((state) => {
            const index = state.tiles.findIndex((tile) => tile.id === id);
            const target = index + direction;
            if (index === -1 || target < 0 || target >= state.tiles.length) return state;
            const tiles = [...state.tiles];
            [tiles[index], tiles[target]] = [
              tiles[target] as DashboardTile,
              tiles[index] as DashboardTile,
            ];
            return { tiles };
          });
        },

        setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
        setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
        setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
        askConfirm: (confirm) => set({ confirm }),
        closeConfirm: () => set({ confirm: null }),
        askPrompt: (prompt) => set({ prompt }),
        closePrompt: () => set({ prompt: null }),

        toast(kind, message) {
          const id = newId();
          set((state) => ({ toasts: [...state.toasts.slice(-3), { id, kind, message }] }));
          setTimeout(() => get().dismissToast(id), kind === 'error' ? 8000 : 4000);
        },

        dismissToast: (id) =>
          set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
      };
    },
    {
      name: 'tessera.workspace',
      version: 1,
      partialize: (state) => ({
        view: state.view,
        tabs: state.tabs,
        activeTabId: state.activeTabId,
        history: state.history,
        saved: state.saved,
        tiles: state.tiles,
      }),
    },
  ),
);
