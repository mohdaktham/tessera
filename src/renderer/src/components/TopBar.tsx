import {
  CodeXml,
  FileUp,
  Keyboard,
  LayoutDashboard,
  Monitor,
  Moon,
  PanelLeft,
  Search,
  SquareTerminal,
  Sun,
} from 'lucide-react';
import { formatKeys, runAction } from '@/actions';
import { platform } from '@/platform';
import { useSettings } from '@/store/settings';
import { useWorkspace, type View } from '@/store/workspace';
import { Logo } from './Mosaic';

const VIEWS: Array<{ id: View; label: string; icon: typeof SquareTerminal }> = [
  { id: 'query', label: 'Query', icon: SquareTerminal },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
];

const THEME_CYCLE = { system: 'light', light: 'dark', dark: 'system' } as const;
const THEME_META = {
  system: { icon: Monitor, label: 'Theme: match system' },
  light: { icon: Sun, label: 'Theme: light' },
  dark: { icon: Moon, label: 'Theme: dark' },
} as const;

/**
 * The app's own title bar. On the desktop the whole strip drags the window,
 * and space is reserved for the operating system's window buttons.
 */
export function TopBar() {
  const view = useWorkspace((state) => state.view);
  const setView = useWorkspace((state) => state.setView);
  const theme = useSettings((state) => state.theme);
  const setTheme = useSettings((state) => state.setTheme);
  const ThemeIcon = THEME_META[theme].icon;

  // macOS puts the traffic lights on the left; Windows and Linux put controls on the right.
  const inset = !platform.isDesktop ? '' : platform.os === 'darwin' ? 'pl-[84px]' : 'pr-[146px]';

  return (
    <header
      className={`drag-region flex h-11 flex-none items-center gap-3 border-b border-line bg-canvas px-3 ${inset}`}
    >
      <div className="flex items-center gap-2">
        <Logo />
        <span className="hidden text-base font-semibold tracking-tight sm:inline">Tessera</span>
      </div>

      <button
        type="button"
        className="icon-btn no-drag"
        onClick={() => runAction('toggle-sidebar')}
        aria-label="Toggle sidebar"
        title="Toggle sidebar"
      >
        <PanelLeft size={15} />
      </button>

      <nav
        className="no-drag flex items-center gap-0.5 rounded-lg bg-raised p-0.5"
        aria-label="Views"
      >
        {VIEWS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-current={view === id ? 'page' : undefined}
            onClick={() => setView(id)}
            className={`flex h-6 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors ${
              view === id ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
            }`}
          >
            <Icon size={13} />
            <span className={view === id ? '' : 'hidden sm:inline'}>{label}</span>
          </button>
        ))}
      </nav>

      <button
        type="button"
        onClick={() => runAction('command-palette')}
        aria-label="Search commands, tables and saved queries"
        className="no-drag ml-auto flex h-7 items-center gap-2 rounded-md border border-line bg-surface px-2 text-left text-sm text-faint transition-colors hover:border-faint md:mx-auto md:w-full md:max-w-[380px] md:px-2.5"
      >
        <Search size={13} className="flex-none" />
        <span className="hidden flex-1 truncate md:block">
          Search commands, tables and saved queries
        </span>
        <span className="hidden flex-none gap-1 md:flex">
          {formatKeys('mod+k').map((key) => (
            <kbd key={key} className="kbd">
              {key}
            </kbd>
          ))}
        </span>
      </button>

      <div className="no-drag flex items-center gap-0.5">
        <button type="button" className="btn btn-ghost" onClick={() => runAction('import-file')}>
          <FileUp size={14} />
          <span className="hidden sm:inline">Import</span>
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => setTheme(THEME_CYCLE[theme])}
          aria-label={THEME_META[theme].label}
          title={THEME_META[theme].label}
        >
          <ThemeIcon size={15} />
        </button>
        {!platform.isDesktop && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => runAction('view-source')}
            aria-label="View source code on GitHub"
            title="View source code on GitHub"
          >
            <CodeXml size={15} />
          </button>
        )}
        <button
          type="button"
          className="icon-btn hidden sm:inline-grid"
          onClick={() => runAction('show-shortcuts')}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts"
        >
          <Keyboard size={15} />
        </button>
      </div>
    </header>
  );
}
