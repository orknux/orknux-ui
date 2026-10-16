/**
 * A session page shows what the session has cost, where its workspace says so.
 *
 * Every model call made into a session is added to it - a round that asked for
 * tools as well as one that answered - and priced where the model carries a
 * price (SessionSpendTest). The page draws it under the session's name: tokens
 * in and out, how many were cached, and the money, or that no price is set. A
 * workspace that turned the meter off sees none.
 *
 * The session and the workspace's switch are stubbed; the fields are asked of
 * the running server for their contract. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const fields = async (type) =>
  ((await graphql(`query { __type(name: "${type}") { fields { name } } }`).catch(() => null))?.__type?.fields ?? []).map((one) => one.name);
record((await fields('LlmSession')).includes('spent'), 'the server answers a session\'s spend');
record((await fields('Workspace')).includes('sessionCostShown'), 'and a workspace\'s switch for showing it');

const AT = '2026-10-12T09:00:00Z';
const SESSION = {
  id: '9004', key: 'zz-spend-check', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 1, createdAt: AT, lastEventAt: AT,
  active: false, subagentCount: 0, notes: [],
  spent: { inputTokens: 1500000, outputTokens: 150000, cachedInputTokens: 400000, cost: '4.5', partlyUnpriced: false },
};
const EVENTS = [{ id: 1, kind: 'AGENT', actor: 'Builder', content: 'Done.', result: null, millis: null, at: AT }];

async function show(shown) {
  await page.unroute('**/graphql').catch(() => undefined);
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';
    const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (body.includes('llmSessionEvents')) return answer({ llmSessionEvents: { totalElements: 1, totalPages: 1, content: EVENTS } });
    if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
    if (body.includes('sessionCostShown') && body.includes('workspace(')) {
      const real = await route.fetch();
      const read = await real.json().catch(() => null);
      if (read?.data?.workspace) read.data.workspace.sessionCostShown = shown;
      return route.fulfill({ response: real, body: JSON.stringify(read) });
    }
    return route.continue();
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_500);
}

await show(true);
const meter = page.locator('[data-session-spend]');
const drawn = await meter.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false);
record(drawn, 'the session page shows what it cost');
const said = ((await meter.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
record(said === '1,500,000 in · 150,000 out (400,000 cached) · $4.5000', `tokens in and out, the cached, and the money (${said})`);

await show(false);
record((await page.locator('[data-session-spend]').count()) === 0, 'a workspace that turned it off sees none');

await finish(browser);
