/**
 * Typing into the manual's search stays responsive.
 *
 * The whole manual is one column, and the term is marked across all of it - so
 * a keystroke that re-renders every page before the box shows the letter is a
 * box that freezes while somebody types. What is measured is the slowest gap
 * between pressing a key and the box holding it, over a word typed at a person's
 * pace, and the longest the page's main thread was blocked meanwhile.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const WORD = 'connection';
/** The slowest a keystroke may take to land in the box, in milliseconds. */
const SLOWEST_KEY_MS = 150;

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
const box = page.getByLabel('Search the documentation');
await box.waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

/*
 * Timed in the page, from the key going down to the first frame painted after
 * the box changed - which is what the person sees. Timing it from the test
 * would measure the browser automation's own round trips as well.
 */
await page.evaluate(() => {
  window.__gaps = [];
  window.__longest = 0;
  const box = document.querySelector('input[aria-label="Search the documentation"]');
  let pressed = 0;
  box.addEventListener('keydown', (event) => {
    pressed = event.timeStamp;
  });
  box.addEventListener('input', () => {
    const from = pressed;
    requestAnimationFrame(() => requestAnimationFrame(() => window.__gaps.push(performance.now() - from)));
  });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__longest = Math.max(window.__longest, entry.duration);
  }).observe({ type: 'longtask', buffered: false });
});

await box.click();
// A person's pace: a letter every 120 ms, which is quick typing.
await page.keyboard.type(WORD, { delay: 120 });
await page.waitForTimeout(300);
const { gaps, longest } = await page.evaluate(() => ({ gaps: window.__gaps.map(Math.round), longest: Math.round(window.__longest) }));
const slowest = Math.max(...gaps);
record(gaps.length === WORD.length && slowest <= SLOWEST_KEY_MS, `every letter is on screen within ${SLOWEST_KEY_MS} ms (slowest ${slowest} ms: ${gaps.join(', ')})`);
console.log(`longest main-thread block while typing: ${longest} ms`);

// And the search still answers, once typing stops.
await page.waitForTimeout(800);
const marks = await page.locator('article mark').count();
record(marks > 0, `the term is marked in the manual once typing stops (${marks})`);

// Choosing a result far down the manual takes the reader to a marked word, in view - pages off screen are not laid out until then.
const last = page.locator('[class*="hit"]').last();
await last.locator('a').first().click();
await page.waitForTimeout(1200);
const inView = await page.evaluate(() =>
  [...document.querySelectorAll('[data-search-match]')].some((one) => {
    const box = one.getBoundingClientRect();
    return box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight;
  }),
);
record(inView, 'choosing the last result scrolls a marked word into view');

await finish(browser);
