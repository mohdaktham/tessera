# Architecture

This document explains how Tessera is built and why. It is written for someone reading the code for the first time.

## The three processes

An Electron app is several programs working together. Tessera uses them like this:

| Process         | Runs                                    | Can touch                             | Source                    |
| --------------- | --------------------------------------- | ------------------------------------- | ------------------------- |
| Main            | Node.js                                 | Files, native dialogs, menus, windows | `src/main`                |
| Preload         | A small isolated script inside the page | Only `ipcRenderer`                    | `src/preload`             |
| Renderer        | The page itself (React)                 | Nothing outside the page              | `src/renderer`            |
| Database worker | A Web Worker started by the renderer    | Nothing outside the page              | `src/renderer/src/engine` |

The rule that keeps this manageable: **code only talks to its neighbour, and always through a typed interface.**

```
React component → store action → engine client → worker → SQLite
                              ↘ platform layer → preload bridge → main process → disk
```

## What happens when you press Run

1. A keyboard listener in `hooks/useAppWiring.ts` turns the key press into `mod+enter` and looks it up in the action registry (`actions.ts`).
2. The action calls `runQuery` in the workspace store. The store reads the editor's selection, marks the tab as running and sends `{ kind: 'run', sql, maxRows }` to the worker through `EngineClient`.
3. The worker (`engine/db.worker.ts`) hands the request to `Engine.run` (`engine/core.ts`), which steps through each statement and collects rows up to the row limit.
4. The result is posted back. `EngineClient` matches it to the waiting promise by request id.
5. The store saves the result, picks a sensible default chart, appends to history and, if the SQL may have changed data, refreshes the schema and schedules an autosave.
6. React re-renders the results grid, which draws only the rows currently on screen.

The UI thread does no SQL work at any point, which is why the window stays responsive during a slow query.

## Design decisions and trade-offs

### SQLite as WebAssembly, in a worker

The alternative was a native binding such as `better-sqlite3` in the main process.

|                | WebAssembly in a worker (chosen)                 | Native binding in main                                    |
| -------------- | ------------------------------------------------ | --------------------------------------------------------- |
| Builds         | One build runs everywhere, no compiler toolchain | Must be rebuilt per platform and Electron version         |
| Responsiveness | Off the UI thread by construction                | Blocks the main process unless moved to a utility process |
| Reach          | Also runs in a browser, so it ships as a website | Desktop only                                              |
| Data size      | Whole database in memory                         | Limited only by disk                                      |
| Speed          | Roughly 2–3× slower than native                  | Fastest                                                   |

For an analysis tool working on files that fit in memory, the simpler build and the website are worth more than the raw speed. The engine sits behind a narrow interface (`engine/protocol.ts`), so swapping the implementation later would not touch the UI.

### The engine core has no worker code in it

`engine/core.ts` is a plain class that takes a SQLite instance. `db.worker.ts` is a thin wrapper that receives messages and calls it. This split means the unit tests exercise the exact engine code the app ships, running it directly in Node against a real SQLite build, with no mocks.

### Stopping a query

SQLite runs synchronously inside the worker, so there is no way to interrupt it by sending a message; the worker would not read the message until the query finished. Instead, `EngineClient.restart()` terminates the worker, rejects everything pending with a cancellation error, and starts a new worker from the last saved workspace. Autosave runs half a second after every change, which bounds what can be lost.

### A private `app://` scheme instead of `file://`

Pages loaded from `file://` have an opaque origin, which breaks or complicates module workers, `fetch`, and streaming WebAssembly compilation. Serving the built files from a registered `app://` scheme (`main/protocol.ts`) gives the page a real origin and lets every response carry a Content-Security-Policy header. `main/assetPath.ts` makes sure a request can never resolve to a file outside the app's own folder.

### The IPC contract lives in one file

`src/shared/ipc.ts` declares each channel name, a Zod schema for its payload, and the TypeScript types derived from those schemas. Both sides import it, so they cannot disagree. In the main process, the `handle` helper in `main/ipc.ts` does two things before any handler runs:

1. Rejects the call unless it came from the app's own top-level frame.
2. Parses the payload with the schema, so handlers only ever see validated data.

File writes are a good example of the approach. The renderer can ask to save some bytes and suggest a file name, but it never supplies a path. The main process shows a native save dialog and writes wherever the user chose.

### One action registry

Every command is defined once in `actions.ts` with an id, a title and an optional shortcut. The command palette, the keyboard handler, the native menu and the shortcuts dialog all read from that list. Adding a command means adding one object.

### A platform layer for two hosts

`platform/index.ts` exports one object with methods such as `loadWorkspace`, `saveWorkspace` and `saveFile`. Inside Electron they call the preload bridge. In a browser they use IndexedDB and download links. Nothing else in the renderer checks where it is running.

### State management

Two Zustand stores:

- `store/workspace.ts` holds tabs, results, schema, history, saved queries and dashboard tiles, along with every action that changes them. Tabs, history, saved queries and tiles are persisted to `localStorage`; query results are deliberately not.
- `store/settings.ts` holds preferences such as theme and pane sizes.

Components subscribe to narrow slices, so typing in the editor does not re-render the results grid.

### Rendering large results

`components/DataGrid.tsx` uses TanStack Virtual to render only the visible rows. Sorting never copies the data: `lib/gridSort.ts` sorts an array of row indexes (`Uint32Array`) and the grid reads rows through it. The engine caps results at a configurable row limit so that an accidental `SELECT *` on a huge table cannot exhaust memory.

### Persistence

The database is saved in the standard SQLite file format to the user-data folder. Writes are atomic: `main/storage.ts` writes to a temporary file and renames it over the real one, and queues writes so they cannot interleave. If the file is ever unreadable on launch, the app starts with an empty workspace and says so, rather than failing to open.

### Styling

Colours are CSS custom properties defined once per theme in `styles.css` and exposed to Tailwind, so components use names like `bg-surface` and `text-muted` and never branch on the theme. CodeMirror and the charts read the same variables, which is why a theme switch is instant and needs no re-render of either.

### The website

The renderer never assumes it is inside Electron, so the website is the same code built with a different Vite config (`vite.web.config.mts`). Three things differ:

- **Storage.** The platform layer saves the SQLite file to IndexedDB instead of asking the main process to write it to disk.
- **Shortcuts.** A page cannot intercept `Ctrl+T` or `Ctrl+W`, and `Ctrl+W` would close the site. Each action can declare a `webKeys` alternative, and the registry in `actions.ts` picks the right one for the host, so the palette, the shortcuts dialog and the key handler all agree.
- **Small screens.** Below 768px the sidebar becomes a slide-over drawer, toolbars collapse to icons, and row actions that normally appear on hover are always visible on touch devices.

The security policy is defined once, in `src/shared/csp.ts`. The desktop app attaches it to `app://` responses and `vercel.json` sends it as an HTTP header; a unit test fails if the two drift apart. The website tests run against `scripts/serve-web.mjs`, a small server that reads its headers from `vercel.json`, so a policy mistake fails a test rather than surfacing after a deploy. That is how an inlined font that the policy would have blocked was caught.

## Security checklist

| Measure                                             | Where               |
| --------------------------------------------------- | ------------------- |
| `sandbox`, `contextIsolation`, no `nodeIntegration` | `main/index.ts`     |
| Minimal preload API, no raw `ipcRenderer` exposed   | `preload/index.ts`  |
| Sender check and schema validation on every handler | `main/ipc.ts`       |
| Content-Security-Policy on every response           | `main/protocol.ts`  |
| Path-traversal guard for app assets                 | `main/assetPath.ts` |
| Navigation, popups and webviews blocked             | `main/index.ts`     |
| All permission requests denied                      | `main/index.ts`     |
| External links restricted to `https:`               | `shared/ipc.ts`     |

The end-to-end suite asserts the first two from inside the running app.

## Testing strategy

| Layer                       | Tool                        | What it proves                                                |
| --------------------------- | --------------------------- | ------------------------------------------------------------- |
| Pure functions in `lib`     | Vitest                      | Edge cases in parsing, inference, sorting, formatting         |
| Engine                      | Vitest with real SQLite     | Queries, imports, rollback on failure, persistence round-trip |
| IPC schemas and asset paths | Vitest                      | Hostile input is rejected                                     |
| Components                  | Testing Library             | The command palette behaves correctly with keyboard and mouse |
| Whole app                   | Playwright driving Electron | The real build works end to end and survives a restart        |
| Website                     | Playwright, desktop + phone | The site works behind production headers and on small screens |

## What I would do next

- Move to a native SQLite binding in a utility process for files larger than memory, keeping the same engine interface.
- Stream query results in chunks so the first rows appear before a long query finishes.
- Add code signing and auto-update to the release workflow.
- Column-level virtualisation for very wide tables.
