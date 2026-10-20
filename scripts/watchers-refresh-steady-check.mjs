/**
 * Watchers does not jump on auto-refresh.
 *
 * The empty line was hidden while each refresh was loading, so with auto-refresh
 * on the box under the table collapsed and came back every second. Measured over
 * several refreshes: the table's height does not change.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 900 } });
await page.goto(`${BASE}/workspace/${WORKSPACE}/watchers`, { waitUntil: 'domcontentloaded' });
await page.locator('h1').filter({ hasText: 'Watchers' }).first().waitFor({ timeout: 20_000 });
await page.waitForTimeout(1500);

// Sample the card's height every animation frame for a few seconds, while the page refreshes itself.
await page.locator('button', { hasText: 'Refresh' }).first().click();
const heights = await page.evaluate(async () => {
  const card = document.querySelector('section');
  const seen = new Set();
  const until = performance.now() + 3000;
  while (performance.now() < until) {
    seen.add(Math.round(card.getBoundingClientRect().height));
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (Math.random() < 0.05) document.querySelector('button[class*="refresh"]')?.click();
  }
  return [...seen];
});
// A pixel or two of rounding in the header row is not a jump; the line vanishing was sixty.
record(Math.max(...heights) - Math.min(...heights) <= 3, `the table keeps its height through refreshes (${heights.join(', ')})`);

await finish(browser);
