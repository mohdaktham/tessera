import { useEffect, useState } from 'react';
import { FileUp } from 'lucide-react';
import { CommandPalette } from '@/components/CommandPalette';
import { Dashboard } from '@/components/Dashboard';
import { ConfirmDialog, PromptDialog, ShortcutsDialog, Toasts } from '@/components/Overlays';
import { QueryView } from '@/components/QueryView';
import { Sidebar } from '@/components/Sidebar';
import { Splitter } from '@/components/Splitter';
import { StatusBar } from '@/components/StatusBar';
import { TopBar } from '@/components/TopBar';
import { Welcome } from '@/components/Welcome';
import {
  useCommands,
  useFileDrop,
  useGlobalShortcuts,
  useMenuActions,
  useTheme,
} from '@/hooks/useAppWiring';
import { filePicker } from '@/lib/filePicker';
import { useCompact } from '@/lib/viewport';
import { useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';

export default function App() {
  useTheme();
  useGlobalShortcuts();
  useMenuActions();
  const dragging = useFileDrop();
  const commands = useCommands();

  const view = useWorkspace((state) => state.view);
  const hasTables = useWorkspace((state) => state.schema.length > 0);
  const hasWork = useWorkspace((state) => state.tabs.some((tab) => tab.sql.trim() !== ''));
  const engineReady = useWorkspace((state) => state.engineStatus === 'ready');
  const paletteOpen = useWorkspace((state) => state.paletteOpen);
  const setPaletteOpen = useWorkspace((state) => state.setPaletteOpen);
  const sidebarOpen = useSettings((state) => state.sidebarOpen);
  const sidebarWidth = useSettings((state) => state.sidebarWidth);
  const setSidebarWidth = useSettings((state) => state.setSidebarWidth);
  const [skippedWelcome, setSkippedWelcome] = useState(false);
  const compact = useCompact();
  const drawerOpen = useWorkspace((state) => state.drawerOpen);
  const setDrawerOpen = useWorkspace((state) => state.setDrawerOpen);

  useEffect(() => {
    void useWorkspace.getState().boot();
  }, []);

  // The welcome screen covers the empty first run; once there is a table or a query, it is gone.
  const showWelcome =
    !hasTables && !hasWork && !skippedWelcome && (view === 'query' || !engineReady);

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {compact
          ? drawerOpen && (
              <div
                className="fixed inset-0 z-30 flex"
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setDrawerOpen(false);
                }}
              >
                <div className="pop-in flex h-full shadow-pop">
                  <Sidebar width={Math.min(320, window.innerWidth - 56)} />
                </div>
                <button
                  type="button"
                  aria-label="Close sidebar"
                  className="flex-1 cursor-default bg-(--scrim)"
                  onClick={() => setDrawerOpen(false)}
                />
              </div>
            )
          : sidebarOpen && (
              <>
                <Sidebar width={sidebarWidth} />
                <Splitter
                  orientation="vertical"
                  label="Resize sidebar"
                  onResize={(clientX) => setSidebarWidth(clientX)}
                  onNudge={(delta) => setSidebarWidth(sidebarWidth + delta)}
                />
              </>
            )}
        <main className="min-w-0 flex-1 bg-surface">
          {showWelcome ? (
            <Welcome onSkip={() => setSkippedWelcome(true)} />
          ) : view === 'dashboard' ? (
            <Dashboard />
          ) : (
            <QueryView />
          )}
        </main>
      </div>
      <StatusBar />

      <input
        ref={(element) => filePicker.attach(element)}
        type="file"
        multiple
        hidden
        data-testid="file-input"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (files.length > 0) void useWorkspace.getState().importFiles(files);
        }}
      />

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 grid place-items-center bg-(--scrim) p-6">
          <div className="pop-in flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-accent bg-surface px-14 py-10 shadow-pop">
            <FileUp size={28} className="text-accent" />
            <p className="text-lg font-semibold">Drop to import</p>
            <p className="text-sm text-muted">CSV, TSV, JSON or a SQLite database</p>
          </div>
        </div>
      )}

      <CommandPalette
        open={paletteOpen}
        commands={commands}
        onClose={() => setPaletteOpen(false)}
      />
      <ShortcutsDialog />
      <ConfirmDialog />
      <PromptDialog />
      <Toasts />
    </div>
  );
}
