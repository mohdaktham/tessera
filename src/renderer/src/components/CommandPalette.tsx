import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CornerDownLeft, Search } from 'lucide-react';
import { fuzzyFilter } from '@/lib/fuzzy';

export interface Command {
  id: string;
  title: string;
  group: string;
  /** Key cap labels, already formatted for the platform. */
  keys?: string[];
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  commands: Command[];
  onClose: () => void;
}

/** Wraps the matched characters of a title in <mark>. */
function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const marks = new Set(indices);
  const parts: ReactNode[] = [];
  let buffer = '';
  let marked = false;
  const flush = (key: number): void => {
    if (!buffer) return;
    parts.push(
      marked ? (
        <mark key={key} className="bg-transparent font-semibold text-accent">
          {buffer}
        </mark>
      ) : (
        buffer
      ),
    );
    buffer = '';
  };
  for (let index = 0; index < text.length; index++) {
    const isMarked = marks.has(index);
    if (isMarked !== marked) {
      flush(index);
      marked = isMarked;
    }
    buffer += text[index];
  }
  flush(text.length);
  return <>{parts}</>;
}

/**
 * A keyboard-first launcher: type to fuzzy-search every command, table and
 * saved query, then press Enter.
 */
export function CommandPalette({ open, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const list = useRef<HTMLUListElement>(null);
  const restoreFocus = useRef<Element | null>(null);

  const results = useMemo(
    () => fuzzyFilter(query, commands, (command) => command.title),
    [query, commands],
  );

  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement;
      setQuery('');
      setCursor(0);
    } else if (restoreFocus.current instanceof HTMLElement) {
      restoreFocus.current.focus();
    }
  }, [open]);

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [cursor, results]);

  if (!open) return null;

  const choose = (index: number): void => {
    const chosen = results[index];
    if (!chosen) return;
    onClose();
    chosen.item.run();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center bg-(--scrim) pt-[14vh]"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="pop-in w-[560px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-line-soft px-3.5">
          <Search size={15} className="flex-none text-faint" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="command-list"
            aria-activedescendant={
              results[cursor] ? `command-${results[cursor].item.id}` : undefined
            }
            aria-label="Search commands, tables and saved queries"
            placeholder="Search commands, tables and saved queries"
            className="selectable h-11 w-full bg-transparent text-base outline-none placeholder:text-faint"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setCursor(0);
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown')
                setCursor((current) => Math.min(results.length - 1, current + 1));
              else if (event.key === 'ArrowUp') setCursor((current) => Math.max(0, current - 1));
              else if (event.key === 'Enter') choose(cursor);
              else if (event.key === 'Escape') onClose();
              else return;
              event.preventDefault();
            }}
          />
        </div>

        <ul
          ref={list}
          id="command-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[46vh] overflow-y-auto p-1.5"
        >
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">Nothing matches “{query}”.</li>
          )}
          {results.map(({ item, match }, index) => {
            const active = index === cursor;
            // Show a group heading when browsing; ranked search results are not grouped.
            const heading =
              query.trim() === '' && item.group !== results[index - 1]?.item.group
                ? item.group
                : null;
            return (
              <li key={item.id} role="presentation">
                {heading && (
                  <div className="px-2.5 pt-2 pb-1 text-2xs font-semibold text-faint">
                    {heading}
                  </div>
                )}
                <div
                  id={`command-${item.id}`}
                  role="option"
                  aria-selected={active}
                  onMouseMove={() => setCursor(index)}
                  onClick={() => choose(index)}
                  className={`flex h-8 cursor-pointer items-center gap-2 rounded-md px-2.5 text-sm ${active ? 'bg-accent-soft text-ink' : 'text-ink'}`}
                >
                  <span className="min-w-0 flex-1 truncate">
                    <Highlighted text={item.title} indices={match.indices} />
                  </span>
                  {query.trim() !== '' && (
                    <span className="flex-none text-2xs text-faint">{item.group}</span>
                  )}
                  {item.keys && (
                    <span className="flex flex-none gap-1">
                      {item.keys.map((key) => (
                        <kbd key={key} className="kbd">
                          {key}
                        </kbd>
                      ))}
                    </span>
                  )}
                  {active && !item.keys && (
                    <CornerDownLeft size={13} className="flex-none text-faint" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
