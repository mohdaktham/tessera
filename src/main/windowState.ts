import { app, screen, type BrowserWindow, type Rectangle } from 'electron';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  bounds: { x: 0, y: 0, width: 1360, height: 860 },
  maximized: false,
};

const statePath = (): string => join(app.getPath('userData'), 'window-state.json');

function isVisibleOnSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return overlapX > 120 && overlapY > 120;
  });
}

/** Restores the last window position, ignoring it if that monitor is gone. */
export function readWindowState(): { bounds: Partial<Rectangle>; maximized: boolean } {
  try {
    const saved = JSON.parse(readFileSync(statePath(), 'utf8')) as WindowState;
    const { x, y, width, height } = saved.bounds;
    if ([x, y, width, height].every(Number.isFinite) && isVisibleOnSomeDisplay(saved.bounds)) {
      return { bounds: saved.bounds, maximized: Boolean(saved.maximized) };
    }
  } catch {
    // First launch or unreadable file: fall through to defaults.
  }
  const { width, height } = DEFAULT_STATE.bounds;
  return { bounds: { width, height }, maximized: false };
}

export function trackWindowState(window: BrowserWindow): void {
  window.on('close', () => {
    const state: WindowState = {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    };
    try {
      writeFileSync(statePath(), JSON.stringify(state));
    } catch {
      // Losing the window position is not worth interrupting shutdown.
    }
  });
}
