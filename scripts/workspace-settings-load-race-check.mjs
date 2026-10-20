/**
 * Workspace Settings does not write a late load over what was typed.
 *
 * The sections below the first few were drawn before the workspace arrived, so
 * their boxes could be typed in - and the load, landing after, put the stored
 * value back while the box still showed the typed one, and the save sent the
 * stored value. The workspace's answer is held back here for two seconds, the
 * box is typed in the moment it can be, and what the save sends is read.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const { workspace } = await graphql(`query($w: ID!) { workspace(id: $w) { chatMaxRounds } }`, { w: WORKSPACE });

await page.route('**/graphql', async (route) => {
  if ((route.request().postData() ?? '').includes('query Workspace(')) await new Promise((r) => setTimeout(r, 2000));
  await route.continue();
});
const sent = [];
page.on('request', (r) => {
  const body = r.postData() ?? '';
  if (body.includes('SetWorkspaceChatMaxRounds')) sent.push(JSON.parse(body).variables.count);
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
const box = page.locator('#workspace-tool-rounds');
await box.waitFor({ timeout: 20_000 });
await box.fill('23');
await page.waitForTimeout(2500);
record((await box.inputValue()) === '23', `what was typed is still in the box (${await box.inputValue()})`);
await page.getByRole('button', { name: 'Save Changes' }).click();
await page.waitForTimeout(1500);
record(sent.length === 1 && sent[0] === 23, `and it is what the save sends (${JSON.stringify(sent)})`);

await graphql(`mutation($w: ID!, $c: Int) { setWorkspaceChatMaxRounds(workspaceId: $w, count: $c) { id } }`, {
  w: WORKSPACE,
  c: workspace.chatMaxRounds,
});
await finish(browser);
