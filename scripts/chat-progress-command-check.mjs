/**
 * The progress commands are offered in a chat's command menu, beside the skills.
 *
 * `!progress-none` and its siblings set how much the agent says while it works,
 * for the message they are in. Nobody remembers them, so the menu the
 * workspace's marker opens lists them - read from the server's own list - once
 * the chat has an agent; a chat with no agent has no progress messages to set.
 *
 * Makes a chat of its own, gives it the workspace's first agent, and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspace, installationSettings, workspaceAgents, progressCommands } = await graphql(
  `query($w: ID!) {
     workspace(id: $w) { commandMarker commandMarkerDefault }
     installationSettings { commandMarker }
     workspaceAgents(workspaceId: $w, size: 50) { content { id enabled } }
     progressCommands { key }
   }`,
  { w: WORKSPACE },
).catch(() => ({ workspace: null, installationSettings: { commandMarker: '!' }, workspaceAgents: { content: [] }, progressCommands: [] }));
const MARKER = workspace?.commandMarker ?? workspace?.commandMarkerDefault ?? installationSettings.commandMarker;
const agent = (workspaceAgents?.content ?? []).find((one) => one.enabled);
record(agent !== undefined, `the workspace has an agent to talk to (${agent?.id})`);

const started = await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id } }', {
  input: { workspaceId: WORKSPACE, title: `zzProgressCommand ${Date.now()}` },
});
const CHAT = started.startChat.id;
if (agent !== undefined) {
  await graphql('mutation($id: ID!, $agent: ID!) { chooseChatAgent(id: $id, agentId: $agent) { agentId } }', { id: CHAT, agent: agent.id });
}

try {
  await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('#chat-composer');
  await box.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await box.click();
  await box.pressSequentially(`${MARKER}progress`, { delay: 30 });

  const menu = page.locator('[role="listbox"][aria-label="Skills"]');
  const opened = await menu.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  const rows = opened ? await menu.locator('[role="option"]').allInnerTexts() : [];
  const wanted = (progressCommands ?? []).map((one) => `${MARKER}${one.key}`);
  record(
    wanted.length === 4 && wanted.every((word) => rows.some((row) => row.includes(word))),
    `the menu offers every progress command (${JSON.stringify(rows.map((row) => row.split('\n')[0]))})`,
  );
  const none = rows.find((row) => row.includes(`${MARKER}progress-none`)) ?? '';
  record(/Progress messages for this message: None/.test(none), `each says what it sets (${JSON.stringify(none.replace(/\n/g, ' / '))})`);

  await box.press('Tab');
  const completed = await box.inputValue();
  record(completed.startsWith(`${MARKER}progress-`) && completed.endsWith(' '), `Tab writes the command in (${JSON.stringify(completed)})`);
} finally {
  await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: CHAT }).catch(() => undefined);
  await finish(browser);
}
