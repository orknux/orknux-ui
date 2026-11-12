/**
 * Workspace -> Recycle Bin lists what has been deleted, restores one and purges one.
 *
 * A read-only list answered here by the server: the objects a workspace has
 * deleted, each with its kind and when it went. Restore re-creates one and it
 * leaves the bin; Delete forever asks, and on yes takes one out for good. The
 * rows are stubbed, so this asserts what is drawn and which mutation each button
 * fires, not the server's own re-creation.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

const now = new Date().toISOString();
let entries = [
  { id: '1', kind: 'AGENT', name: 'Researcher', deletedAt: now, deletedBy: 'alice' },
  { id: '2', kind: 'DIAGRAM', name: 'Flow', deletedAt: now, deletedBy: 'alice' },
];
const asked = { restored: [], purged: [] };

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('recycleBin(')) {
    return route.fulfill({
      json: { data: { recycleBin: { content: entries, page: 0, size: 20, totalElements: entries.length, totalPages: 1 } } },
    });
  }
  if (query.includes('restoreRecycleBinEntry')) {
    const id = body.variables?.id;
    asked.restored.push(id);
    entries = entries.filter((e) => e.id !== id);
    return route.fulfill({ json: { data: { restoreRecycleBinEntry: true } } });
  }
  if (query.includes('purgeRecycleBinEntry')) {
    const id = body.variables?.id;
    asked.purged.push(id);
    entries = entries.filter((e) => e.id !== id);
    return route.fulfill({ json: { data: { purgeRecycleBinEntry: true } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/recycle-bin`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-recycle-row]').first().waitFor({ timeout: 20_000 }).catch(() => undefined);

const names = await page
  .locator('[data-recycle-row]')
  .evaluateAll((rows) => rows.map((r) => r.getAttribute('data-recycle-name')));
record(JSON.stringify(names) === JSON.stringify(['Researcher', 'Flow']), `the bin lists the deleted objects (${JSON.stringify(names)})`);

const saysAgent = await page.locator('[data-recycle-row]').first().getByText('Agent', { exact: true }).count();
record(saysAgent === 1, `a row says what kind it is (${saysAgent})`);
record((await page.locator('[data-recycle-empty]').count()) === 1, 'Empty bin is offered while the bin has something in it');

// Restore the first: the mutation fires with that id, and the row leaves the bin.
await page.locator('[data-recycle-restore="1"]').click();
await page.waitForTimeout(600);
record(JSON.stringify(asked.restored) === JSON.stringify(['1']), `Restore restores that entry (${JSON.stringify(asked.restored)})`);
record((await page.locator('[data-recycle-row]').count()) === 1, 'and the restored row leaves the bin');

// Delete forever the other: it asks first, then purges on confirm.
await page.locator('[data-recycle-purge="2"]').click();
await page.getByRole('button', { name: 'Delete forever' }).click({ timeout: 10_000 });
await page.waitForTimeout(600);
record(JSON.stringify(asked.purged) === JSON.stringify(['2']), `Delete forever purges that entry (${JSON.stringify(asked.purged)})`);
record((await page.getByText('The recycle bin is empty.').count()) === 1, 'and the bin reads as empty');

await finish(browser);
