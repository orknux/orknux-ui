/**
 * A connection says whether new agents start with it.
 *
 * The connection's page has "Grant to new agents". Ticked and saved, it is kept;
 * an agent made afterwards starts with that connection granted, and its form
 * shows it ticked.
 *
 * Makes its own connection and agent, and removes both.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stamp = Date.now();
const { createWorkspaceConnection: made } = await graphql(
  `mutation($w: ID!, $n: String!) { createWorkspaceConnection(input: { workspaceId: $w, name: $n, type: HTTP, url: "https://example.invalid" }) { id grantNewAgents } }`,
  { w: WORKSPACE, n: `zz grant ${stamp}` },
);
let agentId = null;
try {
  record(made?.grantNewAgents === false, 'a connection starts not granted to new agents');

  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/connections/${made.id}`, { waitUntil: 'domcontentloaded' });
  const box = page.getByTestId('connection-grant-new-agents');
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await box.count()) === 1 && !(await box.isChecked()), 'its page offers Grant to new agents, unticked');
  await box.check();
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForTimeout(800);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record(await box.isChecked().catch(() => false), 'ticked and saved, it is kept');

  const { createAgent } = await graphql(
    `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id connectionIds } }`,
    { w: WORKSPACE, n: `zz grant agent ${stamp}` },
  );
  agentId = createAgent?.id ?? null;
  record((createAgent?.connectionIds ?? []).map(String).includes(String(made.id)),
    `an agent made afterwards starts with it granted (${JSON.stringify(createAgent?.connectionIds)})`);
} finally {
  if (agentId !== null) await graphql('mutation($id: ID!) { deleteAgent(id: $id) }', { id: agentId }).catch(() => undefined);
  await graphql('mutation($id: ID!) { disconnectWorkspaceConnection(id: $id) }', { id: made?.id }).catch(() => undefined);
}

await finish(browser);
