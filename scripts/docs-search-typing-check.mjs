/**
 * Searching the manual stays responsive, on a slow machine as well.
 *
 * The whole manual is one column, and the term is marked across all of it. Two
 * freezes have been here. The first held every letter back while the manual was
 * drawn again; the second was the same drawing moved to the pause after typing,
 * which looked fine on a fast machine and froze a slower one for seconds - the
 * letters arrived, and then the page stopped. So what is measured is the gap
 * from each key to the box holding it, and every long task the page runs over
 * the whole of a search a person makes: typing, pausing, typing on, deleting,
 * pausing again, choosing a result. With the CPU slowed down, because that is
 * the machine the freeze was reported from.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

/** How much slower than this machine the page is made to run. */
const THROTTLE = 4;
/** The slowest a keystroke may take to land in the box, in milliseconds, at that speed. */
const SLOWEST_KEY_MS = 250;
/** The longest the page may be unable to answer at all, at that speed. */
const LONGEST_TASK_MS = 200;

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/docs`, { waitUntil: 'domcontentloaded' });
const box = page.getByLabel('Search the documentation');
await box.waitFor({ timeout: 30_000 });
// The manual's first drawing is the page arriving, not the search; it is let finish before anything is timed.
await page.waitForTimeout(2000);

const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });

/*
 * Timed in the page, from the key going down to the first frame painted after
 * the box changed - which is what the person sees. Timing it from the test
 * would measure the browser automation's own round trips as well. A long task
 * is put down to the step it started in, so a failure says which one froze.
 */
await page.evaluate(() => {
  window.__gaps = [];
  window.__tasks = [];
  window.__steps = [['before', 0]];
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
    for (const entry of list.getEntries()) {
      const step = [...window.__steps].reverse().find(([, at]) => at <= entry.startTime)[0];
      window.__tasks.push({ step, ms: Math.round(entry.duration) });
    }
  }).observe({ type: 'longtask', buffered: false });
});
const step = (name) => page.evaluate((name) => window.__steps.push([name, performance.now()]), name);

await box.click();
// A person's pace: a letter every 120 ms, which is quick typing.
await step('typing "conn"');
await page.keyboard.type('conn', { delay: 120 });
await step('the pause after "conn"');
await page.waitForTimeout(1500);
await step('typing on, "ection"');
await page.keyboard.type('ection', { delay: 120 });
await step('the pause after "connection"');
await page.waitForTimeout(1500);

const gaps = await page.evaluate(() => window.__gaps.map(Math.round));
const slowest = Math.max(...gaps);
record(gaps.length === 'connection'.length && slowest <= SLOWEST_KEY_MS, `at ${THROTTLE}x slower, every letter is on screen within ${SLOWEST_KEY_MS} ms (slowest ${slowest} ms: ${gaps.join(', ')})`);

// The search answers once typing stops: the term is marked in the manual.
const marks = await page.evaluate(() => CSS.highlights.get('docs-search')?.size ?? 0);
record(marks > 0, `the term is marked in the manual once typing stops (${marks})`);

await step('deleting three letters');
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(120);
}
await step('the pause after "connec"');
await page.waitForTimeout(1500);

// Choosing a result far down the manual takes the reader to a marked word, in view - pages off screen are not laid out until then.
await step('choosing the last result');
await page.locator('[class*="hit"]').last().locator('a').first().click();
// A smooth scroll across most of the manual, at a quarter of the speed.
await page.waitForTimeout(3500);
const inView = await page.evaluate(() =>
  [...(CSS.highlights.get('docs-search-current') ?? [])].some((range) => {
    const box = range.getBoundingClientRect();
    return box.height > 0 && box.top >= 0 && box.bottom <= window.innerHeight;
  }),
);
record(inView, 'choosing the last result scrolls a marked word into view');

const tasks = await page.evaluate(() => window.__tasks);
const worst = tasks.reduce((was, task) => (task.ms > was.ms ? task : was), { step: 'none', ms: 0 });
record(
  worst.ms <= LONGEST_TASK_MS,
  `at ${THROTTLE}x slower, nothing holds the page for more than ${LONGEST_TASK_MS} ms over the whole search (longest ${worst.ms} ms, ${worst.step})`,
);
for (const name of [...new Set(tasks.map((task) => task.step))]) {
  const here = tasks.filter((task) => task.step === name).map((task) => task.ms);
  console.log(`  ${name}: ${here.length} long tasks, longest ${Math.max(...here)} ms`);
}

await finish(browser);
