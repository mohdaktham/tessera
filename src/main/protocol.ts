/**
 * Serves the built renderer from a private `app://` scheme instead of
 * `file://`. A real origin gives the page working fetch, module workers and
 * WebAssembly streaming, and lets us attach a strict Content-Security-Policy
 * to every response.
 */
import { protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { CONTENT_SECURITY_POLICY } from '../shared/csp';
import { resolveAssetPath } from './assetPath';

export const APP_SCHEME = 'app';
export const APP_ORIGIN = `${APP_SCHEME}://tessera`;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.map': 'application/json',
};

/** Must run before `app.whenReady()`. */
export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, codeCache: true },
    },
  ]);
}

export function handleAppProtocol(rendererRoot: string): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const filePath = resolveAssetPath(rendererRoot, request.url);
    if (!filePath) return new Response('Forbidden', { status: 403 });
    try {
      const body = await readFile(filePath);
      return new Response(new Uint8Array(body), {
        headers: {
          'Content-Type': MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream',
          'Content-Security-Policy': CONTENT_SECURITY_POLICY,
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
