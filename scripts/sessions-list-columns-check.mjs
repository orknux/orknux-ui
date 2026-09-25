/**
 * The sessions list carries a status dot and a subagent count. Issues #403, #404.
 *
 * A green dot where an agent is at work in a session and a plain one where it
 * has gone quiet - the same rule the family panel uses - and a count of the
 * sessions each one fanned out into, blank where it fanned out into none.
 *
 * ---------------------------------------------------------------------------
 * Why the list is stubbed
 *
 * What makes a session active - a line still going, or one within the last
 * minute - and what its subagent count is are LlmSessionTest's business,
 * proved against a real recorder there. Here the *drawing* is under test: the
 * dot lights for the active row and not the quiet one, and the count reads
 * where there is one. So the rows are a fixture.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const ROWS = [
  {
    id: '900001', workspaceId: WORKSPACE, key: 'issue:42', keyPrefix: 'issue', eventCount: 7,
    createdAt: '2026-09-24T09:00:00Z', lastEventAt: '2026-09-24T09:05:00Z', active: true, subagentCount: 3,
  },
  {
    id: '900002', workspaceId: WORKSPACE, key: 'thread:C9', keyPrefix: 'thread', eventCount: 2,
    createdAt: '2026-09-24T08:00:00Z', lastEventAt: '2026-09-24T08:01:00Z', active: false, subagentCount: 0,
  },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessions(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSessions: { totalElements: ROWS.length, content: ROWS } } }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the sessions list'), 'the sessions list opens');

const row = (key) => page.locator('a', { hasText: key }).first();
await row('issue:42').waitFor({ timeout: 20_000 }).catch(() => undefined);

/* --------------------------------------------------------- the status dot - */

const dotOf = (key) => row(key).locator('[data-session-status]');
record(
  (await dotOf('issue:42').getAttribute('data-session-status')) === 'active',
  'the session an agent is at work in reads as active',
);
record(
  (await dotOf('thread:C9').getAttribute('data-session-status')) === 'inactive',
  'the one that has gone quiet reads as inactive',
);
// The active dot is actually painted green, the quiet one is not.
const litGreen = await dotOf('issue:42').evaluate((el) => {
  const bg = getComputedStyle(el).backgroundColor;
  const [, r, g, b] = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg)?.map(Number) ?? [];
  return g > r && g > b;
});
record(litGreen, 'the active dot is drawn green, not the row colour');
const quietGrey = await dotOf('thread:C9').evaluate((el) => {
  const bg = getComputedStyle(el).backgroundColor;
  const [, r, g, b] = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(bg)?.map(Number) ?? [];
  return !(g > r && g > b);
});
record(quietGrey, 'the inactive dot is not green');

/* ---------------------------------------------------- the subagent count -- */

record(
  (await row('issue:42').locator('[data-session-subagents]').getAttribute('data-session-subagents')) === '3',
  'a session that fanned out shows how many it fanned into',
);
const fannedText = await row('issue:42').locator('[data-session-subagents]').innerText();
record(fannedText.trim() === '3', `and draws the number (${JSON.stringify(fannedText)})`);
const plainText = await row('thread:C9').locator('[data-session-subagents]').innerText();
record(plainText.trim() !== '0', `a plain conversation shows nothing rather than a nought (${JSON.stringify(plainText)})`);

await finish(browser);
