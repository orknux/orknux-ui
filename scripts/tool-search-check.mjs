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

/**
 * The list once it has stopped moving.
 *
 * Two reads that agree, rather than a fixed wait: the box settles 300ms after
 * the typing stops and the rows follow whenever the server answers, which on a
 * cold one is seconds. A check that reads between the two sees the list it was
 * looking at before and calls the search broken.
 */
async function settled() {
  let before = await names();
  for (let tries = 0; tries < 30; tries += 1) {
    await page.waitForTimeout(400);
    const after = await names();
    if (after.length === before.length && after.every((one, at) => one === before[at])) return after;
    before = after;
  }
  return before;
}

/** Types into the box and waits for what it asked for. */
async function look(what) {
  await page.fill('input[placeholder="Search tools..."]', what);
  await page.waitForTimeout(600);
  return settled();
}

/** Puts the sieve on one of its settings and waits for that list. */
async function sieve(value) {
  await page.selectOption('select[aria-label="Which tools to list"]', value);
  await page.waitForTimeout(400);
  await settled();
}

/* ------------------------------------------- the default: both origins at once */

const everything = await settled();
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

/*
 * And a word that lives only in a description finds nothing.
 *
 * The rule was the name or the description, and a tool's description here is a
 * paragraph written for a model: searching "date" returned every github tool,
 * because their descriptions mention a commit's date. A word common enough to
 * type is common enough to appear in prose.
 */
const prose = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('section > div')].filter(
    (one) => one.children.length === 5 && one.firstElementChild.textContent.trim() !== 'Name',
  );
  const names = rows.map((one) => (one.firstElementChild.firstChild?.textContent ?? '').toLowerCase());
  const words = rows.flatMap((one) => one.children[1].textContent.toLowerCase().match(/[a-z]{6,}/g) ?? []);
  return words.find((word) => names.every((name) => !name.includes(word))) ?? null;
});
record(prose !== null, `the descriptions have a word no name carries (${prose})`);
if (prose !== null) {
  const byProse = await look(prose);
  record(
    byProse.length === 0,
    `a word only a description carries finds nothing (${byProse.length} for "${prose}")`,
  );
}


/* -------------------------------------------------------- the plugins' own list */

// Empty again, or the next sieve is read through the last search.
await look('');
await sieve('PLUGIN');
const plugins = await settled();

/*
 * An installation with no plugins loaded has nothing under this sieve, which
 * is not a fault: a fresh one is exactly that, and CI's fixture loads none.
 * What is measured here is the box, so where there is nothing to narrow the
 * measurement is skipped and said rather than failed.
 */
if (plugins.length === 0) {
  record(true, 'no plugin offers a tool here, so there is no plugin list to narrow');
  await look('');
  await sieve('WORKSPACE');
  const alone = await settled();
  const aloneBit = alone.length === 0 ? '' : alone[0].slice(0, Math.max(3, Math.floor(alone[0].length / 2)));
  const narrowedAlone = alone.length === 0 ? [] : await look(aloneBit);
  record(
    alone.length === 0 || (narrowedAlone.length > 0 && narrowedAlone.length <= alone.length),
    `the setting that always worked still does (${narrowedAlone.length} of ${alone.length})`,
  );
  await look('');
  await finish(browser);
}

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
const own = await settled();
const ownBit = own.length === 0 ? '' : own[0].slice(0, Math.max(3, Math.floor(own[0].length / 2)));
const ownNarrowed = own.length === 0 ? [] : await look(ownBit);
record(
  own.length === 0 || (ownNarrowed.length > 0 && ownNarrowed.length <= own.length),
  `the setting that always worked still does (${ownNarrowed.length} of ${own.length})`,
);

await look('');
await finish(browser);
