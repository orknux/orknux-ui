/**
 * The import dialog's list of what a file brings: narrowed to what is not here,
 * and opened to its full length.
 *
 * A long plan was capped at a few rows and scrolled inside the dialog, with the
 * rows that stop the import - "Not here" - somewhere among a dozen that do not.
 * Above the list now: All / Not here, each with its count, and Expand, which
 * lets the list run as long as it is.
 *
 * The plan is answered here, so the check needs no file of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const entry = (name, disposition) => ({
  kind: 'TOOL', external: null, carried: disposition !== 'MISSING', droppable: true, name, targetName: name, disposition,
  detail: disposition === 'MISSING' ? `${name} is not here.` : `${name} is created.`,
});
const ENTRIES = [
  ...Array.from({ length: 10 }, (_, i) => entry(`zz carried ${i}`, 'CREATE')),
  ...Array.from({ length: 4 }, (_, i) => entry(`zz missing ${i}`, 'MISSING')),
];

await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('componentImportPlan')) {
    return route.fulfill({ json: { data: { componentImportPlan: {
      formatVersion: 1, producedBy: 'Orknux 1.1.4', depth: 'DEEP', importable: false, entries: ENTRIES, problems: [],
    } } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Showing', { timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(700);
await page.locator('input[type="file"]').first().setInputFiles({
  name: 'zz-plan.orkx.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ formatVersion: 1, components: [] })),
});
await page.waitForSelector('dialog[open] h2:has-text("Import")', { timeout: 20_000 }).catch(() => undefined);
const plan = page.getByTestId('import-plan');
await plan.waitFor({ timeout: 10_000 }).catch(() => undefined);

const rows = () => plan.locator('li').count();
const labels = await page.getByTestId('plan-filter').locator('button').allInnerTexts().catch(() => []);
record(JSON.stringify(labels) === JSON.stringify(['All (14)', 'Not here (4)']) && (await rows()) === 14,
  `the plan offers All and Not here, counted, and starts on All (${JSON.stringify({ labels, rows: await rows() })})`);

await page.getByTestId('plan-filter-missing').click();
const missingNames = await plan.locator('li').allInnerTexts();
record(missingNames.length === 4 && missingNames.every((one) => one.includes('zz missing')),
  `Not here shows only the rows that stop the import (${missingNames.length})`);
await page.getByTestId('plan-filter-all').click();
record((await rows()) === 14, 'and All shows them all again');

// Capped and scrolled inside, until expanded to its full length.
const height = () => plan.evaluate((list) => ({ shown: list.clientHeight, whole: list.scrollHeight }));
const capped = await height();
await page.getByTestId('plan-expand').click();
const opened = await height();
const label = (await page.getByTestId('plan-expand').innerText()).trim();
record(capped.whole > capped.shown + 50 && opened.shown >= opened.whole - 1 && label === 'Collapse',
  `Expand lets the list run its full length (${JSON.stringify({ capped, opened, label })})`);
await page.getByTestId('plan-expand').click();
const again = await height();
record(again.shown === capped.shown, `and Collapse caps it again (${JSON.stringify(again)})`);

await finish(browser);
