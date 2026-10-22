/**
 * The Objects page pages what it draws: the workspace's own objects and the
 * plugins' shapes under them, as one list.
 *
 * Reported: "paging does not work in objects" - the pager said "Showing 1-4 of
 * 4 objects", counting the workspace's own alone, while every plugin shape was
 * drawn under them with no page at all.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const own = (await graphql('query($w: ID!) { workspaceObjects(workspaceId: $w, page: 0, size: 1) { totalElements } }', { w: WORKSPACE }))
  .workspaceObjects.totalElements;
const plugins = (await graphql('query { pluginObjects { id } }')).pluginObjects.length;
const total = own + plugins;

await page.goto(`${BASE}/workspace/${WORKSPACE}/objects`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'Showing');
// The plugins' shapes arrive after the workspace's own; read once the count has settled on both.
await page.waitForFunction((want) => [...document.querySelectorAll('main p')].some((one) => one.textContent.includes(`of ${want} `)), total, { timeout: 15_000 }).catch(() => undefined);

/** The pager's sentence and how many rows the list draws. */
const read = async () => {
  await page.waitForTimeout(500);
  const said = ((await page.locator('main p', { hasText: /^Showing / }).first().textContent()) ?? '').replace(/\s+/g, ' ');
  const rows = await page.locator('main section [class*="_row_"]').count();
  return { said, rows };
};

const first = await read();
const match = /Showing (\d+)-(\d+) of (\d+)/.exec(first.said);
const [from, to, of] = match === null ? [0, 0, -1] : match.slice(1).map(Number);
record(of === total, `the pager counts the workspace's own objects and the plugins' shapes together (${first.said.trim()}; ${own} own + ${plugins} from plugins)`);
record(first.rows === to - from + 1, `and the page draws as many rows as it says it shows (${first.rows} drawn, ${from}-${to})`);

if (total > to) {
  await page.getByRole('button', { name: 'Next' }).click();
  const second = await read();
  const next = /Showing (\d+)-(\d+) of (\d+)/.exec(second.said);
  const [from2, to2] = next === null ? [0, 0] : next.slice(1, 3).map(Number);
  record(from2 === to + 1 && second.rows === to2 - from2 + 1, `Next shows the following rows (${second.said.trim()}, ${second.rows} drawn)`);
} else {
  record(true, `everything fits on one page here (${total}); Next is not exercised`);
}

await finish(browser);
