/**
 * A workspace exported from its row and imported from the header comes back as
 * a new workspace. Issue #590.
 *
 * A scratch workspace of its own with one function in it, named to sort first
 * so its row is on the first page. What is pinned is what is drawn: the Export
 * on its row hands over a file, the Import workspace control beside Create
 * Workspace is a button with a pointer rather than the browser's grey file box,
 * choosing the file draws the same result block a duplicate does - saying it
 * was imported, and under which name - and that name is a row in the list.
 * Every workspace it made is deleted afterwards.
 */
import { readFile } from 'node:fs/promises';
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const NAME = `aaa export check ${Date.now()}`;

const sweep = async () => {
  const { workspaces } = await graphql(`{ workspaces(page: 0, size: 200) { content { id name } } }`);
  for (const old of workspaces.content.filter((one) => one.name.startsWith('aaa export check'))) {
    await graphql(`mutation($id: ID!) { deleteWorkspace(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = (await graphql(`mutation($n: String!) { createWorkspace(input: { name: $n }) { id } }`, { n: NAME }))
  .createWorkspace;
await graphql(`mutation($id: ID!) { createFunction(input: { workspaceId: $id, name: "exportCheck" }) { id } }`, { id: made.id });

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspaces'), 'the workspaces are on screen');

/* The import control is a button, drawn like the one beside it. */
const importButton = page.locator('[data-workspace-import]');
record(await importButton.isVisible().catch(() => false), 'Import workspace is beside Create Workspace');
const looks = await importButton.evaluate((node) => getComputedStyle(node).cursor).catch(() => '');
record(looks === 'pointer', `and it shows a pointer (${looks})`);
const fileBox = await page.locator('[data-workspace-import-file]').evaluate((node) => node.getBoundingClientRect().width).catch(() => -1);
record(fileBox === 0, `the browser's own file control is not drawn (${fileBox}px wide)`);

/* Export: the row's button hands over a file named after the workspace. */
const exportButton = page.getByRole('button', { name: `Export ${NAME}`, exact: true });
await exportButton.waitFor({ timeout: 20_000 });
const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), exportButton.click()]);
const fileName = download.suggestedFilename();
record(fileName === `${NAME}.orkx-workspace.json`, `the export is a file named for the workspace (${fileName})`);
const path = await download.path();
const content = await readFile(path, 'utf8');
record(content.includes('"orknux-workspace"') && content.includes('exportCheck'), 'and it holds the workspace and its function');

/* Import: the same file, chosen under Import workspace. */
await page.locator('[data-workspace-import-file]').setInputFiles({ name: fileName, mimeType: 'application/json', buffer: Buffer.from(content) });
const result = page.locator('[data-copy-result="import"]');
record(await result.waitFor({ timeout: 60_000 }).then(() => true).catch(() => false), 'the import answers in the result block');
const said = (await result.textContent().catch(() => '')) ?? '';
// The source still holds the file's name, so the import takes the next free one.
record(said.includes(`Imported as ${NAME} 2`), `it says it was imported, and as what (${said})`);
record(said.includes('1 function'), 'and how much came');

const row = page.getByRole('link', { name: `${NAME} 2`, exact: true });
record(await row.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the new workspace is a row in the list');

await sweep();
await finish(browser);
