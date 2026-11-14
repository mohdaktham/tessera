import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = import.meta.dirname;
const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  version: string;
};

const alias = {
  '@shared': resolve(root, 'src/shared'),
  '@': resolve(root, 'src/renderer/src'),
};

export default defineConfig({
  main: {
    resolve: { alias },
    build: {
      // Bundle the few runtime deps the main process uses so the packaged app
      // ships without a node_modules folder.
      externalizeDeps: false,
    },
  },
  preload: {
    resolve: { alias },
    build: {
      externalizeDeps: false,
      rollupOptions: {
        // Sandboxed preload scripts must be CommonJS.
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()],
    define: { __APP_VERSION__: JSON.stringify(version) },
    worker: { format: 'es' },
    build: {
      target: 'chrome140',
      // Small fonts would otherwise be inlined as data: URIs, which the CSP (font-src 'self') blocks.
      assetsInlineLimit: 0,
      minify: true,
      chunkSizeWarningLimit: 900,
    },
  },
});
