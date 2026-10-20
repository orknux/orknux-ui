/**
 * A workspace may set its own tool rounds, and an agent with none follows it.
 *
 * Workspace Settings has a Tool Rounds box; saved, it is held, and an agent's
 * empty Tool Rounds box shows that number rather than the installation's.
 *
 * Makes one agent and removes it; puts the workspace's number back.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const { createAgent: agent } = await graphql(
  `mutation($input: CreateAgentInput!) { createAgent(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name: `zzRounds ${Date.now()}`, type: 'LLM' } },
);

const save = () => page.getByRole('button', { name: 'Save Changes' }).click();

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
const box = page.locator('#workspace-tool-rounds');
await box.waitFor({ timeout: 20_000 });
// The page fills its boxes from the workspace once it arrives, more than once; typing before that is overwritten.
await page.waitForTimeout(3000);
const was = await box.inputValue();

await box.fill('');
await box.pressSequentially('37');
// Waited for by its answer: "Saved." is a word other parts of the page say too.
await Promise.all([
  page.waitForResponse((r) => (r.request().postData() ?? '').includes('setWorkspaceChatMaxRounds'), { timeout: 10_000 }),
  save(),
]);
await page.reload({ waitUntil: 'domcontentloaded' });
await box.waitFor({ timeout: 20_000 });
await page.waitForTimeout(1500);
record((await box.inputValue()) === '37', `saved, the workspace holds it (${await box.inputValue()})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
const own = page.locator('#agent-max-rounds');
await own.waitFor({ timeout: 20_000 });
await page.waitForTimeout(2000);
const shown = await own.getAttribute('placeholder');
record(shown === '37', `an agent with none shows the workspace's number (${shown})`);

await graphql(`mutation($w: ID!, $c: Int) { setWorkspaceChatMaxRounds(workspaceId: $w, count: $c) { id } }`, {
  w: WORKSPACE,
  c: was === '' ? null : Number(was),
});
await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await finish(browser);
