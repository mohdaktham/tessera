/**
 * Serves the built website (dist-web) locally with the same response headers
 * Vercel will send, read straight from vercel.json. The browser tests run
 * against this, so a Content-Security-Policy mistake fails a test instead of
 * surfacing after a deploy.
 *
 *   npm run build:web && node scripts/serve-web.mjs [port]
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '../dist-web');
const port = Number(process.argv[2] ?? 4173);
const { headers: headerRules } = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../vercel.json'), 'utf8'),
);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

// vercel.json sources here are simple patterns such as "/(.*)", which are also valid regular expressions.
const rules = headerRules.map((rule) => ({
  pattern: new RegExp(`^${rule.source}$`),
  headers: rule.headers,
}));

createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const filePath = join(root, normalize(pathname === '/' ? 'index.html' : pathname));
  if (!filePath.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  try {
    const body = await readFile(filePath);
    response.setHeader('Content-Type', MIME[extname(filePath)] ?? 'application/octet-stream');
    for (const rule of rules) {
      if (rule.pattern.test(pathname)) {
        for (const { key, value } of rule.headers) response.setHeader(key, value);
      }
    }
    response.writeHead(200).end(body);
  } catch {
    response.writeHead(404).end('Not found');
  }
}).listen(port, () => process.stdout.write(`Serving dist-web on http://localhost:${port}\n`));
