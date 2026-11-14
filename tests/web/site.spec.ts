/**
 * Tests for Tessera running as a website: the production response headers,
 * the core flow in a real browser, storage across reloads, browser-safe
 * shortcuts and the phone layout.
 */
import { expect, test, type Page } from '@playwright/test';

/** Fails the test if the page logs an error, which is how a CSP violation shows up. */
function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  return errors;
}

async function openSite(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('engine-status')).toHaveText('Ready');
}

async function loadSample(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Load sample data' }).first().click();
  await expect(page.getByTestId('result-summary')).toContainText('6 rows');
}

test('sends the production security and caching headers', async ({ page, request }) => {
  const response = await request.get('/');
  const headers = response.headers();
  expect(headers['content-security-policy']).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');

  await openSite(page);
  const script = await page.locator('script[type="module"]').first().getAttribute('src');
  const asset = await request.get(new URL(script ?? '', page.url()).pathname);
  expect(asset.headers()['cache-control']).toContain('immutable');
});

test('has the metadata a shared link needs', async ({ page }) => {
  await openSite(page);
  await expect(page).toHaveTitle(/Tessera/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    /never uploaded/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /og\.png$/);
  for (const path of ['/og.png', '/site.webmanifest', '/apple-touch-icon.png', '/robots.txt']) {
    expect((await page.request.get(path)).status(), path).toBe(200);
  }
});

test('loads data and runs SQL under the security policy, with no errors', async ({ page }) => {
  const errors = trackErrors(page);
  await openSite(page);
  await loadSample(page);

  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('SELECT count(*) AS total FROM orders');
  await page.getByRole('button', { name: 'Run', exact: false }).first().click();
  await expect(page.getByRole('gridcell', { name: '60,000' })).toBeVisible();

  await page.getByRole('navigation', { name: 'Views' }).getByRole('button').nth(1).click();
  await expect(page.getByRole('article', { name: 'Monthly revenue' })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Monthly revenue' }).locator('svg.recharts-surface'),
  ).toBeVisible();

  expect(errors).toEqual([]);
});

test('keeps the workspace in the browser across a reload', async ({ page }) => {
  await openSite(page);
  await loadSample(page);
  await expect(page.getByTestId('save-state')).toHaveText('All changes saved');

  await page.reload();
  await expect(page.getByTestId('engine-status')).toHaveText('Ready');
  await page.locator('.cm-content').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText('SELECT count(*) AS n FROM customers');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(page.getByRole('gridcell', { name: '4,000' })).toBeVisible();
});

test('uses shortcuts the browser does not reserve', async ({ page }) => {
  await openSite(page);
  await page.getByRole('button', { name: 'start with an empty query' }).click();
  const tabs = page.getByRole('tablist', { name: 'Query tabs' }).getByRole('tab');
  await expect(tabs).toHaveCount(1);

  // Ctrl+T and Ctrl+W belong to the browser, so the website uses Alt instead.
  await page.keyboard.press('Alt+T');
  await expect(tabs).toHaveCount(2);
  await page.keyboard.press('Alt+W');
  await expect(tabs).toHaveCount(1);

  await page.keyboard.press('ControlOrMeta+K');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
});

test.describe('on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'Phone layout only');

  test('fits the screen and moves the sidebar into a drawer', async ({ page }) => {
    await openSite(page);
    const sidebar = page.getByRole('complementary', { name: 'Sidebar' });
    await expect(sidebar).toBeHidden();
    await loadSample(page);

    const overflow = await page.evaluate(() => {
      const root = (
        globalThis as unknown as {
          document: { documentElement: { scrollWidth: number; clientWidth: number } };
        }
      ).document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(overflow).toBe(0);

    await page.getByRole('button', { name: 'Toggle sidebar' }).tap();
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('order_facts', { exact: true })).toBeVisible();

    // Touch screens have no hover, so the row actions must already be visible.
    await sidebar.getByRole('button', { name: 'Preview customers' }).tap();
    await expect(sidebar).toBeHidden();
    await expect(page.getByTestId('result-summary')).toContainText('1,000 rows');
  });
});
