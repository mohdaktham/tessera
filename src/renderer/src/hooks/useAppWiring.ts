import { useEffect, useMemo, useState } from 'react';
import { ACTIONS, actionForCombo, formatKeys, runAction } from '@/actions';
import type { Command } from '@/components/CommandPalette';
import { eventToCombo } from '@/lib/shortcuts';
import { platform } from '@/platform';
import { resolveTheme, useSettings } from '@/store/settings';
import { useWorkspace } from '@/store/workspace';

/** Applies the theme to the document and tells the desktop shell about it. */
export function useTheme(): void {
  const theme = useSettings((state) => state.theme);

  useEffect(() => {
    const apply = (): void => {
      document.documentElement.dataset.theme = resolveTheme(theme);
    };
    apply();
    void platform.setTheme(theme);
    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}

/**
 * One listener for every keyboard shortcut. It runs in the capture phase so a
 * shortcut wins even while the code editor has focus.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const combo = eventToCombo(event);
      const action = combo ? actionForCombo(combo) : undefined;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      void action.run();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, []);
}

/** Forwards native menu clicks to the same action registry. */
export function useMenuActions(): void {
  useEffect(() => platform.onMenuAction((action) => runAction(action)), []);
}

/** Everything the command palette can do right now: actions, tables and saved queries. */
export function useCommands(): Command[] {
  const schema = useWorkspace((state) => state.schema);
  const saved = useWorkspace((state) => state.saved);

  return useMemo(() => {
    const { previewTable, openSaved } = useWorkspace.getState();
    return [
      ...ACTIONS.filter((action) => action.id !== 'command-palette').map((action) => ({
        id: action.id,
        title: action.title,
        group: action.group,
        keys: action.keys ? formatKeys(action.keys) : undefined,
        run: () => void action.run(),
      })),
      ...schema.map((table) => ({
        id: `table:${table.name}`,
        title: `Preview ${table.name}`,
        group: 'Tables',
        run: () => previewTable(table.name),
      })),
      ...saved.map((query) => ({
        id: `saved:${query.id}`,
        title: `Open ${query.name}`,
        group: 'Saved queries',
        run: () => openSaved(query.id),
      })),
    ];
  }, [schema, saved]);
}

/** Tracks whether files are being dragged over the window, and imports them on drop. */
export function useFileDrop(): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    let depth = 0;
    const hasFiles = (event: DragEvent): boolean =>
      Boolean(event.dataTransfer?.types.includes('Files'));

    const onEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth++;
      setDragging(true);
    };
    const onOver = (event: DragEvent): void => {
      if (hasFiles(event)) event.preventDefault();
    };
    const onLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragging(false);
    };
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth = 0;
      setDragging(false);
      const files = [...(event.dataTransfer?.files ?? [])];
      if (files.length > 0) void useWorkspace.getState().importFiles(files);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  return dragging;
}
