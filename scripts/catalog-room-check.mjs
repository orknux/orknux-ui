/**
 * A full catalog leaves the footer where it is, and scrolls its own list.
 *
 * The bug this pins shut has now happened three times, each the same shape:
 * the catalog's panes were given a height in pixels - `100vh` less a constant
 * standing for the header, the tabs, the pane's chrome and the footer -
 * something was added above them, and the constant quietly stopped being
 * true. The panes grew, `main` grew past the window, and the footer went off
 * the bottom of a page that could not be scrolled down to it, because what
 * had overflowed was a flex item rather than the document.
 *
 * So what is measured here is not a number in a stylesheet. It is a catalog of
 * forty plugins in a short window: the shelf must scroll inside itself, the
 * panes must end above the footer, and the footer must be on the screen.
 *
 * The catalog is stubbed because a check written against whatever the real
 * marketplace is offering goes red when somebody publishes a plugin - and a
 * short shelf would not test the thing that breaks.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 800 } });

/** Forty of them, which is more than any window is tall. */
const OFFERED = Array.from({ length: 40 }, (unused, index) => ({
  key: `zz-room-${index}`,
  name: `Plugin ${index}`,
  author: 'Check',
  summary: 'One of many.',
  description: `A plugin. ${'It has a long description. '.repeat(60)}`,
  version: '1.0.0',
  url: `https://example.invalid/${index}.js`,
  icon: null,
  iconDark: null,
  downloads: index,
  rating: null,
  reviews: 0,
  published: '2026-03-01',
  installed: false,
  installedVersion: null,
  updatable: false,
  tags: ['productivity', 'notes'],
  versions: [{ version: '1.0.0', published: '2026-03-01', replaced: '2026-03-01', files: 1, available: true }],
}));

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('marketplacePlugins')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ data: { marketplacePlugins: OFFERED } }),
  });
});

await page.goto(`${BASE}/admin/plugins?tab=catalog&source=marketplace`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[class*="_listingName_"]', { timeout: 20_000 });
await page.waitForTimeout(800);

const room = await page.evaluate(() => {
  const shelf = document.querySelector('[class*="_listingScroll_"]');
  const body = document.querySelector('[class*="_catalogBody_"]');
  const details = document.querySelector('[class*="_detailsBody_"]');
  const attribution = document.querySelector('[class*="_attribution_"]');
  const rect = (one) => (one === null ? null : one.getBoundingClientRect());
  return {
    viewport: window.innerHeight,
    // The list holds more than it shows, and moves inside itself.
    shelfScrolls: shelf !== null && shelf.scrollHeight > shelf.clientHeight + 4,
    detailsScrolls: details !== null && details.scrollHeight > details.clientHeight + 4,
    bodyBottom: Math.round(rect(body)?.bottom ?? 0),
    attributionTop: Math.round(rect(attribution)?.top ?? 0),
    attributionVisible:
      attribution !== null &&
      rect(attribution).top < window.innerHeight &&
      rect(attribution).bottom > 0,
  };
});

record(room.shelfScrolls, 'a shelf of forty scrolls inside itself');
record(room.detailsScrolls, "and a long description scrolls inside its own pane");
record(
  room.bodyBottom <= room.attributionTop,
  `the panes end above the footer (pane ends at ${room.bodyBottom}, footer starts at ${room.attributionTop})`,
);
record(
  room.attributionVisible,
  `the footer is on the screen without scrolling (at ${room.attributionTop} of ${room.viewport})`,
);

/*
 * And it holds when the window changes, which is the half a fixed constant
 * could never get right: the room is measured from where the panes start, so
 * a shorter window gives them less rather than pushing the footer off.
 */
await page.setViewportSize({ width: 1440, height: 1100 });
await page.waitForTimeout(600);
const taller = await page.evaluate(() => {
  const body = document.querySelector('[class*="_catalogBody_"]');
  const attribution = document.querySelector('[class*="_attribution_"]');
  return {
    bodyBottom: Math.round(body.getBoundingClientRect().bottom),
    attributionTop: Math.round(attribution.getBoundingClientRect().top),
    grew: Math.round(body.getBoundingClientRect().height),
  };
});
record(
  taller.bodyBottom <= taller.attributionTop,
  `a taller window gives the panes the room instead of the footer (pane ends at ${taller.bodyBottom}, ` +
    `footer starts at ${taller.attributionTop})`,
);
record(taller.grew > 400, `and the panes actually take it (${taller.grew}px tall)`);

await finish(browser);
