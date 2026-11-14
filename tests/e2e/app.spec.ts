/**
 * End-to-end tests. These launch the real, built Electron app and drive it
 * the way a person would: load data, write SQL, chart it, restart.
 */
import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let userData: string;
let app: ElectronApplication;
let page: Page;

async function launch(): Promise<void> {
  app = await electron.launch({
    // Chromium's sandbox is unavailable on most Linux CI runners and containers.
    args: ['.', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, TESSERA_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await expect(page.getByTestId('engine-status')).toHaveText('Ready');
}

async function runSql(sql: string): Promise<void> {
  const editor = page.locator('.cm-content');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(sql);
  await page.keyboard.press('ControlOrMeta+Enter');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  userData = mkdtempSync(join(tmpdir(), 'tessera-e2e-'));
  await launch();
});

test.afterAll(async () => {
  await app.close();
  rmSync(userData, { recursive: true, force: true });
});

test('starts on the welcome screen with a locked-down renderer', async () => {
  await expect(
    page.getByRole('heading', { name: 'Ask questions of your data, in SQL.' }),
  ).toBeVisible();

  // Runs inside the page: Node.js must be unreachable, and only the reviewed bridge exposed.
  const exposure = await page.evaluate(() => {
    const page = globalThis as unknown as { require?: unknown; process?: unknown; tessera: object };
    return {
      hasRequire: typeof page.require !== 'undefined',
      hasProcess: typeof page.process !== 'undefined',
      bridge: Object.keys(page.tessera).sort(),
    };
  });
  expect(exposure.hasRequire).toBe(false);
  expect(exposure.hasProcess).toBe(false);
  expect(exposure.bridge).toEqual(
    [
      'getAppInfo',
      'loadWorkspace',
      'onMenuAction',
      'openExternal',
      'saveFile',
      'saveWorkspace',
      'setTheme',
    ].sort(),
  );
});

test('enforces its content security policy', async () => {
  const outcome = await page.evaluate(async () => {
    const page = globalThis as unknown as {
      document: {
        createElement(tag: string): { textContent: string };
        head: { append(node: unknown): void };
      };
      injected?: boolean;
    };
    const script = page.document.createElement('script');
    script.textContent = 'globalThis.injected = true';
    page.document.head.append(script);
    const remote = await fetch('https://example.com/').then(
      () => 'allowed',
      () => 'blocked',
    );
    return { inlineScriptRan: page.injected === true, remote };
  });
  expect(outcome).toEqual({ inlineScriptRan: false, remote: 'blocked' });
});

test('loads the sample dataset and runs the welcome query', async () => {
  await page.getByRole('button', { name: 'Load sample data' }).first().click();

  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByText('orders', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('order_facts', { exact: true })).toBeVisible();
  await expect(page.getByTestId('result-summary')).toContainText('6 rows');
});

test('runs a query typed into the editor', async () => {
  await runSql(
    "SELECT count(*) AS total FROM orders WHERE status = 'delivered' OR status <> 'delivered'",
  );
  await expect(page.getByTestId('result-summary')).toContainText('1 row');
  await expect(page.getByRole('gridcell', { name: '60,000' })).toBeVisible();
});

test('reports SQL errors without breaking the session', async () => {
  await runSql('SELECT * FROM table_that_does_not_exist');
  await expect(page.getByText('The query failed')).toBeVisible();
  await expect(page.getByText(/no such table/)).toBeVisible();

  await runSql('SELECT 42 AS answer');
  await expect(page.getByRole('gridcell', { name: '42' })).toBeVisible();
});

test('charts a result and pins it to the dashboard', async () => {
  await runSql(
    'SELECT channel, count(*) AS orders FROM orders GROUP BY channel ORDER BY orders DESC',
  );
  await expect(page.getByTestId('result-summary')).toContainText('4 rows');

  await page.getByRole('tab', { name: 'Chart' }).click();
  await page.getByRole('button', { name: 'Pin to dashboard' }).click();
  await expect(page.getByLabel('Tile title')).toHaveValue('Orders by channel');
  await page.getByLabel('Tile title').fill('Channel split');
  await page.getByRole('button', { name: 'Pin chart' }).click();
  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('button', { name: 'Dashboard' })
    .click();

  await expect(page.getByRole('article', { name: 'Monthly revenue' })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Channel split' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Views' })
    .getByRole('button', { name: 'Query' })
    .click();
});

test('imports a CSV file as a typed table', async () => {
  const csv = join(userData, 'City Temperatures.csv');
  writeFileSync(csv, 'City,Temp C,Postal\nToronto,-4.5,M4S\nDubai,31,00000\nAmman,12,11118\n');
  await page.getByTestId('file-input').setInputFiles(csv);

  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByText('city_temperatures', { exact: true })).toBeVisible();
  await expect(page.getByTestId('result-summary')).toContainText('3 rows');
  await expect(page.getByRole('gridcell', { name: '-4.5' })).toBeVisible();
});

test('opens the command palette from the keyboard', async () => {
  await page.keyboard.press('ControlOrMeta+K');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await expect(palette).toBeVisible();
  await palette.getByRole('combobox').fill('prev cust');
  await expect(palette.getByRole('option').first()).toContainText('Preview customers');
  await page.keyboard.press('Escape');
  await expect(palette).toBeHidden();
});

test('keeps the workspace after a restart', async () => {
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved');
  await app.close();
  await launch();

  const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
  await expect(sidebar.getByText('city_temperatures', { exact: true })).toBeVisible();
  await expect(sidebar.getByText('orders', { exact: true })).toBeVisible();
});
