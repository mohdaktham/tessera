import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  shell,
  type IpcMainInvokeEvent,
} from 'electron';
import { writeFile } from 'node:fs/promises';
import type { ZodType } from 'zod';
import {
  Channels,
  ExternalUrlSchema,
  FileSaveSchema,
  ThemeSchema,
  WorkspaceSaveSchema,
  type AppInfo,
  type FileSaveResult,
} from '../shared/ipc';
import { loadWorkspace, saveWorkspace } from './storage';

/** Title bar overlay colours, kept in step with the renderer's CSS tokens. */
export const TITLE_BAR = {
  height: 44,
  dark: { color: '#161b26', symbolColor: '#96a0b5' },
  light: { color: '#f3f5f9', symbolColor: '#55607a' },
} as const;

export function titleBarColors(): { color: string; symbolColor: string } {
  return nativeTheme.shouldUseDarkColors ? TITLE_BAR.dark : TITLE_BAR.light;
}

/**
 * Registers a handler that (1) rejects calls from any frame that is not our
 * own top-level page and (2) validates the payload before the handler sees it.
 */
function handle<Input, Output>(
  channel: string,
  schema: ZodType<Input> | null,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  handler: (input: Input, event: IpcMainInvokeEvent) => Promise<Output> | Output,
): void {
  ipcMain.handle(channel, async (event, payload: unknown) => {
    if (!isTrustedSender(event)) throw new Error(`Blocked ${channel} from an untrusted frame`);
    const input = schema ? schema.parse(payload) : (undefined as Input);
    return handler(input, event);
  });
}

export function registerIpcHandlers(trustedOrigins: readonly string[]): void {
  const isTrustedSender = (event: IpcMainInvokeEvent): boolean => {
    const frame = event.senderFrame;
    if (!frame || frame.parent !== null) return false;
    try {
      return trustedOrigins.includes(new URL(frame.url).origin);
    } catch {
      return false;
    }
  };

  handle<void, AppInfo>(Channels.appInfo, null, isTrustedSender, () => ({
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron ?? '',
    chrome: process.versions.chrome ?? '',
    node: process.versions.node,
  }));

  handle(Channels.workspaceLoad, null, isTrustedSender, () => loadWorkspace());

  handle(Channels.workspaceSave, WorkspaceSaveSchema, isTrustedSender, (bytes) =>
    saveWorkspace(bytes),
  );

  handle(
    Channels.fileSave,
    FileSaveSchema,
    isTrustedSender,
    async (request, event): Promise<FileSaveResult> => {
      const window = BrowserWindow.fromWebContents(event.sender);
      const options = { defaultPath: request.defaultName, filters: request.filters };
      // The user picks the destination in a native dialog; the renderer never supplies a path.
      const result = window
        ? await dialog.showSaveDialog(window, options)
        : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return { saved: false };
      await writeFile(result.filePath, request.data);
      return { saved: true, path: result.filePath };
    },
  );

  handle(Channels.themeSet, ThemeSchema, isTrustedSender, (theme, event) => {
    nativeTheme.themeSource = theme;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window && process.platform !== 'darwin') {
      window.setTitleBarOverlay({ ...titleBarColors(), height: TITLE_BAR.height });
    }
  });

  handle(Channels.openExternal, ExternalUrlSchema, isTrustedSender, (url) =>
    shell.openExternal(url),
  );
}
