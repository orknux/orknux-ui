/**
 * Clicking a label narrows the list to the issues carrying it, and to nothing
 * that merely mentions it.
 *
 * Issue #610. A label chip used to type itself into the search, and the search
 * reads the title and the description as well as the labels - so a release
 * label clicked on the tracker brought back every issue whose description
 * happened to name the release. What is pinned is what is drawn: the rows the
 * list shows after the chip is pressed, counted in the DOM.
 *
 * Files two issues under a mark of its own - one carrying the label, one only
 * mentioning it - and deletes them, sweeping what an earlier killed run left.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const MARK = 'zzIssueLabelFilter';
const LABEL = 'zzlabelfilter610';

const LIST = `query($id: ID!, $q: String) {
  workspaceIssues(workspaceId: $id, page: 0, size: 100, search: $q, status: null) { content { id number title } }
}`;

const sweep = async () => {
  const found = await graphql(LIST, { id: WORKSPACE, q: MARK });
  for (const old of found.workspaceIssues.content.filter((one) => one.title.startsWith(MARK))) {
    await graphql(`mutation($id: ID!) { deleteIssue(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

await sweep();

async function file(title, description, labels) {
  const made = await graphql(`mutation($input: IssueInput!) { createIssue(input: $input) { id number } }`, {
    input: { workspaceId: WORKSPACE, title: `${MARK} ${title}`, description, labels, status: 'OPEN' },
  });
  return made.createIssue;
}

await file('carries the label', 'Filed by issue-label-filter-check, and deleted by it.', [LABEL]);
await file('only mentions it', `Says ${LABEL} in its description and carries no label.`, []);

const clean = async () => {
  await sweep();
  await finish(browser);
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/issues?status=all`, { waitUntil: 'domcontentloaded' });
if (!(await drawn(page, 'the issue list'))) await clean();

const chip = page.locator('button', { hasText: LABEL }).first();
const offered = await chip
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(offered, `the label ${LABEL} is offered as a chip`);
if (!offered) await clean();

await chip.click();
await page.waitForSelector(`text=${MARK} carries the label`, { timeout: 20_000 }).catch(() => undefined);
// The list is fetched after a pause, so give the answer to the click time to land.
await page.waitForTimeout(1_500);

const shown = await page.$$eval(
  'a[href*="/issues/"]',
  (found, mark) => found.map((one) => one.textContent ?? '').filter((text) => text.includes(mark)),
  MARK,
);
record(
  shown.length === 1 && shown[0].includes('carries the label'),
  `the label shows only the issue carrying it (${shown.length} rows: ${JSON.stringify(shown)})`,
);

const box = await page.inputValue('input[type="search"]').catch(() => null);
record(box === '', `and the search box is left as it was (${JSON.stringify(box)})`);

/* The text search still finds the one that mentions it. */
await chip.click();
await page.fill('input[type="search"]', LABEL);
await page.waitForSelector(`text=${MARK} only mentions it`, { timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(1_500);
const searched = await page.$$eval(
  'a[href*="/issues/"]',
  (found, mark) => found.filter((one) => (one.textContent ?? '').includes(mark)).length,
  MARK,
);
record(searched === 2, `while a text search for the same word finds both (${searched} rows)`);

await clean();
