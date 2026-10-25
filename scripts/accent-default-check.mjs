/**
 * Somebody who has never chosen an accent gets blue: the page's accent, the
 * Blue swatch shown as chosen on Preferences, and the logo's triad all in it,
 * in both themes. Moss, the brand's, is still offered and still applies.
 *
 * A browser context of its own, so nothing a person chose is in its storage.
 */
import { BASE, open, record, finish, signIn } from './suite/harness.mjs';

const { browser } = await open();
const context = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }));
const page = await context.newPage();
await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });

const brand = () => page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--color-accent-brand)';
  document.body.append(probe);
  const said = getComputedStyle(probe).color;
  probe.remove();
  return said;
});
const disc = (name) => page.evaluate((one) => getComputedStyle(document.querySelector(`[data-swatch="${one}"]`)).backgroundColor, name);
const mark = () => page.evaluate(() => {
  const node = document.querySelector('[data-orknux-mark] circle');
  return node === null ? null : getComputedStyle(node).fill;
});

const stored = await page.evaluate(() => localStorage.getItem('orknux.accent'));
record(stored === null, `nothing is chosen in this browser (${stored})`);
const first = await brand();
record(first === (await disc('blue')), `the accent is blue before anything is chosen (${first} / ${await disc('blue')})`);
record(first !== (await disc('moss')), `and not moss (${await disc('moss')})`);
record((await page.getByRole('radio', { name: 'Blue' }).getAttribute('aria-checked')) === 'true', 'Preferences shows Blue as the one chosen');
record((await mark()) === first, `the logo is drawn in it (${await mark()})`);

await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
const light = await brand();
record(light !== first && light === (await disc('blue')), `the light theme's blue in the light theme (${light} / ${await disc('blue')})`);
record((await mark()) === light, `and the logo with it (${await mark()})`);
await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

// Moss is still there to choose, and kept over a reload.
const save = page.locator('[class*="_pageSave_"]');
await page.getByRole('radio', { name: 'Moss' }).click();
await save.click();
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });
const moss = await brand();
record(moss === (await disc('moss')) && moss !== first, `Moss chosen gives moss, over a reload too (${moss})`);
record((await mark()) === moss, `and the logo follows (${await mark()})`);

await context.close();
await finish(browser);
