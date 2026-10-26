/**
 * New research says, before it starts, that web search has no key. Issue #666.
 *
 * A research that searches the web with no search key planned for nothing and
 * failed at Gather minutes later. The server now refuses one at the start, and
 * the form asks first: with Use web search ticked in a workspace whose search
 * has no key it can read, a line under the options says so and Start is off;
 * unticking web search takes the line away and lets it start, and a workspace
 * with a key shows no line at all.
 *
 * Whether there is a key is answered in the browser, first no and then yes, so
 * the check does not depend on what the fixture's search is set to.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
// Start also waits for an agent: one is chosen, so only the search key is left to decide it.
const listed = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id enabled } } }`, { w: WORKSPACE });
const agent = listed.workspaceAgents.content.find((one) => one.enabled);

let ready = false;
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('researchSearchReady(')) return route.fulfill({ json: { data: { researchSearchReady: ready } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await dialog.locator('#research-web-search').waitFor({ timeout: 10_000 });
await dialog.locator('textarea, input[type="text"]').first().fill('zz search key check: why are there tides?');
await chooseOption(page, '#research-agent-mode', { value: 'SINGLE' }).catch(() => undefined);
if (agent !== undefined) await chooseOption(page, '#research-agent', { value: agent.id }).catch(() => undefined);
const start = dialog.getByRole('button', { name: 'Start', exact: true });
const line = dialog.locator('[data-search-key-missing]');

await line.waitFor({ timeout: 10_000 }).catch(() => undefined);
record(await line.isVisible().catch(() => false), 'with web search on and no search key, the form says so');
const said = (await line.textContent().catch(() => '')) ?? '';
const drawn = await line.evaluate((one) => ({ height: one.getBoundingClientRect().height, font: parseFloat(getComputedStyle(one).fontSize) })).catch(() => null);
record(
  said.includes('search key') && drawn !== null && drawn.height < drawn.font * 2.5,
  `in one line (${said.trim()}; ${JSON.stringify(drawn)})`,
);
record(await start.isDisabled().catch(() => false), 'and Start is off');

await dialog.locator('#research-web-search').uncheck();
record(!(await line.isVisible().catch(() => false)), 'without web search the line goes');
await page.waitForFunction(() => {
  const button = [...document.querySelectorAll('dialog[open] button')].find((one) => one.textContent?.trim() === 'Start');
  return button !== undefined && !button.disabled;
}, null, { timeout: 10_000 }).catch(() => undefined);
record(!(await start.isDisabled().catch(() => true)), 'and Start is on again');

// A workspace that has a key: opened again, nothing is said.
await dialog.getByRole('button', { name: 'Cancel' }).click();
ready = true;
await page.getByRole('button', { name: 'New research' }).click();
await dialog.locator('#research-web-search').waitFor({ timeout: 10_000 });
await page.waitForTimeout(500);
record(await dialog.locator('#research-web-search').isChecked(), 'web search is ticked again on opening');
record((await line.count()) === 0, 'and with a key there is no line');

await browser.close();
finish();
