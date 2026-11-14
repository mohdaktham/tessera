import { useMemo, useState } from 'react';
import {
  Bookmark,
  ChevronRight,
  Eye,
  FileUp,
  KeyRound,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { runAction } from '@/actions';
import { formatCompact, formatDuration, formatRelativeTime } from '@/lib/format';
import { fuzzyFilter } from '@/lib/fuzzy';
import { describeSql } from '@/lib/sqlUtils';
import type { TableInfo } from '@/lib/types';
import { useWorkspace } from '@/store/workspace';

type Section = 'tables' | 'saved' | 'history';

const typeTile = (type: string): string => {
  if (/INT|REAL|NUM|DEC|DOUB|FLOA/.test(type)) return 'bg-lapis';
  if (/CHAR|TEXT|CLOB/.test(type)) return 'bg-verdigris';
  if (/DATE|TIME/.test(type)) return 'bg-ochre';
  if (/BLOB/.test(type)) return 'bg-porphyry';
  return 'bg-line';
};

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-4 text-sm leading-relaxed text-muted">{children}</p>;
}

function TableRow({ table }: { table: TableInfo }) {
  const [open, setOpen] = useState(false);
  const { previewTable, dropTable } = useWorkspace.getState();

  return (
    <li>
      <div className="group flex h-7 items-center rounded-md pr-1 hover:bg-raised">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex h-full min-w-0 flex-1 items-center gap-1 pl-1 text-left"
        >
          <ChevronRight
            size={13}
            className={`flex-none text-faint transition-transform ${open ? 'rotate-90' : ''}`}
          />
          <span className="truncate font-mono text-xs font-medium">{table.name}</span>
          <span className="ml-auto flex-none pr-1 pl-2 text-2xs text-faint tabular-nums group-hover:hidden group-focus-within:hidden pointer-coarse:hidden">
            {table.kind === 'view' ? 'view' : formatCompact(table.rowCount ?? 0)}
          </span>
        </button>
        <span className="hidden flex-none items-center group-hover:flex group-focus-within:flex pointer-coarse:flex">
          <button
            type="button"
            className="icon-btn h-6 w-6"
            onClick={() => previewTable(table.name)}
            aria-label={`Preview ${table.name}`}
            title="Preview rows"
          >
            <Eye size={13} />
          </button>
          <button
            type="button"
            className="icon-btn h-6 w-6 hover:text-danger"
            onClick={() => dropTable(table)}
            aria-label={`Delete ${table.name}`}
            title={`Delete ${table.kind}`}
          >
            <Trash2 size={13} />
          </button>
        </span>
      </div>
      {open && (
        <ul className="mb-1 ml-[11px] border-l border-line-soft py-0.5 pl-2.5">
          {table.columns.map((column) => (
            <li key={column.name} className="flex h-6 items-center gap-2 pr-2">
              <span className={`tile ${typeTile(column.type)}`} />
              <span className="selectable truncate font-mono text-xs">{column.name}</span>
              {column.primaryKey && (
                <KeyRound size={10} className="flex-none text-ochre" aria-label="Primary key" />
              )}
              <span className="ml-auto flex-none font-mono text-2xs text-faint lowercase">
                {column.type}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function TablesSection() {
  const schema = useWorkspace((state) => state.schema);
  const [filter, setFilter] = useState('');
  const visible = useMemo(
    () => fuzzyFilter(filter, schema, (table) => table.name).map((entry) => entry.item),
    [filter, schema],
  );

  if (schema.length === 0) {
    return (
      <div className="px-3 py-3">
        <p className="text-sm leading-relaxed text-muted">
          No tables yet. Bring in a file, or start with the sample dataset.
        </p>
        <div className="mt-3 flex flex-col gap-1.5">
          <button type="button" className="btn" onClick={() => runAction('load-sample')}>
            <Sparkles size={14} />
            Load sample data
          </button>
          <button type="button" className="btn" onClick={() => runAction('import-file')}>
            <FileUp size={14} />
            Import file
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative flex-none px-2 pt-2 pb-1">
        <Search
          size={13}
          className="pointer-events-none absolute top-1/2 left-4 mt-0.5 -translate-y-1/2 text-faint"
        />
        <input
          className="field pl-7"
          placeholder="Filter tables"
          aria-label="Filter tables"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {visible.map((table) => (
          <TableRow key={table.name} table={table} />
        ))}
        {visible.length === 0 && <Empty>No table matches “{filter}”.</Empty>}
      </ul>
      <div className="flex-none border-t border-line-soft p-2">
        <button type="button" className="btn w-full" onClick={() => runAction('import-file')}>
          <FileUp size={14} />
          Import file
        </button>
      </div>
    </>
  );
}

function SavedSection() {
  const saved = useWorkspace((state) => state.saved);
  const { openSaved, deleteSaved } = useWorkspace.getState();
  if (saved.length === 0)
    return <Empty>Queries you save appear here. Write one, then choose Save.</Empty>;
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto p-2">
      {saved.map((query) => (
        <li key={query.id} className="group flex h-7 items-center rounded-md pr-1 hover:bg-raised">
          <button
            type="button"
            onClick={() => openSaved(query.id)}
            className="flex h-full min-w-0 flex-1 items-center gap-2 pl-2 text-left"
          >
            <Bookmark size={12} className="flex-none text-ochre" />
            <span className="truncate text-sm">{query.name}</span>
          </button>
          <button
            type="button"
            className="icon-btn hidden h-6 w-6 group-hover:grid group-focus-within:grid hover:text-danger pointer-coarse:grid"
            onClick={() => deleteSaved(query.id)}
            aria-label={`Delete saved query ${query.name}`}
            title="Delete saved query"
          >
            <Trash2 size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function HistorySection() {
  const history = useWorkspace((state) => state.history);
  const { newTab, clearHistory } = useWorkspace.getState();
  if (history.length === 0)
    return <Empty>Every query you run is kept here, with how long it took.</Empty>;
  return (
    <>
      <ul className="min-h-0 flex-1 overflow-y-auto p-2">
        {history.map((entry) => (
          <li key={entry.id}>
            <button
              type="button"
              onClick={() => newTab(entry.sql)}
              title={entry.ok ? 'Open in a new tab' : entry.error}
              className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-raised"
            >
              <span className="flex items-center gap-2">
                <span className={`tile ${entry.ok ? 'bg-malachite' : 'bg-danger'}`} />
                <span className="truncate font-mono text-xs">{describeSql(entry.sql, 60)}</span>
              </span>
              <span className="mt-0.5 block pl-4 text-2xs text-faint">
                {formatRelativeTime(entry.ranAt)}
                {entry.ok
                  ? `, ${formatCompact(entry.rowCount)} rows in ${formatDuration(entry.durationMs)}`
                  : ', failed'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex-none border-t border-line-soft p-2">
        <button type="button" className="btn btn-ghost w-full" onClick={clearHistory}>
          Clear history
        </button>
      </div>
    </>
  );
}

export function Sidebar({ width }: { width: number }) {
  const [section, setSection] = useState<Section>('tables');
  const counts: Record<Section, number> = {
    tables: useWorkspace((state) => state.schema.length),
    saved: useWorkspace((state) => state.saved.length),
    history: useWorkspace((state) => state.history.length),
  };

  const sections: Array<{ id: Section; label: string }> = [
    { id: 'tables', label: 'Tables' },
    { id: 'saved', label: 'Saved' },
    { id: 'history', label: 'History' },
  ];

  return (
    <aside
      className="flex h-full flex-none flex-col bg-canvas"
      style={{ width }}
      aria-label="Sidebar"
    >
      <div
        role="tablist"
        aria-label="Sidebar sections"
        className="flex h-9 flex-none items-center gap-0.5 border-b border-line px-2"
      >
        {sections.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            onClick={() => setSection(id)}
            className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium transition-colors ${
              section === id ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
            }`}
          >
            {label}
            {counts[id] > 0 && (
              <span className="text-2xs text-faint tabular-nums">{counts[id]}</span>
            )}
          </button>
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        {section === 'tables' && <TablesSection />}
        {section === 'saved' && <SavedSection />}
        {section === 'history' && <HistorySection />}
      </div>
    </aside>
  );
}
