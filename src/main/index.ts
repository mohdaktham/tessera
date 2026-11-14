import { app, BrowserWindow, Menu, nativeTheme, session } from 'electron';
import { join } from 'node:path';
import { registerIpcHandlers, TITLE_BAR, titleBarColors } from './ipc';
import { buildMenu } from './menu';
import { APP_ORIGIN, handleAppProtocol, registerAppScheme } from './protocol';
import { readWindowState, trackWindowState } from './windowState';

// Tests point this at a throwaway folder so they never touch a real workspace.
if (process.env.TESSERA_USER_DATA) app.setPath('userData', process.env.TESSERA_USER_DATA);

const devServerUrl = app.isPackaged ? undefined : process.env.ELECTRON_RENDERER_URL;
const startUrl = devServerUrl ?? `${APP_ORIGIN}/index.html`;
const trustedOrigins = [new URL(startUrl).origin];

let mainWindow: BrowserWindow | null = null;

registerAppScheme();

function createWindow(): void {
  const { bounds, maximized } = readWindowState();
  const isMac = process.platform === 'darwin';

  mainWindow = new BrowserWindow({
    ...bounds,
    minWidth: 940,
    minHeight: 600,
    show: false,
    backgroundColor: titleBarColors().color,
    title: 'Tessera',
    // The page draws its own top bar; the OS only overlays the window buttons.
    titleBarStyle: isMac ? 'hiddenInset' : 'hidden',
    ...(isMac ? {} : { titleBarOverlay: { ...titleBarColors(), height: TITLE_BAR.height } }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  trackWindowState(mainWindow);
  if (maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  void mainWindow.loadURL(startUrl);
}

/** Locks every web contents down to our own origin. */
function hardenWebContents(): void {
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => {
      if (!trustedOrigins.includes(new URL(url).origin)) event.preventDefault();
    });
    contents.on('will-attach-webview', (event) => event.preventDefault());
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  hardenWebContents();

  void app.whenReady().then(() => {
    // The app needs no camera, location, notifications or anything else.
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );

    if (!devServerUrl) handleAppProtocol(join(__dirname, '../renderer'));
    registerIpcHandlers(trustedOrigins);
    Menu.setApplicationMenu(buildMenu(() => mainWindow));
    createWindow();

    nativeTheme.on('updated', () => {
      if (mainWindow && process.platform !== 'darwin') {
        mainWindow.setTitleBarOverlay({ ...titleBarColors(), height: TITLE_BAR.height });
      }
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
