/**
 * A session page's side column grows with its panels and has no scrollbar of
 * its own; when they are taller than the window, the page scrolls.
 *
 * The column used to scroll as a whole, a scrollbar inside the page beside the
 * transcript's. What is wanted is the page's own scroll: each panel keeps its
 * list's cap and scrolls that list, and the column is as tall as its panels.
 *
 * Three panels are filled with forty rows each. Measured on the page: the
 * column has nothing of its own to scroll and is not clipped, each full list
 * scrolls inside its panel, and the page is what scrolls to reach the last one.
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
  const rail = document.querySelector('[data-session-rail]') ?? document.querySelector('[class*="_railInner_"]');
  if (!rail) return null;
  const outer = rail.parentElement;
  const panels = [...rail.children].map((panel) => {
    const list = panel.querySelector('[class*="_familyList_"]');
    return { label: panel.getAttribute('aria-label') ?? '', rows: list ? list.children.length : 0, listScrolls: list ? list.scrollHeight > list.clientHeight + 2 : false };
  });
  const scrollers = [...document.querySelectorAll('*')].filter((one) => one.scrollHeight > one.clientHeight + 2 && ['auto', 'scroll'].includes(getComputedStyle(one).overflowY));
  const last = rail.lastElementChild.getBoundingClientRect();
  return {
    railScrolls: rail.scrollHeight > rail.clientHeight + 2 || ['auto', 'scroll'].includes(getComputedStyle(rail).overflowY),
    outerClips: ['hidden', 'clip'].includes(getComputedStyle(outer).overflowY),
    pageScrolls: scrollers.some((one) => !rail.contains(one) && one !== rail && one.contains(rail)),
    lastBottom: Math.round(last.bottom),
    window: window.innerHeight,
    panels,
  };
});
console.log(JSON.stringify(seen));
if (seen === null) {
  record(false, 'the side column is drawn');
  await finish(browser);
}

record(!seen.railScrolls, 'the column has no scrollbar of its own');
record(!seen.outerClips, 'and nothing around it clips it');
const full = seen.panels.filter((one) => one.rows >= 40);
record(full.length === 3, `three panels hold forty rows each (${full.map((one) => one.label).join(', ')})`);
record(full.every((one) => one.listScrolls), 'each full panel scrolls its own list');
record(seen.lastBottom > seen.window && seen.pageScrolls, `the panels run past the window and the page is what scrolls (last panel ends at ${seen.lastBottom} of ${seen.window})`);

await finish(browser);
