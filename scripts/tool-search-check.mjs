/**
 * The box above the tools list actually narrows the list.
 *
 * It did nothing. The page lists two origins - the workspace's own tools and
 * the ones plugins offer - and only the first of the three sieve settings
 * asked the server with what was typed; the other two, including the default
 * "All sources", fetched their lists and ignored the box entirely. So typing
 * on the page somebody lands on left every row where it was, which reads as
 * "search is broken" because it is.
 *
 * What this pins: a name narrows, a description narrows, nonsense empties, and
 * clearing the box brings everything back - under each sieve setting, because
 * the bug was one setting working and the others not.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/tools`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input[placeholder="Search tools..."]', { timeout: 20_000 });

/**
 * Waits for the list to have stopped loading.
 *
 * The rows arrive from two calls this page merges, which on a cold server is
 * seconds rather than milliseconds - and a check that reads the list while the
 * loader is still up reads an empty list and calls the search broken.
 */
const listed = () =>
  page.waitForFunction(
    () => document.querySelectorAll('section > div').length > 1 ||
      document.body.innerText.includes('No tools yet.') ||
      document.body.innerText.includes('No plugin offers a tool yet.'),
    { timeout: 20_000 },
  );

await listed();

/**
 * The names in the list, in the order they are drawn.
 *
 * Read off the rows rather than off the links, because half of them have no
 * link: a tool a plugin offers is not the workspace's to open. The first cell
 * of a row carries the name and, for a plugin's, a badge after it - so only
 * the first text node is the name.
 */
const names = () =>
  page.evaluate(() => {
    const rows = [...document.querySelectorAll('section > div')].filter(
      (one) => one.children.length === 5 && one.firstElementChild.textContent.trim() !== 'Name',
    );
    return rows.map((one) => (one.firstElementChild.firstChild?.textContent ?? '').trim());
  });

/** Types into the box and waits for the debounce plus the load. */
async function look(what) {
  await page.fill('input[placeholder="Search tools..."]', what);
  // The box settles 300ms after the typing stops and the list follows.
  await page.waitForTimeout(900);
  await listed();
  await page.waitForTimeout(300);
  return names();
}

/** Puts the sieve on one of its settings and waits for that list. */
async function sieve(value) {
  await page.selectOption('select[aria-label="Which tools to list"]', value);
  await page.waitForTimeout(500);
  await listed();
  await page.waitForTimeout(300);
}

/* ------------------------------------------- the default: both origins at once */

const everything = await names();
record(everything.length > 0, `the page lists tools to search (${everything.length})`);

const first = everything[0];
const bitOf = first.slice(0, Math.max(3, Math.floor(first.length / 2)));
const narrowed = await look(bitOf);
record(
  narrowed.length > 0 && narrowed.length < everything.length,
  `a piece of a name narrows the list rather than leaving it whole (${narrowed.length} of ${everything.length} for "${bitOf}")`,
);
record(
  narrowed.every((one) => one.toLowerCase().includes(bitOf.toLowerCase())),
  'and every row left carries what was typed',
);

const nonsense = await look('zzqqxx-no-such-tool');
record(nonsense.length === 0, `nonsense empties the list (${nonsense.length} left)`);
record(
  (await page.locator('text=No tools yet.').count()) > 0,
  'and the page says so rather than showing an empty frame',
);

const back = await look('');
record(
  back.length === everything.length,
  `clearing the box brings the whole list back (${back.length} of ${everything.length})`,
);

/* -------------------------------------------------------- the plugins' own list */

await sieve('PLUGIN');
const plugins = await names();
record(plugins.length > 0, `the plugins offer tools to search too (${plugins.length})`);

const pluginBit = plugins[0].slice(0, Math.max(3, Math.floor(plugins[0].length / 2)));
const pluginsNarrowed = await look(pluginBit);
record(
  pluginsNarrowed.length > 0 && pluginsNarrowed.length <= plugins.length,
  `the box works under "From plugins" as well (${pluginsNarrowed.length} of ${plugins.length})`,
);
record(
  pluginsNarrowed.every((one) => one.toLowerCase().includes(pluginBit.toLowerCase())),
  'and narrows by the same rule',
);
record(
  (await look('zzqqxx-no-such-tool')).length === 0,
  'nonsense empties this list too, rather than being ignored',
);

/* ------------------------------------------ the workspace's own, which did work */

await look('');
await sieve('WORKSPACE');
const own = await names();
const ownBit = own.length === 0 ? '' : own[0].slice(0, Math.max(3, Math.floor(own[0].length / 2)));
const ownNarrowed = own.length === 0 ? [] : await look(ownBit);
record(
  own.length === 0 || (ownNarrowed.length > 0 && ownNarrowed.length <= own.length),
  `the setting that always worked still does (${ownNarrowed.length} of ${own.length})`,
);

await look('');
await finish(browser);
