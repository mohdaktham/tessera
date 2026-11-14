/**
 * Shortcuts are written as 'mod+shift+f' or 'alt+t', where mod is Cmd on
 * macOS and Ctrl elsewhere.
 */

export const isMac = (): boolean =>
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The physical key, so Alt combinations work on macOS where Alt changes the typed character. */
function keyFromCode(code: string): string | null {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  return null;
}

/** Normalises a keyboard event to 'mod+shift+f' or 'alt+t' form, or null when it is not a shortcut. */
export function eventToCombo(event: KeyboardEvent, mac = isMac()): string | null {
  const mod = mac ? event.metaKey : event.ctrlKey;

  if (event.altKey) {
    // Ctrl+Alt on Windows is AltGr, which types characters; leave it alone.
    if (event.ctrlKey || event.metaKey || event.shiftKey) return null;
    const key = keyFromCode(event.code ?? '');
    return key ? `alt+${key}` : null;
  }

  if (!mod) return null;
  const key = event.key.toLowerCase();
  if (['control', 'meta', 'shift', 'alt'].includes(key)) return null;
  // Shift changes the reported character for some keys; map them back.
  const normalised = key === '?' ? '/' : key;
  return `mod+${event.shiftKey ? 'shift+' : ''}${normalised}`;
}

const KEY_LABELS: Record<string, string> = { enter: 'Enter', escape: 'Esc', '/': '/' };

/** Splits a combo into the labels shown on key caps, per platform. */
export function formatKeys(combo: string, mac = isMac()): string[] {
  return combo.split('+').map((part) => {
    if (part === 'mod') return mac ? '⌘' : 'Ctrl';
    if (part === 'shift') return mac ? '⇧' : 'Shift';
    if (part === 'alt') return mac ? '⌥' : 'Alt';
    return KEY_LABELS[part] ?? part.toUpperCase();
  });
}
