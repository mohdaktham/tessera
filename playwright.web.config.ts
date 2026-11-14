/**
 * Browser tests for the website build. They run against a local server that
 * sends the same headers as Vercel (scripts/serve-web.mjs), at a desktop and
 * a phone viewport.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: './tests/web',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    // Set PW_CHANNEL=chrome to test with an installed Chrome instead of Playwright's Chromium.
    channel: process.env.PW_CHANNEL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/serve-web.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], channel: process.env.PW_CHANNEL } },
    { name: 'phone', use: { ...devices['Pixel 7'], channel: process.env.PW_CHANNEL } },
  ],
});
