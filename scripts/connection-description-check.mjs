/**
 * A connection says what it is for: under its name in the list, whole on
 * hover, findable by the list's search, and written on its settings page.
 *
 * Two connections to one system - two Jiras, two Prometheuses - were told apart
 * by name alone, in the list and to an agent. A description is set where the
 * connection is made or on its page; the agent's half, the briefing and
 * find_connections, is ConnectionSearchTest's.
 *
 * Makes one connection over the API and disconnects it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const PREFIX = 'zzConnectionDescription';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listed = async () =>
  (await graphql(`query ($w: ID!) { workspaceConnections(workspaceId: $w) { id name description } }`, { w: WORKSPACE }))
    .workspaceConnections;
async function sweep() {
  for (const old of (await listed()).filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();

const NAME = `${PREFIX} ${Date.now()}`;
const FIRST = 'production Jira, the support project';
const made = (
  await graphql(`mutation ($i: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $i) { id description } }`, {
    i: { workspaceId: WORKSPACE, name: NAME, type: 'HTTP', url: 'https://jira.example.invalid', description: FIRST },
  })
).createWorkspaceConnection;
record(made.description === FIRST, 'the server keeps a description given when the connection is made');

const integrations = `${BASE}/workspace/${WORKSPACE}/integrations`;
await page.goto(integrations, { waitUntil: 'domcontentloaded' });
const search = page.getByPlaceholder(/Search connections/i).first();
await search.waitFor({ timeout: 20_000 }).catch(() => {});
await search.fill('support project');
await page.waitForTimeout(800);

const row = page.locator(`[data-connection-row="${NAME}"]`);
const found = await row.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(found, "the list's search finds a connection by what it is for");
const cell = row.locator('xpath=..').locator('[data-connection-description]');
const shown = ((await cell.textContent().catch(() => '')) ?? '').trim();
record(shown === FIRST, `the list shows it in its own column (${shown})`);
record((await cell.getAttribute('title').catch(() => null)) === FIRST, 'and whole on hover');

/* Changed on its own page, saved with the name. */
await page.goto(`${integrations}/connections/${made.id}`, { waitUntil: 'domcontentloaded' });
const box = page.locator('#connection-description');
const offered = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(offered, "the connection's page offers its description");
const SECOND = 'staging Jira, for trying workflows';
if (offered) {
  record((await box.inputValue()) === FIRST, 'holding what it was made with');
  // Save at the top of the card, level with its title, not under the last field.
  const placed = await page.evaluate(() => {
    const save = [...document.querySelectorAll('button')].find((one) => one.textContent.trim() === 'Save')?.getBoundingClientRect();
    const name = document.querySelector('#connection-name')?.getBoundingClientRect();
    return save && name ? { save: Math.round(save.top), firstField: Math.round(name.top) } : null;
  });
  record(placed !== null && placed.save < placed.firstField, `Save sits above the card's first field (${JSON.stringify(placed)})`);
  await box.fill(SECOND);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForTimeout(1_000);
  const stored = (await listed()).find((one) => one.id === made.id)?.description ?? null;
  record(stored === SECOND, `saved, the server holds the new one (${stored})`);
}

await sweep();
await finish(browser);
