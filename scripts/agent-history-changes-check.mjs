/**
 * An agent's history says what each save changed, and shows a version as JSON
 * against the one before it.
 *
 * An agent lost another it could ask, and its History showed only the prompt -
 * which the save had not touched - so nothing on the page said which save took
 * the grant. Here an agent is given one to ask and has it taken away again: the
 * newest save's row has to name the agent it removed, and opening it has to
 * draw the JSON with the grant marked.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const TAG = `hist${Date.now().toString(36)}`;
const made = [];

const agent = async (name) => {
  const { createAgent } = await graphql(
    'mutation($i: CreateAgentInput!) { createAgent(input: $i) { id } }',
    { i: { workspaceId: WORKSPACE, name, type: 'LLM' } },
  );
  made.push(createAgent.id);
  return createAgent.id;
};
const grant = (id, name, ids) =>
  graphql('mutation($id: ID!, $i: UpdateAgentInput!) { updateAgent(id: $id, input: $i) { id } }', {
    id,
    i: { name, agentIds: ids },
  });

try {
  const lead = await agent(`${TAG}-lead`);
  const helper = await agent(`${TAG}-helper`);
  await grant(lead, `${TAG}-lead`, [helper]);
  await grant(lead, `${TAG}-lead`, []);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${lead}/settings`, { waitUntil: 'domcontentloaded' });
  const history = page.getByRole('region', { name: 'History' });
  await history.waitFor({ timeout: 20_000 });
  await history.locator('[data-history-toggle]').click();

  const current = history.locator('[data-history-current]');
  await current.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const said = await current.locator('[data-history-changes]').innerText().catch(() => '');
  record(said.includes(`−${TAG}-helper`), `the newest save says it removed the agent (${JSON.stringify(said)})`);

  await current.getByRole('button').first().click();
  const diff = history.locator('[data-json-diff]');
  await diff.waitFor({ timeout: 10_000 }).catch(() => undefined);
  // The diff is worked out in a worker, after the text is drawn.
  const removed = diff.locator('[class*="delete"]');
  await removed.first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const marked = await removed.count();
  record(marked > 0, `what the save took away is marked as removed (${marked})`);
  // Monaco draws its spaces as non-breaking ones.
  const json = (await diff.innerText().catch(() => '')).replace(/ /g, ' ');
  record(json.includes('"agentIds"'), 'opening it draws the version as JSON');
  record(json.includes(`${TAG}-helper (#${helper})`), 'with the removed agent named, not only its id');
  const lines = await diff.locator('.view-line').count();
  record(lines < 40, `the lines the save did not touch are folded away (${lines} drawn)`);
  await page.screenshot({ path: shot('agent-history-changes.png'), fullPage: true });
} finally {
  for (const id of made) {
    await graphql('mutation($id: ID!) { deleteAgent(id: $id) }', { id }).catch(() => undefined);
  }
}

await finish(browser);
