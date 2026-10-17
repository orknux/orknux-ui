/**
 * A connection the workspace made can be pointed somewhere else.
 *
 * "It's not possible to change connection url." The page drew the address
 * read-only on every connection, so a workspace's own one could only be moved
 * through the URL override - and a mail connection has no override, so its
 * server could not be changed at all. The server always took a new address on
 * an update; the page never sent one.
 *
 * An HTTP and a mail connection are made over the API, their address is
 * changed on the page, and what the server stores is read back. A Slack one,
 * whose address is Slack's, still shows it read-only.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const PREFIX = 'zzConnectionUrl';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const FIELDS = 'id name url';
const listed = async () =>
  (await graphql(`query ($w: ID!) { workspaceConnections(workspaceId: $w) { ${FIELDS} } }`, { w: WORKSPACE })).workspaceConnections;
async function sweep() {
  for (const old of (await listed()).filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();
const make = async (type, url) =>
  (
    await graphql(`mutation ($i: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $i) { ${FIELDS} } }`, {
      i: { workspaceId: WORKSPACE, name: `${PREFIX} ${type} ${Date.now()}`, type, url, ...(type === 'SLACK' ? { secret: 'xoxb-test' } : {}) },
    })
  ).createWorkspaceConnection;

const integrations = `${BASE}/workspace/${WORKSPACE}/integrations`;

async function move(connection, to, what) {
  await page.goto(`${integrations}/connections/${connection.id}`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('#connection-url');
  const offered = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(offered, `${what}: the address is a box the workspace can change`);
  if (!offered) return;
  await box.fill(to);
  // The page's one Save, in the strip at the foot of the window.
  await page.getByTestId('save-bar').getByRole('button', { name: 'Save Changes', exact: true }).click();
  await page.waitForTimeout(1_000);
  const stored = (await listed()).find((one) => one.id === connection.id)?.url ?? null;
  record(stored === to, `${what}: saved, the server holds the new address (${stored})`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await box.waitFor({ timeout: 20_000 }).catch(() => {});
  const shown = await box.inputValue().catch(() => null);
  record(shown === to, `${what}: and the page shows it after a reload (${shown})`);
}

await move(await make('HTTP', 'https://old.example.invalid'), 'https://new.example.invalid/api', 'an HTTP connection');
await move(await make('SMTP', 'smtp.old.invalid'), 'smtp.new.invalid', 'a mail connection');

const slack = await make('SLACK', null);
await page.goto(`${integrations}/connections/${slack.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('#connection-name').waitFor({ timeout: 20_000 }).catch(() => {});
record((await page.locator('#connection-url').count()) === 0, "a Slack connection's address is Slack's, and is not offered");

await sweep();
await finish(browser);
