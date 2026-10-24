/**
 * The research workflows are built-in, and kept off the list until Show built-in is ticked. Issue #659.
 *
 * Shallow, Medium and Deep are workflows of the workspace like any other, and
 * editable like any other, but seeded hidden: the Workflows list leaves them
 * out, and a box beside the search brings them in - marked Hidden, and opening
 * in the editor like the rest. The box is kept in the address.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

// The modes are seeded when the workspace is made; asking for them seeds one that predates them.
const modes = await graphql(`query($w: ID!) { researchModes(workspaceId: $w) { workflowName } }`, { w: WORKSPACE });
const names = modes.researchModes.map((one) => one.workflowName).filter((one) => one !== null);
record(names.length >= 3, `the workspace has its research workflows (${names.join(', ')})`);

const rowsNamed = async () =>
  page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/workflows/"][href$="/editor"]')].map((one) => (one.textContent ?? '').trim()),
  );

await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
const search = page.getByPlaceholder('Search workflows...');
await search.waitFor({ timeout: 20_000 });
await search.fill('Research:');
await page.waitForTimeout(1500);

const box = page.getByRole('checkbox', { name: 'Show built-in' });
record((await box.count()) === 1 && !(await box.isChecked()), 'the list has a Show built-in box, unticked');
const before = await rowsNamed();
record(names.every((name) => !before.includes(name)), `unticked, the research workflows are not listed (${before.join(', ') || 'none'})`);

await box.check();
await page.waitForFunction(
  (wanted) => {
    const shown = [...document.querySelectorAll('a[href*="/workflows/"][href$="/editor"]')].map((one) => (one.textContent ?? '').trim());
    return wanted.every((name) => shown.includes(name));
  },
  names,
  { timeout: 15_000 },
).catch(() => undefined);
const after = await rowsNamed();
record(names.every((name) => after.includes(name)), `ticked, they are (${after.join(', ')})`);
record(new URL(page.url()).searchParams.get('hidden') === 'show', 'the box is kept in the address');

const deep = page.locator('a[href$="/editor"]', { hasText: names.find((one) => one.endsWith('Deep')) ?? 'Research: Deep' }).first();
const tag = deep.locator('xpath=following-sibling::*[1]');
record(((await tag.textContent().catch(() => '')) ?? '').trim() === 'Built-in', 'a built-in one says so beside its name');

// Still the workflow it is: it opens in the editor.
await deep.click();
await page.waitForURL(/\/workflows\/\d+\/editor/, { timeout: 15_000 }).catch(() => undefined);
await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await page.locator('.react-flow__node').count()) >= 1, `a hidden workflow opens in the editor with its node (${page.url()})`);

await finish(browser);
