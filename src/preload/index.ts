/**
 * Preload script. Runs in an isolated, sandboxed context and exposes a small,
 * explicit API to the page. The renderer never gets `ipcRenderer` itself.
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels, MenuActionSchema, type DesktopApi, type MenuAction } from '../shared/ipc';

const api: DesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(Channels.appInfo),
  loadWorkspace: () => ipcRenderer.invoke(Channels.workspaceLoad),
  saveWorkspace: (bytes) => ipcRenderer.invoke(Channels.workspaceSave, bytes),
  saveFile: (request) => ipcRenderer.invoke(Channels.fileSave, request),
  setTheme: (theme) => ipcRenderer.invoke(Channels.themeSet, theme),
  openExternal: (url) => ipcRenderer.invoke(Channels.openExternal, url),
  onMenuAction: (listener: (action: MenuAction) => void) => {
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const parsed = MenuActionSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(Channels.menuAction, handler);
    return () => ipcRenderer.removeListener(Channels.menuAction, handler);
  },
};

contextBridge.exposeInMainWorld('tessera', api);
