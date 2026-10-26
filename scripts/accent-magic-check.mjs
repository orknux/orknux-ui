/**
 * The Magic accent: blue running into violet, more blue than violet.
 *
 * A gradient cannot be a colour, so the accent colour is a single blue-violet
 * and the gradient is what filled surfaces are painted with. Chosen on
 * Preferences in a browser of its own: the swatch is a gradient, the primary
 * button on the page is painted with one, and the accent colour leans blue.
 */
import { BASE, open, record, finish, signIn } from './suite/harness.mjs';

const { browser } = await open();
const context = await signIn(await browser.newContext({ viewport: { width: 1440, height: 900 } }));
const page = await context.newPage();
await page.goto(`${BASE}/preferences`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });

const offered = await page.getByRole('radio', { name: 'Magic' }).count();
record(offered === 1, `Preferences offers Magic (${offered})`);
const swatch = await page.evaluate(() => getComputedStyle(document.querySelector('[data-swatch="magic"]')).backgroundImage);
record(swatch.includes('linear-gradient'), `its swatch is a gradient (${swatch.slice(0, 60)})`);

await page.getByRole('radio', { name: 'Magic' }).click();
await page.locator('[class*="_pageSave_"]').click();
await page.waitForTimeout(300);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-testid="accent"]', { timeout: 20_000 });

const read = await page.evaluate(() => {
  const probe = document.createElement('button');
  probe.style.background = 'var(--accent-brand-fill, var(--color-accent-brand))';
  probe.style.color = 'var(--color-accent-brand)';
  document.body.append(probe);
  const css = getComputedStyle(probe);
  const said = { fill: css.backgroundImage, colour: css.color };
  probe.remove();
  return { ...said, attribute: document.documentElement.getAttribute('data-accent') };
});
record(read.attribute === 'magic', `Magic is kept over a reload (${read.attribute})`);
record(read.fill.includes('linear-gradient'), `a filled surface is painted with the gradient (${read.fill.slice(0, 60)})`);
const [r, , b] = (read.colour.match(/\d+/g) ?? []).map(Number);
record(b > r, `the accent colour leans blue (${read.colour})`);

// Put back, so the fixture's browser keeps the default.
await page.evaluate(() => localStorage.removeItem('orknux.accent'));
await context.close();
await finish(browser);
