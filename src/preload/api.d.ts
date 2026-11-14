import type { DesktopApi } from '@shared/ipc';

declare global {
  interface Window {
    /** Present only when running inside the Electron shell. */
    tessera?: DesktopApi;
  }
}

export {};
