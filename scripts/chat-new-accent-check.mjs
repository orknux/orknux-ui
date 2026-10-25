/**
 * The chat list's "+ New" is filled with the main accent, as each page's own
 * create button is: it was a grey outlined chip that read as a minor control.
 * Measured as its background against the accent the page itself computes.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
const button = page.getByRole('button', { name: /^(\+ New|\+ Nowy|\+ Nowa)$/ }).first();
await button.waitFor({ timeout: 20_000 }).catch(() => undefined);
const seen = await button.evaluate((el) => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--color-accent-brand)';
  document.body.appendChild(probe);
  const accent = getComputedStyle(probe).color;
  probe.remove();
  return { background: getComputedStyle(el).backgroundColor, accent };
}).catch(() => null);
record(seen !== null && seen.background === seen.accent, `"+ New" is filled with the accent (${JSON.stringify(seen)})`);
await finish(browser);
