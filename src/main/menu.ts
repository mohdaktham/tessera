import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import { Channels, type MenuAction } from '../shared/ipc';
import { REPOSITORY_URL } from '../shared/links';

/**
 * Builds the native application menu. Shortcuts are handled once, in the
 * renderer, so items here only display the accelerator
 * (`registerAccelerator: false`) and forward a typed action when clicked.
 */
export function buildMenu(getWindow: () => BrowserWindow | null): Menu {
  const isMac = process.platform === 'darwin';

  const action = (
    label: string,
    id: MenuAction,
    accelerator?: string,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator,
    registerAccelerator: false,
    click: () => getWindow()?.webContents.send(Channels.menuAction, id),
  });

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as MenuItemConstructorOptions] : []),
    {
      label: 'File',
      submenu: [
        action('New query tab', 'new-tab', 'CmdOrCtrl+T'),
        action('Close tab', 'close-tab', 'CmdOrCtrl+W'),
        { type: 'separator' },
        action('Import file…', 'import-file', 'CmdOrCtrl+O'),
        action('Open SQLite database…', 'open-database'),
        action('Export database…', 'export-database'),
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'Query',
      submenu: [
        action('Run', 'run-query', 'CmdOrCtrl+Enter'),
        action('Format SQL', 'format-query', 'CmdOrCtrl+Shift+F'),
        action('Save query', 'save-query', 'CmdOrCtrl+S'),
      ],
    },
    {
      label: 'View',
      submenu: [
        action('Query editor', 'view-query', 'CmdOrCtrl+1'),
        action('Dashboard', 'view-dashboard', 'CmdOrCtrl+2'),
        { type: 'separator' },
        action('Command palette', 'command-palette', 'CmdOrCtrl+K'),
        action('Toggle sidebar', 'toggle-sidebar', 'CmdOrCtrl+B'),
        action('Toggle light and dark', 'toggle-theme', 'CmdOrCtrl+Shift+L'),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged
          ? []
          : ([
              { type: 'separator' },
              { role: 'reload' },
              { role: 'toggleDevTools' },
            ] as MenuItemConstructorOptions[])),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        action('Keyboard shortcuts', 'show-shortcuts', 'CmdOrCtrl+/'),
        { label: 'Source code on GitHub', click: () => void shell.openExternal(REPOSITORY_URL) },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
