/**
 * AI -> Watchers, and Admin -> Settings -> Watchers. Issue #606.
 *
 * The server half is pinned in WatcherTest, WatcherAPITest and the scheduler
 * test: what a watcher calls, when it fires, what it wakes. This is the other
 * end - that the page is in the AI section, opens on the running watchers with
 * the Active / Finished filter at the top left of the list, draws each row's
 * session, tool call, condition, interval, timeout and when it was set, that
 * Stop sends the mutation and the row leaves, and that Finished draws the
 * ended ones with when they finished. And that Admin Settings draws the three
 * limits with what the server holds.
 *
 * ---------------------------------------------------------------------------
 * Why the rows are stubbed and the contract is not
 *
 * A watcher exists because a model called `watcher_set`, and no mutation makes
 * one - the same reason session-notes-check gives for its notes. So the
 * contract is asked of the running server (the Watcher type serves every field
 * the page draws; the settings answer with their defaults), and only the rows
 * are put in front of a stubbed answer. A page that draws beautifully against
 * a field the server stopped serving still fails here.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const DRAWN = ['id', 'sessionId', 'sessionTitle', 'agentName', 'tool', 'arguments', 'conditionKind', 'condition', 'toolResultPath',
  'intervalSeconds', 'agentCheckIntervalSeconds', 'timeoutSeconds', 'description', 'status', 'outcome', 'createdAt', 'nextCheckAt', 'lastCheckedAt', 'lastResult', 'finishedAt'];
const served = await graphql(`query { __type(name: "Watcher") { fields { name } } }`).catch(() => null);
const fields = (served?.__type?.fields ?? []).map((one) => one.name);
record(DRAWN.every((one) => fields.includes(one)), 'the server serves a watcher every field the page draws');

const listed = await graphql(
  `query ($w: ID!) { watchers(workspaceId: $w) { totalElements } }`,
  { w: WORKSPACE },
).catch(() => null);
record(listed?.watchers !== undefined, 'and answers the page query for this workspace');

const limits = await graphql(`query { watcherSettings { maxSeconds minIntervalSeconds maxPerAgent minAgentCheckSeconds } }`).catch(() => null);
record(limits?.watcherSettings !== undefined, 'and the four limits');

/* ------------------------------------------------------------ the drawing - */

const row = (id, tool, extra = {}) => ({
  id,
  sessionId: `9${id}`,
  sessionTitle: `Release ${id}`,
  agentName: 'Builder',
  tool,
  arguments: '{"id":"42"}',
  conditionKind: 'JSONPATH',
  condition: "$[?(@.status == 'done')]",
  toolResultPath: '$',
  intervalSeconds: 60,
  agentCheckIntervalSeconds: null,
  timeoutSeconds: 3600,
  note: 'tell the team',
  description: null,
  status: 'ACTIVE',
  checks: 2,
  matched: null,
  outcome: null,
  createdAt: new Date(Date.now() - 600_000).toISOString(),
  expiresAt: new Date(Date.now() + 3_000_000).toISOString(),
  nextCheckAt: new Date(Date.now() + 30_000).toISOString(),
  lastCheckedAt: new Date(Date.now() - 20_000).toISOString(),
  lastResult: '{"status":"running"}',
  finishedAt: null,
  ...extra,
});

let active = [row('1', 'buildStatus', { description: 'nightly build of main' }), row('2', 'deployStatus', { conditionKind: 'REGEX', condition: '(?i)deployed', toolResultPath: '$.body', agentCheckIntervalSeconds: 600 })];
const ended = [
  row('3', 'ticketStatus', {
    status: 'FIRED',
    outcome: 'Fired on check 3.',
    finishedAt: new Date(Date.now() - 120_000).toISOString(),
  }),
];
const asked = [];
const stopped = [];

const page_ = (content) => ({ content, page: 0, size: 50, totalElements: content.length, totalPages: 1 });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('watchers(')) {
    const finished = JSON.parse(body).variables?.finished === true;
    asked.push(finished);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { watchers: page_(finished ? ended : active) } }),
    });
    return;
  }
  if (body.includes('stopWatcher(')) {
    const id = String(JSON.parse(body).variables?.id);
    stopped.push(id);
    const was = active.find((one) => one.id === id);
    active = active.filter((one) => one.id !== id);
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { stopWatcher: { ...was, status: 'STOPPED' } } }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/watchers`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the watchers page'), 'the watchers page opens');

const rows = page.locator('[data-watcher-row]');
const arrived = await rows.first().waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(arrived, 'it draws watchers');
record(asked[0] === false, 'it asks for the running ones first');
record((await rows.count()) === 2, 'both running watchers are drawn');

/* The filter, at the top left of the list: left of the list's own left edge plus a little, above it. */
const activeTab = page.locator('[data-watcher-filter="active"]');
const finishedTab = page.locator('[data-watcher-filter="finished"]');
const tabBox = await activeTab.boundingBox().catch(() => null);
const listBox = await page.locator('section').filter({ has: rows.first() }).first().boundingBox().catch(() => null);
record(
  tabBox !== null && listBox !== null && Math.abs(tabBox.x - listBox.x) < 24 && tabBox.y < listBox.y,
  `the Active / Finished filter sits at the top left of the list (${JSON.stringify(tabBox)} over ${JSON.stringify(listBox)})`,
);
record((await activeTab.getAttribute('aria-pressed', { timeout: 5_000 }).catch(() => null)) === 'true', 'Active is chosen by default');

const first = rows.first();
const text = (await first.innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ');
console.log(`first row: ${text}`);
record(text.includes('Release 1'), 'a row names its session');
record((await first.locator(`a[href$="/sessions/91"]`).count()) === 1, 'and links to it');
record(text.includes('buildStatus({"id":"42"})'), 'a row shows the tool call');
// The part of the result its condition is held against, on every row, the whole result included.
const paths = await rows.locator('[data-testid="watcher-result-path"]').allInnerTexts();
const last = await rows.first().locator('[data-testid="watcher-last-check"]').innerText();
record(/^(2\d|3\d) s ago · #2$/.test(last.trim()), `a running row says when it was last checked and how often (${last})`);
record((await rows.first().locator('[data-testid="watcher-last-check"]').getAttribute('title')) === '{"status":"running"}', 'and what the tool returned then, on hover');
const next = await rows.first().locator('[data-testid="watcher-next-check"]').innerText();
record(/^in (1\d|2\d|30) s$/.test(next.trim()), `and when it looks next (${next})`);
record(paths.length === 2 && paths[0].includes('$') && paths[1].includes('$.body'), `each row says which part of the result it watches (${paths.join(' | ')})`);
record(text.includes("$[?(@.status == 'done')]"), 'and the condition');
record(text.includes('60 s') && text.includes('60 min'), 'and the interval and the timeout');
// How often the agent looks for itself, only on the row that asked for it. #618.
const looks = await rows.locator('[data-testid="watcher-agent-check"]').allInnerTexts();
record(looks.length === 1 && /agent 10 min/.test(looks[0]), `a watcher whose agent looks for itself says how often (${looks.join(' | ')})`);
record(/minutes? ago|just now/.test(text), 'and when it was set');
// The label the agent gave it, on its own line over the call, and only where it gave one. #621.
const labels = await rows.locator('[data-testid="watcher-description"]').allInnerTexts();
record(labels.length === 1 && labels[0] === 'nightly build of main', `a watcher's description is drawn where it has one (${labels.join(' | ')})`);
const label = await rows.first().locator('[data-testid="watcher-description"]').boundingBox().catch(() => null);
const call = await rows.first().locator('[data-testid="watcher-description"] + span').boundingBox().catch(() => null);
record(label !== null && call !== null && label.y + label.height <= call.y + 1, 'above the tool call it labels');

/* Stop: the mutation goes, and the row leaves. */
await page.locator('[data-watcher-stop="1"]').click({ timeout: 5_000 }).catch(() => {});
const left = await page
  .waitForFunction(() => document.querySelectorAll('[data-watcher-row]').length === 1, null, { timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(stopped.length === 1 && stopped[0] === '1', 'Stop sends stopWatcher for that watcher');
record(left, 'and the stopped watcher leaves the running list');

/* Finished: the ended ones, with when and how. */
await finishedTab.click({ timeout: 5_000 }).catch(() => {});
const swapped = await page
  .waitForFunction(() => document.querySelector('[data-watcher-row="3"]') !== null, null, { timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(swapped && asked.at(-1) === true, 'Finished asks for and draws the ended watchers');
record((await finishedTab.getAttribute('aria-pressed', { timeout: 5_000 }).catch(() => null)) === 'true', 'and shows itself chosen');
const endedText = (await page.locator('[data-watcher-row="3"]').innerText({ timeout: 5_000 }).catch(() => '')).replace(/\s+/g, ' ');
console.log(`ended row: ${endedText}`);
record((await page.locator('[data-watcher-stop]').count()) === 0, 'an ended watcher offers no Stop');
record(/minutes? ago/.test(endedText.split('ticketStatus')[1] ?? ''), 'and says when it finished');
record((await page.locator('[data-watcher-status="FIRED"]').count()) === 1, 'and how it ended');
record((await page.locator('[data-testid="watcher-next-check"]').count()) === 0, 'an ended watcher has no next check');

/* Done with the stubbed rows; the settings below are the server's own. */
await page.unroute('**/graphql');

/* ------------------------------------------------------- Admin Settings - */

await page.goto(`${BASE}/admin/settings`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the settings page');
const heading = await page.locator('h2#watchers').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(heading, 'Admin Settings has a Watchers section');
const value = async (id) => page.locator(`#${id}`).inputValue({ timeout: 5_000 }).catch(() => null);
const held = limits?.watcherSettings ?? {};
record((await value('watcher-max-seconds')) === String(held.maxSeconds), 'it draws the longest a watcher may run');
record((await value('watcher-min-interval')) === String(held.minIntervalSeconds), 'the shortest interval');
record((await value('watcher-max-per-agent')) === String(held.maxPerAgent), 'and how many one agent may have');
record((await value('watcher-min-agent-check')) === String(held.minAgentCheckSeconds), 'and how often the agent may be woken to look');

await finish(browser);
