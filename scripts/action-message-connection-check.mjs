/**
 * An action that sends a message offers only the connections that can send one.
 *
 * Sending is Slack's alone on the server, and the Connection picker listed every
 * connection the workspace had - so a "Send Jira message" action pointed at a
 * Jira connection saved cleanly and was skipped on every run with "cannot send
 * messages yet". The picker under Outgoing Connection now lists Slack's and no
 * other kind.
 *
 * Makes an HTTP connection standing in for Jira, and disconnects it at the end.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page } = await open({ viewport: { width: 1440, height: 1000 } });

const call = async (query, variables) => {
  const answer = await context.request.post(`${BASE}/graphql`, { data: { query, variables } });
  const body = await answer.json();
  if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
  return body.data;
};

const name = `Message check Jira ${Date.now()}`;
const made = await call(
  `mutation ($input: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name, type: 'HTTP', url: 'https://jira.example.invalid' } },
);
const jiraId = made.createWorkspaceConnection.id;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/new`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#action-name', { timeout: 20_000 });
  await page.waitForTimeout(1200);

  await page.locator('#action-connection').click();
  await page.waitForTimeout(400);
  const offered = (await page.locator('[role="option"]').allInnerTexts()).map((one) => one.split('\n')[0].trim());
  console.log(JSON.stringify(offered));
  await page.keyboard.press('Escape');

  record(offered.some((one) => one.startsWith('Slack')), `a Slack connection is offered (${offered.join(', ')})`);
  record(!offered.some((one) => one.startsWith(name)), 'a connection that cannot send a message is not');
} finally {
  await call(`mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: jiraId });
}

await finish(browser);
