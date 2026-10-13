/**
 * A session page's Timers panel.
 *
 * The reminders a session's agent set with timer_set - what will wake it - are
 * listed beside the transcript, waiting ones first and soonest first, each with
 * its note and when it comes up, then the ones that rang. The transcript only
 * shows the call that set one, so without this a pending reminder is invisible
 * from the session it will wake.
 *
 * The session and its timers are stubbed. The server half is
 * SessionTimerAPITest. The query itself is asked of the running server too, so
 * a field the panel draws that the server stopped serving still fails here.
 *
 * Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const served = await graphql(`query { __type(name: "Query") { fields { name } } }`).catch(() => null);
record((served?.__type?.fields ?? []).some((one) => one.name === 'sessionTimers'), 'the server answers sessionTimers');

const AT = '2026-10-12T09:00:00Z';
const SESSION = { id: '9003', key: 'zz-timers-check', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 1, createdAt: AT, lastEventAt: AT };
const EVENTS = [{ id: 1, kind: 'AGENT', actor: 'Builder', content: 'I will say hi again shortly.', result: null, millis: null, at: AT }];

const from = (seconds) => new Date(Date.now() + seconds * 1000).toISOString();
/*
 * Newest first, as the server answers. "said hi" is a reminder its agent
 * re-arms on every ring: three rang and the fourth is waiting, and all four are
 * one row - one each was a panel of identical rows, and a waiting row that
 * appeared and folded away on every ring. "old one" rang once and was not set
 * again.
 */
const TIMERS = [
  { id: '6', note: 'said hi', createdAt: from(-5), dueAt: from(90), rangAt: null },
  { id: '5', note: 'said hi', createdAt: from(-30), dueAt: from(-20), rangAt: from(-20) },
  { id: '4', note: 'said hi', createdAt: from(-40), dueAt: from(-30), rangAt: from(-30) },
  { id: '3', note: 'said hi', createdAt: from(-50), dueAt: from(-40), rangAt: from(-40) },
  { id: '2', note: 'look at the report', createdAt: from(-60), dueAt: from(3600), rangAt: null },
  { id: '1', note: 'say hi again', createdAt: from(-90), dueAt: from(300), rangAt: null },
  { id: '0', note: 'old one', createdAt: from(-900), dueAt: from(-800), rangAt: from(-800) },
];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('sessionTimers(')) return answer({ sessionTimers: TIMERS });
  if (body.includes('sessionWatchers(')) return answer({ sessionWatchers: [] });
  if (body.includes('llmSessionWriting(')) return answer({ llmSessionWriting: null });
  if (body.includes('llmSessionEvents')) return answer({ llmSessionEvents: { totalElements: 1, totalPages: 1, content: EVENTS } });
  if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
const panel = page.locator('[data-session-timers]');
record(await panel.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the session page has a Timers panel');
const title = ((await panel.locator('p').first().textContent().catch(() => '')) ?? '').trim();
record(title === 'Timers', `under the heading Timers (${title})`);

const rows = panel.locator('[data-session-timer]');
await rows.first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await rows.count()) === 4, `a row per note, waiting and rung together (${await rows.count()})`);
const order = await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-session-timer')));
record(order.join('|') === 'said hi|say hi again|look at the report|old one', `waiting first and soonest first, then what only rang (${order.join('|')})`);

const state = async (n) => ((await rows.nth(n).locator('[data-session-timer-state]').textContent().catch(() => '')) ?? '').trim();
const rearmed = await state(0);
record(/^Due in [1-9][0-9] s · rang 3 times$/.test(rearmed), `a re-armed reminder says when it is next due and how often it rang (${rearmed})`);
const text = ((await rows.nth(1).locator('[data-session-timer-text]').textContent().catch(() => '')) ?? '').trim();
record(text === 'say hi again', `a row says what the reminder is for (${text})`);
const due = await state(1);
record(/^Due in (299|300) s$|^Due in 5 min$/.test(due), `and when it comes up (${due})`);
const rang = await state(3);
record(/^Rang /.test(rang) && !/times/.test(rang), `or that it rang (${rang})`);

/* Beside the transcript, above the to-do list. */
const box = await panel.boundingBox().catch(() => null);
const todo = await page.locator('[data-session-todos]').boundingBox().catch(() => null);
record(box !== null && todo !== null && box.y < todo.y && Math.abs(box.x - todo.x) <= 1, `in the side column, above the to-do list (${box?.y} / ${todo?.y})`);

await finish(browser);
