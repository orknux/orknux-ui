/**
 * A session page's side column fits the window, and its panels share it.
 *
 * The column scrolled as a whole once its panels held more than the window,
 * and a full panel took all the height it wanted while the others went below
 * the fold. Now the column is as tall as the room below its top edge and no
 * more; an empty panel keeps its own size, and a full one gives way and
 * scrolls its own list - so together they never need the column to scroll.
 *
 * Three panels are filled with forty rows each and the rest left empty. What
 * is measured is what is drawn: the column's height against the window, that
 * the column itself has nothing to scroll, that each full list does, and that
 * an empty panel is no taller than its heading and its line.
 *
 * The session and its panels are stubbed. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const AT = '2026-10-12T09:00:00Z';
const SESSION = { id: '9005', key: 'zz-rail-fit', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 1, createdAt: AT, lastEventAt: AT, active: false, subagentCount: 0, notes: [] };
const EVENTS = [{ id: 1, kind: 'AGENT', actor: 'Builder', content: 'Done.', result: null, millis: null, at: AT }];
const many = (n, make) => Array.from({ length: n }, (_, at) => make(at + 1));
const TODOS = many(40, (at) => ({ id: at, text: `Step ${at} of the plan`, note: null, done: false }));
const future = new Date(Date.now() + 3_600_000).toISOString();
const TIMERS = many(40, (at) => ({ id: String(at), note: `Reminder ${at}`, createdAt: AT, dueAt: future, rangAt: null }));
const WATCHERS = many(40, (at) => ({
  id: String(at), sessionId: SESSION.id, sessionTitle: null, agentName: 'Builder', tool: `check${at}`, arguments: '{}',
  conditionKind: 'JSONPATH', condition: '$', toolResultPath: '$', intervalSeconds: 60, agentCheckIntervalSeconds: 300,
  timeoutSeconds: 3600, note: null, description: `Watching build ${at}`, status: 'ACTIVE', checks: at, matched: null, outcome: null,
  createdAt: AT, expiresAt: future, nextCheckAt: future, lastCheckedAt: null, lastResult: null, finishedAt: null,
}));

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('sessionTodos')) return answer({ sessionTodos: TODOS });
  if (body.includes('sessionTimers(')) return answer({ sessionTimers: TIMERS });
  if (body.includes('sessionWatchers(')) return answer({ sessionWatchers: WATCHERS });
  if (body.includes('llmSessionWriting(')) return answer({ llmSessionWriting: null });
  if (body.includes('llmSessionEvents')) return answer({ llmSessionEvents: { totalElements: 1, totalPages: 1, content: EVENTS } });
  if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-session-todo]').first().waitFor({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(800);

const seen = await page.evaluate(() => {
  const rail = document.querySelector('[data-session-rail]');
  if (!rail) return null;
  const box = rail.getBoundingClientRect();
  const panels = [...rail.children].map((panel) => {
    const list = panel.querySelector('[class*="_familyList_"]');
    const rect = panel.getBoundingClientRect();
    return {
      label: panel.getAttribute('aria-label') ?? '',
      height: Math.round(rect.height),
      bottom: Math.round(rect.bottom),
      rows: list ? list.children.length : 0,
      listScrolls: list ? list.scrollHeight > list.clientHeight + 2 : false,
    };
  });
  return {
    window: window.innerHeight,
    railBottom: Math.round(box.bottom),
    railScrolls: rail.scrollHeight > rail.clientHeight + 2,
    panels,
  };
});
console.log(JSON.stringify(seen));
if (seen === null) {
  record(false, 'the side column is drawn');
  await finish(browser);
}

record(seen.railBottom <= seen.window, `the column ends inside the window (${seen.railBottom} of ${seen.window})`);
record(!seen.railScrolls, 'the column has nothing of its own to scroll');
const full = seen.panels.filter((one) => one.rows >= 40);
record(full.length === 3, `three panels hold forty rows each (${full.map((one) => one.label).join(', ')})`);
record(full.every((one) => one.listScrolls), 'each full panel scrolls its own list');
record(seen.panels.every((one) => one.bottom <= seen.railBottom + 1), 'and every panel is inside the column, none cut off below it');
const empty = seen.panels.filter((one) => one.rows === 0 && /Boxes|Ports|Notes/.test(one.label));
record(empty.length > 0 && empty.every((one) => one.height <= 90), `an empty panel keeps its own size (${empty.map((one) => `${one.label}: ${one.height}px`).join(', ')})`);

await finish(browser);
