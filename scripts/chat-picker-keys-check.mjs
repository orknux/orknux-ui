/*
 * The chat's agent picker walks with the arrow keys.
 *
 * Type to narrow it, Down and Up move over the agents that can answer - an
 * inactive one is skipped, since it cannot be chosen - and Enter hands the chat
 * to the one walked to. Two scratch agents of its own, so the order is known.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const STAMP = `zzKeys${Date.now()}`;

const { models } = await graphql(`query ($w: ID!) { models(workspaceId: $w) { id enabled kind } }`, { w: WORKSPACE });
const model = models.find((one) => one.enabled && one.kind === 'CHAT');
if (model === undefined) {
  record(false, `workspace ${WORKSPACE} has a chat model to give the scratch agents`);
  await finish(browser);
}

async function agent(name, enabled) {
  const { createAgent } = await graphql(`mutation ($input: CreateAgentInput!) { createAgent(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, name, type: 'LLM' },
  });
  await graphql(`mutation ($id: ID!, $input: UpdateAgentInput!) { updateAgent(id: $id, input: $input) { id } }`, {
    id: createAgent.id,
    input: { name, modelId: model.id },
  });
  if (!enabled) {
    await graphql(`mutation ($id: ID!) { setAgentEnabled(id: $id, enabled: false) { id } }`, { id: createAgent.id });
  }
  return createAgent.id;
}

const first = await agent(`${STAMP} alpha`, true);
const off = await agent(`${STAMP} beta`, false);
const second = await agent(`${STAMP} gamma`, true);

const { startChat } = await graphql(`mutation ($input: StartChatInput!) { startChat(input: $input) { id } }`, {
  input: { workspaceId: WORKSPACE, title: `zz keys ${Date.now()}` },
});

try {
  await page.goto(`${BASE}/chat/${startChat.id}`, { waitUntil: 'domcontentloaded' });
  if (!(await drawn(page, 'the chat'))) await finish(browser);

  await page.locator('button[class*="_modelButton_"]').first().click();
  const search = page.getByLabel('Search models');
  await search.waitFor({ timeout: 10_000 });
  await search.fill(STAMP);
  const focused = () => page.locator('[data-picker-entry][data-focused="true"]').getAttribute('data-picker-entry').catch(() => null);

  record((await focused()) === null, 'nothing is walked to before an arrow is pressed');
  await search.press('ArrowDown');
  record((await focused()) === first, 'Down goes to the first agent');
  await search.press('ArrowDown');
  record((await focused()) === second, 'and Down again skips the inactive one to the next');
  await search.press('ArrowDown');
  record((await focused()) === first, 'and wraps round at the end');
  await search.press('ArrowUp');
  record((await focused()) === second, 'Up goes back, wrapping the other way');

  const lit = await page
    .locator(`[data-picker-entry="${second}"]`)
    .evaluate((one) => getComputedStyle(one).backgroundColor)
    .catch(() => null);
  const plain = await page
    .locator(`[data-picker-entry="${first}"]`)
    .evaluate((one) => getComputedStyle(one).backgroundColor)
    .catch(() => null);
  record(lit !== null && lit !== plain, `the agent walked to is drawn lit (${lit} against ${plain})`);

  await search.press('Enter');
  await page.waitForTimeout(1500);
  const { chatSession } = await graphql(`query ($id: ID!) { chatSession(id: $id) { agentId } }`, { id: startChat.id });
  record(String(chatSession.agentId) === String(second), 'Enter hands the chat to it');
  record((await page.getByLabel('Search models').count()) === 0, 'and closes the picker');
  record(off !== null, 'the inactive agent was there to be skipped');
} finally {
  await graphql(`mutation ($id: ID!) { deleteChat(id: $id) }`, { id: startChat.id }).catch(() => undefined);
  for (const id of [first, off, second]) {
    await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id }).catch(() => undefined);
  }
}

await finish(browser);
