import { join, normalize, sep } from 'node:path';

/**
 * Maps a request URL to a file inside `root`, or returns null when the path
 * would escape it. This is the guard that stops `app://tessera/../../secrets`
 * from reading arbitrary files.
 */
export function resolveAssetPath(root: string, requestUrl: string): string | null {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(requestUrl).pathname);
  } catch {
    return null;
  }
  if (pathname.includes('\0')) return null;
  const relative = normalize(pathname).replace(/^([\\/])+/, '');
  const target = join(root, relative === '' || relative === '.' ? 'index.html' : relative);
  const safeRoot = root.endsWith(sep) ? root : root + sep;
  return target.startsWith(safeRoot) ? target : null;
}
