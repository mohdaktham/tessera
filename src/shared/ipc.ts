/**
 * The contract between the renderer and the main process.
 *
 * Everything that crosses the process boundary is declared here once: channel
 * names, runtime validators (zod) and the TypeScript types derived from them.
 * The main process never trusts a payload it has not parsed with these schemas.
 */
import { z } from 'zod';

export const Channels = {
  appInfo: 'app:info',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save',
  fileSave: 'file:save',
  themeSet: 'theme:set',
  openExternal: 'shell:open-external',
  menuAction: 'menu:action',
} as const;

export const ThemeSchema = z.enum(['light', 'dark', 'system']);
export type ThemePreference = z.infer<typeof ThemeSchema>;

const Bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array, {
  message: 'Expected binary data',
});

/** 512 MB. A hard ceiling so a buggy or hostile renderer cannot fill the disk. */
export const MAX_WORKSPACE_BYTES = 512 * 1024 * 1024;

export const WorkspaceSaveSchema = Bytes.refine((b) => b.byteLength <= MAX_WORKSPACE_BYTES, {
  message: 'Workspace is larger than the 512 MB limit',
});

export const FileSaveSchema = z.object({
  defaultName: z
    .string()
    .min(1)
    .max(200)
    // A file name, never a path.
    .refine((name) => !/[\\/]/.test(name), { message: 'File name must not contain a path' }),
  filters: z
    .array(z.object({ name: z.string().max(60), extensions: z.array(z.string().max(12)).max(8) }))
    .max(8),
  data: z.union([z.string(), Bytes]),
});
export type FileSaveRequest = z.infer<typeof FileSaveSchema>;

export const FileSaveResultSchema = z.object({
  saved: z.boolean(),
  path: z.string().optional(),
});
export type FileSaveResult = z.infer<typeof FileSaveResultSchema>;

export const ExternalUrlSchema = z
  .string()
  .max(2048)
  .refine(
    (value) => {
      try {
        return new URL(value).protocol === 'https:';
      } catch {
        return false;
      }
    },
    { message: 'Only https links can be opened' },
  );

export const MenuActionSchema = z.enum([
  'new-tab',
  'close-tab',
  'import-file',
  'open-database',
  'export-database',
  'run-query',
  'format-query',
  'save-query',
  'command-palette',
  'toggle-sidebar',
  'toggle-theme',
  'show-shortcuts',
  'view-query',
  'view-dashboard',
]);
export type MenuAction = z.infer<typeof MenuActionSchema>;

export interface AppInfo {
  version: string;
  platform: NodeJS.Platform;
  electron: string;
  chrome: string;
  node: string;
}

/** The API the preload script exposes on `window.tessera`. */
export interface DesktopApi {
  getAppInfo(): Promise<AppInfo>;
  loadWorkspace(): Promise<Uint8Array | null>;
  saveWorkspace(bytes: Uint8Array): Promise<void>;
  saveFile(request: FileSaveRequest): Promise<FileSaveResult>;
  setTheme(theme: ThemePreference): Promise<void>;
  openExternal(url: string): Promise<void>;
  /** Subscribes to native menu commands. Returns an unsubscribe function. */
  onMenuAction(listener: (action: MenuAction) => void): () => void;
}
