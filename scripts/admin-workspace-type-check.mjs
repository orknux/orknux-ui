/**
 * The admin list of workspaces says each one's type in a column of its own.
 *
 * An admin workspace used to be marked only by a badge beside its name, and an
 * ordinary one by nothing, so the list did not say what kind each was - it
 * said which were the exception. A Type column now names both: Admin or
 * Standard, on every row.
 *
 * Measured: the header has a Type column; every workspace row on the page has
 * a type cell holding a word; the cells line up under the header (their left
 * edges within a few pixels of it); and an ordinary workspace reads Standard.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspace list'), 'the workspace list opens');

const header = page.locator('[class*="_tableHeader_"] [class*="_colType_"]');
const headed = await header
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(headed, 'the list has a Type column');
if (!headed) await finish(browser);

await page.locator('[data-workspace-type]').first().waitFor({ timeout: 20_000 });
const rows = await page.locator('[class*="_workspaceLabel_"]').count();
const cells = page.locator('[data-workspace-type]');
const typed = await cells.count();
record(typed > 0 && typed === rows, `every workspace row has a type (${typed} of ${rows})`);

const words = (await cells.allInnerTexts()).map((one) => one.trim());
record(words.every((one) => one === 'Admin' || one === 'Standard'), `each says Admin or Standard (${[...new Set(words)].join(', ')})`);
record(words.includes('Standard'), 'and an ordinary workspace reads Standard');

const top = await header.boundingBox();
const lefts = await cells.evaluateAll((all) => all.map((one) => one.getBoundingClientRect().left));
record(
  top !== null && lefts.every((left) => Math.abs(left - top.x) < 4),
  `the cells line up under the heading (heading at ${Math.round(top?.x ?? -1)}, cells at ${[...new Set(lefts.map(Math.round))].join(', ')})`,
);

await finish(browser);
