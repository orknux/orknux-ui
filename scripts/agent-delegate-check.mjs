/**
 * A tool row's fourth state, Delegate, and the models an agent may create
 * agents with.
 *
 * Delegate is held only to hand on: the agent cannot use the tool itself, and
 * may give it to an agent it creates. It sits after Always in the row's cycle,
 * draws as its own state, and is stored apart from the grant - so this reads
 * the server after the save rather than trusting the button's label. The
 * "Dynamic subagents models" section is a tick list of the workspace's chat models;
 * one ticked reaches `creatableModelIds`, and the line under it says what
 * that means.
 *
 * Makes a tool, a provider on `.invalid`, a model and an agent, and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1400 } });

const stamp = Date.now();
const PREFIX = 'zzDelegate';
const TOOL = `zz_delegate_${stamp}`;
const MODEL = `${PREFIX} Model ${stamp}`;

const sweep = async () => {
  const held = await graphql(
    `query($w: ID!) {
       workspaceAgents(workspaceId: $w, size: 200) { content { id name } }
       modelProviders(workspaceId: $w) { id name }
       workspaceTools(workspaceId: $w, size: 200) { content { id name } }
     }`,
    { w: WORKSPACE },
  );
  for (const old of held.workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  for (const old of held.workspaceTools.content.filter((one) => one.name.startsWith('zz_delegate_'))) {
    await graphql(`mutation($id: ID!) { deleteTool(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  for (const old of held.modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

await graphql(`mutation($input: CreateToolInput!) { createTool(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, name: TOOL, description: 'Says it louder.' },
});
const provider = (await graphql(`mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} Provider ${stamp}`, endpoint: 'http://stub.invalid', secret: 'sk-test' },
})).createModelProvider;
const model = (await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
  input: { providerId: provider.id, name: MODEL, modelId: 'stub', kind: 'CHAT' },
})).createModel;
const agent = (await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} Orchestrator ${stamp}`, type: 'LLM' },
})).createAgent;
const stored = async () =>
  (await graphql(`query($id: ID!) { agent(id: $id) { tools delegatedTools creatableModelIds } }`, { id: agent.id })).agent;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, "the agent's page"), "the agent's settings are on screen");

  const row = page.locator(`[data-grants="tools"] [data-grant-name="${TOOL}"]`);
  const toggle = row.locator('[data-tool-state]');
  const there = await toggle.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, 'the workspace tool has a row with a visibility control');
  if (there) {
    record((await toggle.getAttribute('data-tool-state')) === 'hide', 'it starts at Hide');
    const states = [];
    for (let press = 0; press < 3; press += 1) {
      await toggle.click();
      states.push(await toggle.getAttribute('data-tool-state'));
    }
    record(states.join(',') === 'offer,always,delegate', `it cycles Offer, Always, Delegate (${states.join(', ')})`);
    record((await toggle.textContent())?.trim() === 'Delegate', 'and says Delegate');

    // Delegate is its own state in the status filter, too.
    const filter = page.locator('[data-tool-status-filter]');
    if (await filter.isVisible().catch(() => false)) {
      const options = await filter.locator('option').allTextContents();
      record(options.includes('Delegate'), `the status filter offers Delegate (${options.join(', ')})`);
    }
  }

  // Dynamic subagents models: tick the model.
  const creatable = page.locator(`[data-grants="creatable models"]`);
  record(await creatable.isVisible().catch(() => false), 'the Dynamic subagents models section is drawn');
  const note = page.locator('[data-creatable-models-note]');
  record(((await note.textContent()) ?? '').startsWith('It cannot create agents'), 'with nothing ticked it says the agent cannot create agents');
  const tick = creatable.locator(`[data-grant-name="${MODEL}"] input[type="checkbox"]`);
  await tick.waitFor({ timeout: 10_000 }).catch(() => undefined);
  await tick.check();
  record(((await note.textContent()) ?? '').startsWith('It may create temporary agents'), 'ticked, it says what the agent may now do');

  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(2000);
  const after = await stored();
  record(after.delegatedTools.includes(TOOL), `the tool is stored as delegated (${after.delegatedTools.join(', ')})`);
  record(!after.tools.includes(TOOL), 'and is not in the tools the agent may use');
  record(after.creatableModelIds.includes(model.id), `the model reached creatableModelIds (${after.creatableModelIds.join(', ')})`);

  // Read back on a fresh page: the row still says Delegate, the model still ticked.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await toggle.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await toggle.getAttribute('data-tool-state')) === 'delegate', 'after a reload the row reads Delegate');
  record(await tick.isChecked().catch(() => false), 'and the model is still ticked');
} finally {
  await sweep();
}

await finish(browser);
