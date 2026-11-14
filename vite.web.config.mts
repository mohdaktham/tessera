/**
 * Builds the renderer on its own as a static website. The same UI runs in a
 * browser with an IndexedDB-backed workspace; this is what Vercel deploys.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type HtmlTagDescriptor, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

const SITE_TITLE = 'Tessera: a SQL workbench in your browser';
const SITE_DESCRIPTION =
  'Import CSV, JSON or SQLite files, query them with SQL, chart the results and pin them to a dashboard. Everything runs in your browser; your data is never uploaded.';

/**
 * Adds what a public website needs and the desktop app does not: search and
 * link-preview metadata, a web app manifest, and the static files in
 * `web/static`. Vercel provides the production domain at build time, which
 * link previews need because they require absolute URLs.
 */
function website(): Plugin {
  const domain = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const origin = domain ? `https://${domain}` : '';
  const staticDir = resolve(root, 'web/static');
  const meta = (attrs: Record<string, string>): HtmlTagDescriptor => ({
    tag: 'meta',
    attrs,
    injectTo: 'head',
  });

  return {
    name: 'tessera-website',
    transformIndexHtml: (html) => ({
      html: html.replace(/<title>.*<\/title>/, `<title>${SITE_TITLE}</title>`),
      tags: [
        meta({ name: 'description', content: SITE_DESCRIPTION }),
        meta({ name: 'theme-color', content: '#161b26' }),
        meta({ property: 'og:type', content: 'website' }),
        meta({ property: 'og:title', content: SITE_TITLE }),
        meta({ property: 'og:description', content: SITE_DESCRIPTION }),
        meta({ property: 'og:image', content: `${origin}/og.png` }),
        ...(origin ? [meta({ property: 'og:url', content: origin })] : []),
        meta({ name: 'twitter:card', content: 'summary_large_image' }),
        { tag: 'link', attrs: { rel: 'manifest', href: './site.webmanifest' }, injectTo: 'head' },
        {
          tag: 'link',
          attrs: { rel: 'apple-touch-icon', href: './apple-touch-icon.png' },
          injectTo: 'head',
        },
      ],
    }),
    generateBundle() {
      for (const fileName of readdirSync(staticDir)) {
        this.emitFile({
          type: 'asset',
          fileName,
          source: readFileSync(resolve(staticDir, fileName)),
        });
      }
    },
  };
}

export default defineConfig({
  root: resolve(root, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@shared': resolve(root, 'src/shared'),
      '@': resolve(root, 'src/renderer/src'),
    },
  },
  plugins: [react(), tailwindcss(), website()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  worker: { format: 'es' },
  build: {
    outDir: resolve(root, 'dist-web'),
    emptyOutDir: true,
    // Small fonts would otherwise be inlined as data: URIs, which the CSP (font-src 'self') blocks.
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5199 },
});
