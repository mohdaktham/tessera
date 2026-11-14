/**
 * One interface, two hosts. Inside Electron these calls go through the preload
 * bridge to the main process; in a plain browser (the website, or
 * `npm run dev:web`) they fall back to IndexedDB and download links. The rest
 * of the UI never needs to know which one it is running on.
 */
import type {
  AppInfo,
  FileSaveRequest,
  FileSaveResult,
  MenuAction,
  ThemePreference,
} from '@shared/ipc';

export interface Platform {
  readonly isDesktop: boolean;
  /** 'darwin', 'win32', 'linux' or 'web'. Used to place window controls. */
  readonly os: string;
  getAppInfo(): Promise<AppInfo | null>;
  loadWorkspace(): Promise<Uint8Array | null>;
  saveWorkspace(bytes: Uint8Array): Promise<void>;
  saveFile(request: FileSaveRequest): Promise<FileSaveResult>;
  setTheme(theme: ThemePreference): Promise<void>;
  openExternal(url: string): Promise<void>;
  onMenuAction(listener: (action: MenuAction) => void): () => void;
}

const DB_NAME = 'tessera';
const STORE = 'workspace';
const KEY = 'database';

function openIndexedDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'));
  });
}

async function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openIndexedDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Browser storage request failed.'));
    });
  } finally {
    db.close();
  }
}

function detectOs(): string {
  const agent = navigator.userAgent;
  if (/Mac OS X|Macintosh/.test(agent)) return 'darwin';
  if (/Windows/.test(agent)) return 'win32';
  return 'linux';
}

const webPlatform: Platform = {
  isDesktop: false,
  os: 'web',
  getAppInfo: async () => null,
  loadWorkspace: async () => {
    const stored = await idbRequest<unknown>('readonly', (store) => store.get(KEY));
    return stored instanceof Uint8Array ? stored : null;
  },
  saveWorkspace: async (bytes) => {
    await idbRequest('readwrite', (store) => store.put(bytes, KEY));
  },
  saveFile: async ({ defaultName, data }) => {
    const blob = new Blob([data as BlobPart]);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = defaultName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    return { saved: true };
  },
  setTheme: async () => undefined,
  openExternal: async (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
  onMenuAction: () => () => undefined,
};

function createDesktopPlatform(api: NonNullable<Window['tessera']>): Platform {
  return {
    isDesktop: true,
    os: detectOs(),
    getAppInfo: () => api.getAppInfo(),
    loadWorkspace: () => api.loadWorkspace(),
    saveWorkspace: (bytes) => api.saveWorkspace(bytes),
    saveFile: (request) => api.saveFile(request),
    setTheme: (theme) => api.setTheme(theme),
    openExternal: (url) => api.openExternal(url),
    onMenuAction: (listener) => api.onMenuAction(listener),
  };
}

export const platform: Platform = window.tessera
  ? createDesktopPlatform(window.tessera)
  : webPlatform;
