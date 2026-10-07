/**
 * Switching workspace on the variables page opens the other workspace's
 * catalogs.
 *
 * It did not. The page stays mounted across a switch, and the open catalog was
 * held as a bare id, so the next read asked the new workspace for the old
 * workspace's catalog and the page said "No catalog with id". Michal hit it
 * moving between two workspaces.
 *
 * No error is the half a page that showed nothing at all would also pass, so
 * this also asserts what is open is the other workspace's catalog - its name
 * in the heading - and that switching back opens this workspace's again.
 *
 * Makes a workspace with one catalog, and removes it.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const STAMP = Date.now();
const { createWorkspace } = await graphql(
  `mutation ($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }`,
  { input: { name: `zz suite - other variables ${STAMP}` } },
);
const other = String(createWorkspace.id);
const THERE = `zz catalog elsewhere ${STAMP}`;
await graphql(`mutation ($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }`, {
  w: other,
  n: THERE,
});

const { variableCatalogs } = await graphql(`query ($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }`, {
  w: WORKSPACE,
});
record(variableCatalogs.length > 0, `workspace ${WORKSPACE} has a catalog to have open (${variableCatalogs.length})`);

const clean = async () => {
  await graphql(`mutation ($id: ID!) { deleteWorkspace(id: $id) }`, { id: other }).catch(() => undefined);
  await finish(browser);
};

const heading = page.locator('h1');
const refused = page.locator('[role="alert"]', { hasText: 'No catalog' });

await page.goto(`${BASE}/workspace/${WORKSPACE}/variables`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the variables page'), 'the variables page is on screen');
await heading.filter({ hasText: variableCatalogs[0].name }).first().waitFor({ timeout: 10_000 }).catch(() => {});
record(
  (await heading.allInnerTexts()).some((text) => text.includes(variableCatalogs[0].name)),
  `a catalog of this workspace is open (${variableCatalogs[0].name})`,
);

const picker = page.locator('select[aria-label="Selected workspace"]');
await picker.selectOption(other);
await page.waitForURL(`**/workspace/${other}/variables`, { timeout: 10_000 }).catch(() => {});
await heading.filter({ hasText: THERE }).first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(800);

record(new URL(page.url()).pathname === `/workspace/${other}/variables`, `the switch stays on the variables page (${new URL(page.url()).pathname})`);
const said = await refused.allInnerTexts();
record(said.length === 0, `and refuses nothing${said.length > 0 ? ` (${said.join(' | ')})` : ''}`);
record((await heading.allInnerTexts()).some((text) => text.includes(THERE)), "and opens the other workspace's catalog");

await picker.selectOption(WORKSPACE);
await page.waitForURL(`**/workspace/${WORKSPACE}/variables`, { timeout: 10_000 }).catch(() => {});
await heading.filter({ hasText: variableCatalogs[0].name }).first().waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(800);
record((await refused.count()) === 0, 'and switching back refuses nothing either');
record(
  (await heading.allInnerTexts()).some((text) => text.includes(variableCatalogs[0].name)),
  "and opens this workspace's catalog again",
);

await clean();
