/**
 * Every page keeps the attribution strip at the foot of the window.
 *
 * Holding the frame to the window was asked for page by page, and the list
 * pages - Agents, Tools, Sessions and twenty more - never asked: past the
 * window's height the whole document scrolled, and the strip and the top bar
 * rode out of view on those pages and on no others. Only Ask AI and Orknux MCP
 * are meant to float.
 *
 * A short window makes every list longer than it, whatever the installation
 * holds, so what is asserted is the same everywhere: the document does not
 * scroll, the strip's bottom is the window's, and the page's content scrolls in
 * its own box instead.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 420 } });

const PAGES = ['agents', 'tools', 'sessions', 'functions', 'audit'];

for (const name of PAGES) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${name}`);
  await page.locator('main h1').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const drawn = await page.evaluate(() => {
    const strip = document.querySelector('[data-shell-footer]');
    const main = document.querySelector('main');
    const scroller = document.scrollingElement;
    return {
      bottom: strip === null ? null : Math.round(strip.getBoundingClientRect().bottom),
      window: window.innerHeight,
      document: scroller.scrollHeight - scroller.clientHeight,
      content: main.scrollHeight - main.clientHeight,
    };
  });
  console.log(`${name}: ${JSON.stringify(drawn)}`);
  record(drawn.document <= 1, `${name}: the window does not scroll (${drawn.document}px past it)`);
  record(drawn.bottom === drawn.window, `${name}: the attribution strip ends at the window's foot (${drawn.bottom} of ${drawn.window})`);
  record(drawn.content > 0, `${name}: the page is longer than the window and scrolls in its own box (${drawn.content}px)`);
}

await finish(browser);
