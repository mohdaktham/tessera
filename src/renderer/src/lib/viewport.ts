import { useSyncExternalStore } from 'react';

/** Below this width the sidebar becomes a slide-over drawer instead of a fixed column. */
const COMPACT_QUERY = '(max-width: 767px)';

const media = (): MediaQueryList | null => window.matchMedia?.(COMPACT_QUERY) ?? null;

export const isCompact = (): boolean => media()?.matches ?? false;

function subscribe(onChange: () => void): () => void {
  const query = media();
  query?.addEventListener('change', onChange);
  return () => query?.removeEventListener('change', onChange);
}

/** True on phone-sized viewports; re-renders when the window crosses the breakpoint. */
export function useCompact(): boolean {
  return useSyncExternalStore(subscribe, isCompact, () => false);
}
