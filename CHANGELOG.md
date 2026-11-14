# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-11-14

### Added

- Website build configured for Vercel, with the desktop app's security policy sent as response headers
- Phone and tablet layout: the sidebar becomes a drawer and toolbars collapse to icons
- Touch support for the sidebar, tabs, dashboard tiles and pane dividers
- Browser-safe shortcuts on the website (`Alt+T`, `Alt+W`, `Alt+1`, `Alt+2`)
- Link-preview metadata, a web app manifest and icons
- Browser tests at desktop and phone sizes, run in CI

### Fixed

- A small font subset was inlined as a `data:` URI and blocked by the Content-Security-Policy

### Removed

- The GitHub Pages workflow, replaced by the Vercel deployment

## [1.0.0] - 2026-11-11

### Added

- SQL editor with schema-aware autocomplete, multiple tabs and formatting
- SQLite engine running as WebAssembly in a Web Worker, with a stop button
- Import for CSV, TSV, JSON, newline-delimited JSON and SQLite databases, with type inference
- Virtualised results grid with sorting, column resizing, keyboard navigation and copy
- Chart builder with bar, line, area, scatter, pie and headline-number charts
- Dashboard of pinned charts that refresh when data changes
- Query plan viewer and per-column data profile
- Saved queries, run history and CSV, JSON and Markdown export
- Command palette, keyboard shortcuts, light and dark themes
- Automatic, atomic workspace saving and restore on launch
- Installers for Windows, macOS and Linux, plus a browser build for the live demo
