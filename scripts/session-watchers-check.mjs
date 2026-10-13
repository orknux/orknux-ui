/**
 * A session page's Watchers panel.
 *
 * The watchers a session set - what its agent is waiting on - are listed beside
 * the transcript, running ones first, each with what it is for and where it
 * stands, and each opening the workspace's Watchers page. The transcript only
 * shows the call that set one, so without this the waiting is invisible from
 * the session it belongs to.
 *
 * The session and its watchers are stubbed: a watcher exists because a model
 * called watcher_set, as watchers-check says. The server half is
 * WatcherAPITest's `a session lists the watchers it set`. The query itself is
 * asked of the running server too, so a field the panel draws that the server
 * stopped serving still fails here.
 *
 * Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const served = await graphql(`query { __type(name: "Query") { fields { name } } }`).catch(() => null);
record((served?.__type?.fields ?? []).some((one) => one.name === 'sessionWatchers'), 'the server answers sessionWatchers');

const AT = '2026-10-12T09:00:00Z';
const SESSION = { id: '9002', key: 'zz-watchers-check', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 1, createdAt: AT, lastEventAt: AT };
const EVENTS = [{ id: 1, kind: 'AGENT', actor: 'Builder', content: 'Waiting on the build.', result: null, millis: null, at: AT }];

const watcher = (id, extra) => ({
  id, sessionId: SESSION.id, sessionTitle: null, agentName: 'Builder', tool: 'buildStatus', arguments: '{"id":"42"}',
  conditionKind: 'JSONPATH', condition: "$[?(@.status == 'done')]", toolResultPath: '$', intervalSeconds: 60,
  agentCheckIntervalSeconds: 300, timeoutSeconds: 3600, note: null, description: null, status: 'ACTIVE', checks: 3,
  matched: null, outcome: null, createdAt: new Date(Date.now() - 600_000).toISOString(), expiresAt: AT, nextCheckAt: AT,
  lastCheckedAt: null, lastResult: null, finishedAt: null, ...extra,
});
/* Newest first, as the server answers: the ended one is newer, and the panel still puts the running one first. */
const WATCHERS = [
  watcher('2', { tool: 'ticketStatus', status: 'FIRED', outcome: 'Fired on check 2.', finishedAt: new Date(Date.now() - 60_000).toISOString() }),
  watcher('1', { description: 'nightly build of main' }),
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('sessionWatchers(')) return answer({ sessionWatchers: WATCHERS });
  if (body.includes('llmSessionWriting(')) return answer({ llmSessionWriting: null });
  if (body.includes('llmSessionEvents')) return answer({ llmSessionEvents: { totalElements: 1, totalPages: 1, content: EVENTS } });
  if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
const panel = page.locator('[data-session-watchers]');
record(await panel.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the session page has a Watchers panel');
const title = ((await panel.locator('p').first().textContent().catch(() => '')) ?? '').trim();
record(title === 'Watchers', `under the heading Watchers (${title})`);

const rows = panel.locator('[data-session-watcher]');
await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await rows.count()) === 2, `a row per watcher the session set (${await rows.count()})`);
const first = await rows.nth(0).getAttribute('data-session-watcher-status').catch(() => null);
record(first === 'ACTIVE', `the running one first, though the ended one is newer (${first})`);

const text = ((await rows.nth(0).locator('[data-session-watcher-text]').textContent().catch(() => '')) ?? '').trim();
record(text === 'nightly build of main', `a row says what the watcher is for (${text})`);
const toolOnly = ((await rows.nth(1).locator('[data-session-watcher-text]').textContent().catch(() => '')) ?? '').trim();
record(toolOnly === 'ticketStatus', `or the tool it calls where it has no description (${toolOnly})`);
const running = ((await rows.nth(0).locator('[data-session-watcher-state]').textContent().catch(() => '')) ?? '').trim();
record(/^Running · check 3 · set /.test(running), `and where it stands: running, which check (${running})`);
const ended = ((await rows.nth(1).locator('[data-session-watcher-state]').textContent().catch(() => '')) ?? '').trim();
record(/^Fired · /.test(ended), `or how it ended (${ended})`);

const href = await rows.nth(0).getAttribute('href').catch(() => null);
record(href === `/workspace/${WORKSPACE}/watchers`, `a row opens the workspace's Watchers page (${href})`);

/* Beside the transcript, below the notes. */
const box = await panel.boundingBox().catch(() => null);
const notes = await page.locator('[data-session-notes]').boundingBox().catch(() => null);
record(box !== null && notes !== null && box.y > notes.y && Math.abs(box.x - notes.x) <= 1, `in the side column, below the notes (${box?.y} / ${notes?.y})`);

await finish(browser);
