/**
 * What the catalog knows beyond a version number: the tags a plugin carries,
 * and every release it remembers.
 *
 * The marketplace answers a listing with its whole history - each version, when
 * it appeared, how many files it shipped, and whether the bytes are still held
 * - and with the words its author says it is for. None of it is visible unless
 * this screen draws it, and all of it is the kind that breaks quietly: a filter
 * that has stopped filtering still draws a list, and a history missing its
 * oldest half still draws rows.
 *
 * The answer is stubbed rather than fetched. A check written against whatever
 * the real marketplace happens to be offering is a check that goes red when
 * somebody publishes a plugin, and the three facts under test here - narrowing,
 * ordering, and what is said about a release nobody can install - are facts
 * about this screen rather than about the catalog. Nothing is loaded and
 * nothing is changed, so it runs beside the others.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

/*
 * Two plugins, tagged, and one of them with a history worth folding.
 *
 * The first carries four, against a row that wears three: a plugin is usually
 * more than one thing and the row has to say how many more it is not showing,
 * which is a number that can only be checked where there is one.
 *
 * Six releases against a fold of five, so "show the rest" has exactly one row
 * to reveal and the count in the button is checkable. The oldest is the one the
 * marketplace no longer holds the files of, which is how the real catalog ages:
 * the record of every release, the bytes of the ten newest.
 */
const OFFERED = [
  {
    key: 'zz-check-notes',
    name: 'Notes',
    author: 'Check',
    summary: 'Keeps notes.',
    description: 'A plugin that keeps notes.',
    version: '1.4.0',
    url: 'https://example.invalid/notes.js',
    icon: null,
    iconDark: null,
    downloads: 12,
    rating: null,
    reviews: 0,
    published: '2026-03-01',
    installed: false,
    installedVersion: null,
    updatable: false,
    tags: ['productivity', 'notes', 'files', 'search'],
    versions: [
      { version: '1.4.0', published: '2026-03-01', replaced: '2026-03-01', files: 2, available: true },
      { version: '1.3.0', published: '2026-02-01', replaced: '2026-02-01', files: 2, available: true },
      { version: '1.2.0', published: '2026-01-01', replaced: '2026-01-01', files: 2, available: true },
      { version: '1.1.0', published: '2025-12-01', replaced: '2025-12-01', files: 1, available: true },
      { version: '1.0.1', published: '2025-11-05', replaced: '2025-11-05', files: 1, available: true },
      { version: '1.0.0', published: '2025-11-01', replaced: '2025-11-01', files: 1, available: false },
    ],
  },
  {
    key: 'zz-check-charts',
    name: 'Charts',
    author: 'Check',
    summary: 'Draws charts.',
    description: 'A plugin that draws charts.',
    version: '0.2.0',
    url: 'https://example.invalid/charts.js',
    icon: null,
    iconDark: null,
    downloads: 3,
    rating: null,
    reviews: 0,
    published: '2026-04-01',
    installed: false,
    installedVersion: null,
    updatable: false,
    tags: ['source-control'],
    versions: [{ version: '0.2.0', published: '2026-04-01', replaced: '2026-04-02', files: 1, available: true }],
  },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('marketplacePlugins')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { marketplacePlugins: OFFERED } }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/admin/plugins?tab=catalog&source=marketplace`, { waitUntil: 'domcontentloaded' });
// A listing row, not the word: "Notes" is also a tag now, and the tag filter's
// own options carry it.
await page.waitForSelector('[class*="_listingName_"]', { timeout: 20_000 });

/** The names on the shelf, top to bottom. */
const shelf = () =>
  page.$$eval('[class*="_listingName_"]', (names) =>
    names.map((one) => one.firstChild?.textContent?.trim() ?? one.textContent.trim()),
  );

/* ----------------------------------------------------------------- the tags */

const filter = page.locator('select[aria-label="Filter by tag"]');
record((await filter.count()) === 1, 'the shelf offers a tag filter');

/*
 * Every tag the catalog actually used, each once, in the order it listed them,
 * and All first. Built from the listings rather than kept in the screen, so a
 * tag invented on the marketplace appears without this page changing - and one
 * no plugin carries never appears at all.
 */
const choices = await filter.locator('option').allInnerTexts();
record(
  choices.join('|') === 'All tags|Productivity|Notes|Files|Search|Source control',
  `and offers what the catalog actually used, each once (${choices.join(', ')})`,
);

record((await shelf()).join('|') === 'Notes|Charts', 'both plugins are on the shelf to begin with');

/*
 * Chosen by the catalog's own word rather than by the label drawn from it.
 * The lowercase tag is what filters and what the marketplace holds; the
 * reading is only for the person choosing.
 */
await filter.selectOption('source-control');
await page.waitForTimeout(200);
const narrowed = await shelf();
record(narrowed.join('|') === 'Charts', `choosing a tag narrows the shelf (${narrowed.join(', ') || 'nothing'})`);

/*
 * The pane follows the list. A details pane still showing the plugin that was
 * open before the filter moved is a pane describing something the list no
 * longer offers.
 */
const openName = await page.locator('[class*="_detailsName_"]').innerText();
record(openName.trim() === 'Charts', `and the details pane follows it (${openName.trim()})`);

await filter.selectOption('');
await page.waitForTimeout(200);
record((await shelf()).join('|') === 'Notes|Charts', 'and All brings the rest back');

/*
 * The row wears the first few and says how many more there are. A plugin may
 * carry eight, and a row wearing all of them is tags with a name attached -
 * but a row that quietly dropped the rest would be a screen hiding what it
 * knows.
 */
const marks = await page.$$eval('[class*="_tagMark_"]', (all) => all.map((one) => one.textContent.trim()));
record(
  marks.join('|') === 'Productivity|Notes|Files|Source control',
  `each row wears its first three tags (${marks.join(', ')})`,
);
const hidden = await page.$$eval('[class*="_tagMore_"]', (all) => all.map((one) => one.textContent.trim()));
record(hidden.join('|') === '+1', `and says how many it is not showing (${hidden.join(', ') || 'nothing'})`);

/*
 * All of them on the details pane, where there is room - and each one a way
 * into the shelf, because the question a tag raises is what else is this.
 */
await page.getByRole('button', { name: /Notes/ }).first().click();
await page.waitForTimeout(200);
const paneTags = await page.$$eval('[class*="_tagButton_"]', (all) => all.map((one) => one.textContent.trim()));
record(
  paneTags.join('|') === 'Productivity|Notes|Files|Search',
  `the details pane shows every tag (${paneTags.join(', ')})`,
);

await page.getByRole('button', { name: 'Files', exact: true }).click();
await page.waitForTimeout(250);
record((await shelf()).join('|') === 'Notes', 'pressing one narrows the shelf to it');
record(
  (await filter.inputValue()) === 'files',
  `and the select agrees about what is being shown (${await filter.inputValue()})`,
);

await page.getByRole('button', { name: 'Files', exact: true }).click();
await page.waitForTimeout(250);
record((await shelf()).join('|') === 'Notes|Charts', 'and pressing it again lets the rest back');

/* -------------------------------------------------------------- the history */

await page.getByRole('button', { name: /Notes/ }).first().click();
await page.waitForTimeout(200);

/** Every release row drawn, as "version date" plus whatever is marked on it. */
const releases = () =>
  page.$$eval('[class*="_historyRow_"]', (rows) =>
    rows.map((row) => ({
      version: row.querySelector('[class*="_historyVersion_"]')?.textContent?.trim() ?? '',
      gone: row.querySelector('[class*="_goneMark_"]') !== null,
      at: row.querySelector('[class*="_historyAt_"]')?.textContent?.trim() ?? '',
    })),
  );

const folded = await releases();
record(folded.length === 5, `a long history opens folded (${folded.length} of ${OFFERED[0].versions.length} rows)`);
record(
  folded.map((one) => one.version).join('|') === '1.4.0|1.3.0|1.2.0|1.1.0|1.0.1',
  `newest first, and the newest is the one at the top (${folded.map((one) => one.version).join(', ')})`,
);
record(
  folded.every((one) => one.at !== ''),
  'every release says when it was published',
);

const more = page.locator('[class*="_historyMore_"]');
record((await more.innerText()).includes('6'), `the fold says how many there are (${await more.innerText()})`);

await more.click();
await page.waitForTimeout(150);
const whole = await releases();
record(whole.length === 6, `opening it shows the rest (${whole.length} rows)`);

/*
 * The one nobody can install, said on the row it is true of.
 *
 * The marketplace keeps the record of a release long after it stops keeping
 * the files, so the honest thing is a version listed and marked rather than one
 * quietly left out - the alternative is a failure at the moment somebody
 * presses Install.
 */
const gone = whole.filter((one) => one.gone).map((one) => one.version);
record(gone.join('|') === '1.0.0', `a release whose files are gone says so (${gone.join(', ') || 'none marked'})`);

/*
 * A history belongs to the plugin it is under. The pane is reused rather than
 * remade, so an unfolded history carried across to the next plugin would show
 * one plugin's shape under another's name.
 */
await page.getByRole('button', { name: /Charts/ }).first().click();
await page.waitForTimeout(200);
const other = await releases();
record(other.length === 1, `another plugin shows its own history (${other.length} row)`);
record((await page.locator('[class*="_historyMore_"]').count()) === 0, 'and a short history offers no fold');

await page.getByRole('button', { name: /Notes/ }).first().click();
await page.waitForTimeout(200);
record((await releases()).length === 5, 'and coming back, the long one is folded again');

/* ------------------------------ a server that has not heard of a field */

/*
 * The screen draws what an older server can answer rather than nothing at all.
 *
 * GraphQL fails a whole query over one field it does not have, so a page asking
 * for something its server has not got drew an empty catalog under "the
 * marketplace cannot be reached" - a sentence about the wrong thing, since the
 * marketplace was fine and the server was simply older than the page. The
 * refusal below is the real one, copied from the server that produced it.
 */
await page.unroute('**/graphql');
const asked = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('marketplacePlugins')) return route.continue();

  asked.push(body);
  if (body.includes('versions {') || body.includes('tags')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        errors: [{
          message:
            "Validation error (FieldUndefined@[marketplacePlugins/tags]) : Field 'tags' in type " +
            "'MarketplaceListing' is undefined",
        }],
        data: null,
      }),
    });
    return;
  }
  // The rung every server answers: the same listings, without what it has
  // never heard of.
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        marketplacePlugins: OFFERED.map(({ tags, versions, ...rest }) => rest),
      },
    }),
  });
});

await page.goto(`${BASE}/admin/plugins?tab=catalog&source=marketplace`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[class*="_listingName_"]', { timeout: 20_000 });

record((await shelf()).join('|') === 'Notes|Charts', 'an older server still gets its catalog drawn');
record(
  !(await page.locator('main, body').first().innerText()).includes('cannot be reached'),
  'and the screen does not blame the marketplace for a field the server lacks',
);
record(
  (await page.locator('select[aria-label="Filter by tag"]').count()) === 0,
  'the tag filter is simply absent, rather than empty',
);
record(
  (await page.locator('[class*="_historyRow_"]').count()) === 0,
  'and so is the release history',
);
record(asked.length >= 2, `it climbed down rather than giving up (${asked.length} queries)`);

await finish(browser);
