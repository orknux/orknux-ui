/**
 * A long "Used by" list is paged.
 *
 * A skill catalog a whole workspace's agents use listed forty rows down the
 * page, under a panel that is usually three lines. It now shows ten at a time
 * under the pager every list has, with its size control; a list of ten or
 * fewer has no pager at all.
 *
 * Canned: the dependants of one function this workspace has are answered here,
 * twenty-three of them, so the check needs no fixture of its own.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspaceFunctions } = await graphql(
  `query ($w: ID!) { workspaceFunctions(workspaceId: $w, size: 1) { content { id } } }`,
  { w: WORKSPACE },
);
const target = workspaceFunctions.content[0]?.id;
if (target === undefined) {
  record(false, 'the workspace has a function to open');
  await finish(browser);
}

let count = 23;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('componentDependants')) return route.continue();
  const entries = Array.from({ length: count }, (_, at) => ({
    kind: 'AGENT', id: String(9000 + at), name: `Dependant ${at + 1}`, workspaceId: WORKSPACE, workspaceName: null, published: false,
  }));
  return route.fulfill({ json: { data: { componentDependants: { entries, hidden: 0 } } } });
});

const panel = page.locator('[aria-label="Used by"]');
const rows = panel.locator('[data-dependants] a');
const names = async () => (await rows.allInnerTexts()).map((text) => text.split('\n')[0].trim());

await page.goto(`${BASE}/workspace/${WORKSPACE}/functions/${target}`, { waitUntil: 'domcontentloaded' });
await panel.locator('[data-dependants]').waitFor({ timeout: 20_000 });
record((await rows.count()) === 10, `twenty-three dependants show ten at a time (${await rows.count()})`);
const pager = panel.getByText(/Showing 1-10 of 23/);
record((await pager.count()) === 1, 'under the pager every list has, which counts them all');

await panel.getByRole('button', { name: 'Next' }).click();
const second = await names();
record(second[0] === 'Dependant 11' && second.length === 10, `Next shows the next ten (${second[0]} ...)`);

await chooseOption(page, panel.locator('[data-select]'), '25');
record((await rows.count()) === 23, `the size control shows them all at 25 (${await rows.count()})`);

// Ten or fewer: nothing to page, so no pager.
count = 4;
await page.reload({ waitUntil: 'domcontentloaded' });
await panel.locator('[data-dependants]').waitFor({ timeout: 20_000 });
record((await rows.count()) === 4 && (await panel.getByText(/Showing/).count()) === 0, 'a short list has no pager');

await finish(browser);
