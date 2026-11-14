/**
 * Every command in the app, defined once. The command palette, the native
 * menu, keyboard shortcuts and the shortcuts dialog all read from this list,
 * so they can never drift apart.
 */
import type { MenuAction } from '@shared/ipc';
import { REPOSITORY_URL } from '@shared/links';
import { DATABASE_ACCEPT, IMPORT_ACCEPT, filePicker } from '@/lib/filePicker';
import { formatKeys as formatKeysForPlatform } from '@/lib/shortcuts';
import { isCompact } from '@/lib/viewport';
import { platform } from '@/platform';
import { resolveTheme, useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';

export type ActionId =
  | MenuAction
  | 'explain-query'
  | 'stop-query'
  | 'load-sample'
  | 'clear-workspace'
  | 'theme-light'
  | 'theme-dark'
  | 'theme-system'
  | 'view-source';

export interface Action {
  id: ActionId;
  title: string;
  group: 'Query' | 'Data' | 'View' | 'Help';
  keys?: string;
  run: () => void | Promise<void>;
}

/**
 * A browser keeps some shortcuts for itself: a page cannot intercept Ctrl+T or
 * Ctrl+W, and Ctrl+W would close the site. `webKeys` gives those actions an
 * alternative that works when Tessera runs as a website.
 */
interface ActionDefinition extends Action {
  webKeys?: string;
}

const workspace = () => useWorkspace.getState();
const settings = () => useSettings.getState();

async function formatActiveQuery(): Promise<void> {
  const { tabs, activeTabId, updateSql, toast } = workspace();
  const tab = tabs.find((candidate) => candidate.id === activeTabId);
  if (!tab || !tab.sql.trim()) return;
  try {
    // The formatter is sizeable, so it is only loaded the first time it is used.
    const { format } = await import('sql-formatter');
    updateSql(
      tab.id,
      format(tab.sql, { language: 'sqlite', keywordCase: 'upper', tabWidth: 2 }) + '\n',
    );
  } catch {
    toast('error', 'This query could not be formatted. Check it for syntax errors.');
  }
}

const DEFINITIONS: ActionDefinition[] = [
  {
    id: 'run-query',
    title: 'Run query',
    group: 'Query',
    keys: 'mod+enter',
    run: () => workspace().runQuery(),
  },
  {
    id: 'explain-query',
    title: 'Explain query plan',
    group: 'Query',
    keys: 'mod+shift+enter',
    run: () => workspace().explainQuery(),
  },
  {
    id: 'stop-query',
    title: 'Stop running query',
    group: 'Query',
    run: () => workspace().stopQuery(),
  },
  {
    id: 'format-query',
    title: 'Format SQL',
    group: 'Query',
    keys: 'mod+shift+f',
    run: formatActiveQuery,
  },
  {
    id: 'save-query',
    title: 'Save query',
    group: 'Query',
    keys: 'mod+s',
    run: () => workspace().saveActiveQuery(),
  },
  {
    id: 'new-tab',
    title: 'New query tab',
    group: 'Query',
    keys: 'mod+t',
    webKeys: 'alt+t',
    run: () => void workspace().newTab(),
  },
  {
    id: 'close-tab',
    title: 'Close tab',
    group: 'Query',
    keys: 'mod+w',
    webKeys: 'alt+w',
    run: () => workspace().closeTab(workspace().activeTabId),
  },

  {
    id: 'import-file',
    title: 'Import file',
    group: 'Data',
    keys: 'mod+o',
    run: () => filePicker.open(IMPORT_ACCEPT),
  },
  {
    id: 'load-sample',
    title: 'Load sample data',
    group: 'Data',
    run: () => workspace().loadSample(),
  },
  {
    id: 'open-database',
    title: 'Open SQLite database',
    group: 'Data',
    run: () => filePicker.open(DATABASE_ACCEPT),
  },
  {
    id: 'export-database',
    title: 'Export database as SQLite file',
    group: 'Data',
    run: () => workspace().exportDatabase(),
  },
  {
    id: 'clear-workspace',
    title: 'Delete all tables',
    group: 'Data',
    run: () => workspace().resetWorkspace(),
  },

  {
    id: 'command-palette',
    title: 'Open command palette',
    group: 'View',
    keys: 'mod+k',
    run: () => workspace().setPaletteOpen(true),
  },
  {
    id: 'view-query',
    title: 'Go to query editor',
    group: 'View',
    keys: 'mod+1',
    webKeys: 'alt+1',
    run: () => workspace().setView('query'),
  },
  {
    id: 'view-dashboard',
    title: 'Go to dashboard',
    group: 'View',
    keys: 'mod+2',
    webKeys: 'alt+2',
    run: () => workspace().setView('dashboard'),
  },
  {
    id: 'toggle-sidebar',
    title: 'Toggle sidebar',
    group: 'View',
    keys: 'mod+b',
    // On phones the sidebar is a drawer that always starts closed, so it has its own state.
    run: () =>
      isCompact() ? workspace().setDrawerOpen(!workspace().drawerOpen) : settings().toggleSidebar(),
  },
  {
    id: 'toggle-theme',
    title: 'Switch between light and dark',
    group: 'View',
    keys: 'mod+shift+l',
    run: () => settings().setTheme(resolveTheme(settings().theme) === 'dark' ? 'light' : 'dark'),
  },
  {
    id: 'theme-light',
    title: 'Use light theme',
    group: 'View',
    run: () => settings().setTheme('light'),
  },
  {
    id: 'theme-dark',
    title: 'Use dark theme',
    group: 'View',
    run: () => settings().setTheme('dark'),
  },
  {
    id: 'theme-system',
    title: 'Match system theme',
    group: 'View',
    run: () => settings().setTheme('system'),
  },

  {
    id: 'show-shortcuts',
    title: 'Keyboard shortcuts',
    group: 'Help',
    keys: 'mod+/',
    run: () => workspace().setShortcutsOpen(true),
  },
  {
    id: 'view-source',
    title: 'View source code on GitHub',
    group: 'Help',
    run: () => platform.openExternal(REPOSITORY_URL),
  },
];

export const ACTIONS: Action[] = DEFINITIONS.map(({ webKeys, ...action }) =>
  webKeys && !platform.isDesktop ? { ...action, keys: webKeys } : action,
);

const byId = new Map(ACTIONS.map((action) => [action.id, action]));
const byKeys = new Map(
  ACTIONS.filter((action) => action.keys).map((action) => [action.keys as string, action]),
);

export function runAction(id: ActionId): void {
  void byId.get(id)?.run();
}

export const actionForCombo = (combo: string): Action | undefined => byKeys.get(combo);
export const keysFor = (id: ActionId): string | undefined => byId.get(id)?.keys;
export const formatKeys = (combo: string): string[] => formatKeysForPlatform(combo);

export const SHORTCUT_GROUPS = (['Query', 'Data', 'View', 'Help'] as const).map((title) => ({
  title,
  items: [
    ...ACTIONS.filter((action) => action.group === title && action.keys).map((action) => ({
      label: action.title,
      keys: action.keys as string,
    })),
    ...(title === 'Query' ? [{ label: 'Run only the selected SQL', keys: 'mod+enter' }] : []),
  ],
}));
