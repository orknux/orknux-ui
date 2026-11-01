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
/*
 * The longest choosing a result may take, at that speed. Arriving at a page is
 * the browser laying out and painting what it had skipped until then: a trace of
 * the longest task holds no script, only about 5,000 objects of one page of the
 * manual. That took 134 ms here and 205 to 423 ms on CI runners, which are slower
 * before they are slowed, so it met the limit above in about one run in three;
 * capped to three quarters of a core here it reached 693 ms. It is the runner's
 * number, not the page's. The freeze this guards against - the whole manual laid
 * out, measured here by forcing every page visible - is over 4,000 ms a task at
 * this speed and fails the typing limit before it ever reaches this one, so a
 * second is a quarter of the regression and twice the worst healthy run.
 */
const LONGEST_ARRIVAL_MS = 1000;
const CHOOSING = 'choosing the last result';

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
await step(CHOOSING);
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
const longest = (some) => some.reduce((was, task) => (task.ms > was.ms ? task : was), { step: 'none', ms: 0 });
const worst = longest(tasks.filter((task) => task.step !== CHOOSING));
record(
  worst.ms <= LONGEST_TASK_MS,
  `at ${THROTTLE}x slower, nothing holds the page for more than ${LONGEST_TASK_MS} ms while searching (longest ${worst.ms} ms, ${worst.step})`,
);
const arrival = longest(tasks.filter((task) => task.step === CHOOSING));
record(arrival.ms <= LONGEST_ARRIVAL_MS, `at ${THROTTLE}x slower, arriving at a chosen result holds the page for no more than ${LONGEST_ARRIVAL_MS} ms (longest ${arrival.ms} ms)`);
for (const name of [...new Set(tasks.map((task) => task.step))]) {
  const here = tasks.filter((task) => task.step === name).map((task) => task.ms);
  console.log(`  ${name}: ${here.length} long tasks, longest ${Math.max(...here)} ms`);
}

await finish(browser);
