import { useEffect, useRef } from 'react';
import { basicSetup } from 'codemirror';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, placeholder } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { SQLite, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import { editorBridge } from '@/lib/editorBridge';
import type { TableInfo } from '@/lib/types';

/** Colours come from CSS variables, so the editor follows the app theme with no reconfiguration. */
const editorTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-content': { caretColor: 'var(--accent)', padding: '10px 0' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection':
    { backgroundColor: 'color-mix(in srgb, var(--accent) 26%, transparent)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--faint)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 14px', minWidth: '34px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--raised) 55%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ink)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'var(--accent-soft)',
    outline: 'none',
  },
  '.cm-placeholder': { color: 'var(--faint)' },
  '.cm-foldPlaceholder': {
    backgroundColor: 'var(--raised)',
    border: 'none',
    color: 'var(--muted)',
  },
  '.cm-tooltip': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-pop)',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete > ul': {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    maxHeight: '220px',
  },
  '.cm-tooltip-autocomplete > ul > li': { padding: '3px 10px 3px 6px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--accent)',
    color: 'var(--accent-ink)',
  },
  '.cm-completionDetail': { color: 'inherit', opacity: '0.6', fontStyle: 'normal' },
  '.cm-panels': {
    backgroundColor: 'var(--canvas)',
    color: 'var(--ink)',
    borderColor: 'var(--line)',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--ochre) 35%, transparent)' },
  '.cm-textfield': {
    backgroundColor: 'var(--surface)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
  },
  '.cm-button': {
    backgroundImage: 'none',
    backgroundColor: 'var(--raised)',
    border: '1px solid var(--line)',
    borderRadius: '4px',
  },
});

const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.operatorKeyword], color: 'var(--lapis)', fontWeight: '600' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--verdigris)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--ochre)' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: 'var(--porphyry)' },
  { tag: tags.typeName, color: 'var(--malachite)' },
  { tag: [tags.lineComment, tags.blockComment], color: 'var(--faint)', fontStyle: 'italic' },
  { tag: tags.operator, color: 'var(--muted)' },
]);

const schemaCompartment = new Compartment();

const sqlExtension = (tables: readonly TableInfo[]) =>
  sql({
    dialect: SQLite,
    upperCaseKeywords: true,
    schema: Object.fromEntries(
      tables.map((table) => [table.name, table.columns.map((column) => column.name)]),
    ),
  });

/** Editor state per tab, kept across tab switches so undo history and cursor survive. */
const savedStates = new Map<string, EditorState>();

export function forgetEditorState(tabId: string): void {
  savedStates.delete(tabId);
}

interface SqlEditorProps {
  tabId: string;
  value: string;
  tables: readonly TableInfo[];
  onChange: (value: string) => void;
}

export function SqlEditor({ tabId, value, tables, onChange }: SqlEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  // Read once at mount; later edits flow through the effects below.
  const initial = useRef({ value, tables });

  useEffect(() => {
    if (!host.current) return;
    const state =
      savedStates.get(tabId) ??
      EditorState.create({
        doc: initial.current.value,
        extensions: [
          basicSetup,
          schemaCompartment.of(sqlExtension(initial.current.tables)),
          editorTheme,
          syntaxHighlighting(highlightStyle),
          placeholder('SELECT * FROM …'),
          EditorView.contentAttributes.of({ 'aria-label': 'SQL editor' }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      });

    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    editorBridge.attach(view);
    view.focus();

    return () => {
      savedStates.set(tabId, view.state);
      editorBridge.attach(null);
      view.destroy();
      viewRef.current = null;
    };
  }, [tabId]);

  // Apply changes made outside the editor (formatting, opening a saved query).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value, tabId]);

  // Keep autocomplete in step with the tables that exist right now.
  useEffect(() => {
    viewRef.current?.dispatch({ effects: schemaCompartment.reconfigure(sqlExtension(tables)) });
  }, [tables, tabId]);

  return <div ref={host} className="h-full min-h-0 overflow-hidden" />;
}
