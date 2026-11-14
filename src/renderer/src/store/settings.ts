import type { ThemePreference } from '@shared/ipc';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  theme: ThemePreference;
  sidebarOpen: boolean;
  sidebarWidth: number;
  /** Share of the query view's height given to the editor, 0–1. */
  editorRatio: number;
  /** Most rows a single query returns to the grid. */
  rowLimit: number;
  setTheme(theme: ThemePreference): void;
  toggleSidebar(): void;
  setSidebarWidth(width: number): void;
  setEditorRatio(ratio: number): void;
  setRowLimit(limit: number): void;
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const ROW_LIMITS = [1_000, 10_000, 50_000, 200_000] as const;

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      sidebarOpen: true,
      sidebarWidth: 264,
      editorRatio: 0.42,
      rowLimit: 50_000,
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarWidth: (width) => set({ sidebarWidth: clamp(Math.round(width), 200, 460) }),
      setEditorRatio: (ratio) => set({ editorRatio: clamp(ratio, 0.15, 0.8) }),
      setRowLimit: (rowLimit) => set({ rowLimit }),
    }),
    { name: 'tessera.settings', version: 1 },
  ),
);

/** Resolves 'system' against the OS preference. */
export function resolveTheme(theme: ThemePreference): 'light' | 'dark' {
  if (theme !== 'system') return theme;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
