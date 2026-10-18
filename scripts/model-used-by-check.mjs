/**
 * A model's page says what uses it, and each row opens the thing it names.
 *
 * The model page had no Used by, so the one question worth asking before
 * removing a model - which agents think with it - had no answer short of
 * opening every agent. It now lists the agents, the workspace settings and the
 * workflows that use it, and removing one still in use is refused.
 *
 * Makes a provider, a model and an agent under names of its own, and removes
 * them again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const STAMP = Date.now();
let providerId = null;
let agentId = null;

try {
  providerId = (await graphql(
    `mutation($w: ID!, $n: String!) { createModelProvider(input: { workspaceId: $w, name: $n, endpoint: "http://used-by.invalid/v1", secret: "sk-test" }) { id } }`,
    { w: WORKSPACE, n: `zz used-by provider ${STAMP}` },
  )).createModelProvider.id;
  const modelId = (await graphql(
    `mutation($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "used-by-model", kind: CHAT }) { id } }`,
    { p: providerId, n: `zz used-by model ${STAMP}` },
  )).createModel.id;
  const agentName = `zz used-by agent ${STAMP}`;
  agentId = (await graphql(
    `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
    { w: WORKSPACE, n: agentName },
  )).createAgent.id;
  await graphql(`mutation($id: ID!, $n: String!, $m: ID) { updateAgent(id: $id, input: { name: $n, modelId: $m }) { id } }`, {
    id: agentId, n: agentName, m: modelId,
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${modelId}`, { waitUntil: 'domcontentloaded' });
  const panel = page.locator('[aria-label="Used by"]');
  await panel.locator('[data-dependants]').waitFor({ timeout: 20_000 }).catch(() => undefined);
  const row = panel.locator(`[data-dependant-kind="AGENT"][data-dependant-name="${agentName}"]`);
  record((await panel.count()) === 1, 'the model page has Used by');
  record((await row.count()) === 1, 'listing the agent that thinks with it');

  await row.click();
  await page.waitForURL(new RegExp(`/agents/${agentId}/settings`), { timeout: 15_000 }).catch(() => undefined);
  record(page.url().includes(`/agents/${agentId}/settings`), `and the row opens that agent (${page.url()})`);

  // The provider's page lists the model reached through it.
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${providerId}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[aria-label="Used by"] [data-dependants]').waitFor({ timeout: 20_000 }).catch(() => undefined);
  record(
    (await page.locator(`[aria-label="Used by"] [data-dependant-kind="MODEL"]`).count()) === 1,
    'the provider page lists the model reached through it',
  );
} finally {
  if (agentId !== null) await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agentId }).catch(() => undefined);
  if (providerId !== null) await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: providerId }).catch(() => undefined);
}

await finish(browser);
