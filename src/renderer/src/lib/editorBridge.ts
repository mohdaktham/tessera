import type { EditorView } from '@codemirror/view';

/**
 * A handle on the live editor so actions outside React's tree (menu commands,
 * the command palette) can read the selection or focus the editor.
 */
let current: EditorView | null = null;

export const editorBridge = {
  attach(view: EditorView | null): void {
    current = view;
  },
  /** The selected text, or an empty string when nothing is selected. */
  selection(): string {
    if (!current) return '';
    const { from, to } = current.state.selection.main;
    return from === to ? '' : current.state.sliceDoc(from, to);
  },
  focus(): void {
    current?.focus();
  },
};
