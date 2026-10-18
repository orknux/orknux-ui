/**
 * A new agent's form starts with "Let this agent ask orknux about orknux"
 * ticked.
 *
 * It started off, so every agent made had to be told by hand that it may read
 * the workspace it lives in - the one thing people expected it to do anyway.
 * A new agent now starts with the grant on; existing agents keep what they had.
 *
 * Makes one agent the way the Add dialog does - a name and a type - opens its
 * settings, and removes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const NAME = `zz orknux default ${Date.now()}`;

let made = null;
try {
  made = (await graphql(
    `mutation($input: CreateAgentInput!) { createAgent(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: NAME, type: 'LLM' } },
  )).createAgent.id;

  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${made}/settings`, { waitUntil: 'domcontentloaded' });
  const box = page.getByRole('checkbox', { name: 'Let this agent ask orknux about orknux' });
  await box.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await box.count()) === 1, 'the new agent form has the Orknux grant');
  record(await box.isChecked().catch(() => false), 'and it starts ticked');
} finally {
  if (made !== null) await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: made }).catch(() => undefined);
}

await finish(browser);
