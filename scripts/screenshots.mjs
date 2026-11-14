/**
 * Captures the README screenshots from the built app.
 *
 *   npm run build && node scripts/screenshots.mjs
 *
 * On Linux without a display, prefix the command with `xvfb-run -a`.
 */
import { _electron as electron } from '@playwright/test';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const outDir = resolve(process.argv[2] ?? 'docs/screenshots');
mkdirSync(outDir, { recursive: true });
const userData = mkdtempSync(join(tmpdir(), 'tessera-shots-'));

const app = await electron.launch({
  args: [
    '.',
    ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
    '--force-device-scale-factor=2',
  ],
  env: { ...process.env, TESSERA_USER_DATA: userData },
});
const page = await app.firstWindow();
await app.evaluate(({ BrowserWindow }) =>
  BrowserWindow.getAllWindows()[0].setContentSize(1440, 900),
);
await page.getByTestId('engine-status').getByText('Ready').waitFor();

const shot = async (name) => {
  for (const dismiss of await page.getByRole('button', { name: 'Dismiss' }).all())
    await dismiss.click();
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(outDir, `${name}.png`) });
  process.stdout.write(`saved ${name}.png\n`);
};
const setTheme = async (theme) => {
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox').fill(`Use ${theme} theme`);
  await page.keyboard.press('Enter');
};
await setTheme('dark');
await shot('welcome-dark');

await page.getByRole('button', { name: 'Load sample data' }).first().click();
await page.getByTestId('result-summary').waitFor();
await page
  .getByRole('complementary', { name: 'Sidebar' })
  .getByText('orders', { exact: true })
  .click();
await shot('query-dark');

await page.getByRole('tab', { name: 'Saved' }).click();
await page.getByRole('button', { name: 'Top customers and their share' }).click();
await page.keyboard.press('ControlOrMeta+Enter');
await page.getByTestId('result-summary').waitFor();
await shot('window-functions-dark');

await page.getByRole('button', { name: 'Explain' }).click();
await shot('plan-dark');

await page.getByRole('button', { name: 'Month-over-month growth' }).click();
await page.keyboard.press('ControlOrMeta+Enter');
await page.getByTestId('result-summary').waitFor();
await page.getByRole('tab', { name: 'Chart' }).click();
await shot('chart-dark');

await page.getByRole('tab', { name: 'Tables' }).click();
await page
  .getByRole('complementary', { name: 'Sidebar' })
  .getByText('orders', { exact: true })
  .hover();
await page.getByRole('button', { name: 'Preview orders' }).click();
await page.getByTestId('result-summary').waitFor();
await page.getByRole('tab', { name: 'Profile' }).click();
await shot('profile-dark');

await page.keyboard.press('ControlOrMeta+2');
await page
  .getByRole('article', { name: 'Monthly revenue' })
  .locator('svg.recharts-surface')
  .waitFor();
await page.waitForTimeout(600);
await shot('dashboard-dark');

await page.keyboard.press('ControlOrMeta+K');
await page.getByRole('combobox').fill('rev');
await shot('palette-dark');
await page.keyboard.press('Escape');

await setTheme('light');
await page.waitForTimeout(400);
await shot('dashboard-light');
await page.keyboard.press('ControlOrMeta+1');
await page.getByRole('tab', { name: 'Results' }).click();
await shot('query-light');

await app.close();
rmSync(userData, { recursive: true, force: true });
