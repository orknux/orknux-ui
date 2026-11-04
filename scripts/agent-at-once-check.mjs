/**
 * An agent says how many of the agents it asks may be working at once.
 *
 * From a Slack bot on an Azure deployment with a capacity of 200: it started
 * five audits together and every one of them failed on the token rate limit,
 * so the people in the thread had to tell it to work one at a time. The number
 * was the installation's alone; now an agent carries its own, drawn beside the
 * agents it may ask and only where there is one to ask. Empty follows the
 * installation, whose number the empty box shows.
 *
 * Measured on the server: a box that shows a number and stores nothing is the
 * failure this is for. Makes two agents and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1200 } });

const PREFIX = 'zzAtOnce';
const sweep = async () => {
  const { workspaceAgents } = await graphql(
    `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceAgents.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = async (name) =>
  (await graphql(`mutation($input: CreateAgentInput!) { createAgent(input: $input) { id name } }`, {
    input: { workspaceId: WORKSPACE, name, type: 'LLM' },
  })).createAgent;

const searcher = await made(`${PREFIX} Searcher`);
const bot = await made(`${PREFIX} Bot`);
const stored = async () => (await graphql(`query($id: ID!) { agent(id: $id) { maxSubagentsAtOnce } }`, { id: bot.id })).agent.maxSubagentsAtOnce;
const box = page.locator('#agent-max-subagents-at-once');
const settings = `${BASE}/workspace/${WORKSPACE}/agents/${bot.id}/settings`;

try {
  // Nobody to ask: no number to set, so no box.
  await page.goto(settings, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, "the agent's page"), "the agent's settings are on screen");
  await page.waitForTimeout(1000);
  record(!(await box.isVisible().catch(() => false)), 'an agent with nobody to ask has no Agents at Once box');

  // Given somebody to ask, the box is there, empty, showing the installation's number.
  await graphql(
    `mutation($id: ID!, $name: String!, $ids: [ID!]) { updateAgent(id: $id, input: { name: $name, agentIds: $ids }) { id } }`,
    { id: bot.id, name: bot.name, ids: [searcher.id] },
  );
  const { workspace } = await graphql(`query($w: ID!) { workspace(id: $w) { agentMaxSubagentsAtOnceDefault } }`, { w: WORKSPACE });
  await page.reload({ waitUntil: 'domcontentloaded' });
  const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, 'given an agent to ask, the box is drawn');
  if (there) {
    record((await box.inputValue()) === '', 'empty, because it follows the installation');
    // Read off the workspace, which the page asks for after it draws the form.
    await page
      .waitForFunction(() => (document.querySelector('#agent-max-subagents-at-once')?.getAttribute('placeholder') ?? '') !== '', null, { timeout: 10_000 })
      .catch(() => undefined);
    const shows = await box.getAttribute('placeholder');
    record(shows === String(workspace.agentMaxSubagentsAtOnceDefault), `and showing the installation's number (${shows})`);

    // One at a time, saved, and stored on the agent.
    await box.fill('1');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);
    record((await stored()) === 1, `one at a time reached the server (${await stored()})`);

    // The label and its box sit on one line, as Tool Rounds does.
    const sameLine = await page.evaluate(() => {
      const label = document.querySelector('label[for="agent-max-subagents-at-once"]')?.getBoundingClientRect();
      const input = document.querySelector('#agent-max-subagents-at-once')?.getBoundingClientRect();
      return label && input ? Math.abs(label.y + label.height / 2 - (input.y + input.height / 2)) : null;
    });
    record(sameLine !== null && sameLine < 12, `its label and box are on one line (${sameLine?.toFixed(1)}px apart)`);

    // Emptied is the installation's number again.
    await box.fill('');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);
    record((await stored()) === null, 'and emptying it puts it back to the installation’s');
  }

  // Outside one to twenty is refused, in words.
  const refused = await graphql(
    `mutation($id: ID!, $name: String!) { updateAgent(id: $id, input: { name: $name, maxSubagentsAtOnce: 0 }) { id } }`,
    { id: bot.id, name: bot.name },
  ).then(() => null, (cause) => String(cause?.message ?? cause));
  record(refused !== null && refused.includes('between 1 and 20'), `nought is refused (${refused})`);
} finally {
  await sweep();
}

await finish(browser);
