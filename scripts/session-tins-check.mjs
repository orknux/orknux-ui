/**
 * A session's tins: the panel under its scratchpads, the Tin tab beside the
 * Scratchpad tab, and a tin session's log read in place of the transcript.
 *
 * An agent granted a tin label opens tin sessions as it works, and the session
 * page lists them below its scratchpads - each with the family's dot, green
 * while the tin session is active and orange once it is not. Clicking one, or
 * the Tin tab (which opens the newest), draws that tin session's log where the
 * transcript was: a line per event, its whole JSON a press away, followed from
 * `nextSeq` while the tin session is active, and the tin's own message where it
 * could not hand the log over.
 *
 * ---------------------------------------------------------------------------
 * Why the tins are stubbed and the contract is not
 *
 * A tin session exists because a model called a tin tool, and asking a real
 * model to do that on cue would make this a measurement of the provider's mood
 * - the reason session-family-check gives. So the contract is asked of the
 * running server (the types serve every field the page draws, and Query
 * answers both queries) and only the rows are put in front of a stubbed answer.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

/* -------------------------------------------------- the server's contract - */

const fieldsOf = async (type) =>
  ((await graphql(`query ($n: String!) { __type(name: $n) { fields { name } } }`, { n: type }).catch(() => null))?.__type
    ?.fields ?? []).map((one) => one.name);

const query = await fieldsOf('Query');
record(
  query.includes('sessionTins') && query.includes('sessionTinLog'),
  "the server answers a session's tins and a tin session's log",
);
const sessionTin = await fieldsOf('SessionTin');
record(
  ['id', 'tinId', 'tinName', 'tinKind', 'remoteSessionId', 'active', 'status', 'createdAt', 'lastUsedAt'].every((one) =>
    sessionTin.includes(one),
  ),
  `a session tin carries every field the panel draws (${sessionTin.join(' ')})`,
);
const tinLog = await fieldsOf('TinLog');
const tinEvent = await fieldsOf('TinEvent');
record(
  ['events', 'nextSeq', 'available', 'message'].every((one) => tinLog.includes(one)) &&
    ['seq', 'at', 'type', 'data'].every((one) => tinEvent.includes(one)),
  'and a log carries its events, where to read on from, and whether it could be had',
);

/* ------------------------------------------------------------ the drawing - */

const WITH_TINS = '525252';
const WITHOUT = '525253';
const NOW = Date.now();
const iso = (ago) => new Date(NOW - ago).toISOString();

const TINS = [
  // Older, and closed: orange, and its tin could not hand the log over.
  {
    id: 'st-1', tinId: 'local', tinName: 'Local tin', tinKind: 'LOCAL', remoteSessionId: 'ses-old',
    active: false, status: 'CLOSED', createdAt: iso(3_600_000), lastUsedAt: iso(3_000_000),
  },
  // Newer, and still working: green, and the one the Tin tab opens.
  {
    id: 'st-2', tinId: '7', tinName: 'Build box', tinKind: 'REMOTE', remoteSessionId: 'ses-new',
    active: true, status: 'RUNNING', createdAt: iso(60_000), lastUsedAt: iso(5_000),
  },
];

const EVENTS = [
  { seq: 1, at: iso(50_000), type: 'session.created', data: JSON.stringify({ runtime: 'local', workdir: '/work' }) },
  { seq: 2, at: iso(40_000), type: 'exec.started', data: JSON.stringify({ command: 'ls -la', cwd: '/work' }) },
  { seq: 3, at: iso(30_000), type: 'exec.finished', data: JSON.stringify({ exitCode: 0, durationMs: 12 }) },
];
const LATER = { seq: 4, at: iso(1_000), type: 'exec.started', data: JSON.stringify({ command: 'make build' }) };
const UNAVAILABLE = 'The tin that held this session has been removed.';

const askedAfter = [];

const json = (route, data) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const variables = JSON.parse(body || '{}').variables ?? {};
  if (body.includes('sessionTinLog(')) {
    if (variables.sessionTinId === 'st-1') {
      await json(route, { sessionTinLog: { events: [], nextSeq: 0, available: false, message: UNAVAILABLE } });
      return;
    }
    const after = variables.after ?? null;
    askedAfter.push(after);
    const events = after === null ? EVENTS : after >= 3 ? [LATER] : [];
    await json(route, { sessionTinLog: { events, nextSeq: after === null ? 3 : 4, available: true, message: null } });
    return;
  }
  if (body.includes('sessionTins(')) {
    await json(route, { sessionTins: variables.sessionId === WITHOUT ? [] : TINS });
    return;
  }
  if (body.includes('sessionScratchpads(')) {
    await json(route, {
      sessionScratchpads: [{ name: 'plan.md', description: null, bytes: 120, shared: false, ownedHere: true }],
    });
    return;
  }
  if (body.includes('llmSessionFamily(')) {
    await json(route, { llmSessionFamily: [] });
    return;
  }
  if (body.includes('llmSessionEvents(')) {
    await json(route, { llmSessionEvents: { totalElements: 0, content: [] } });
    return;
  }
  if (body.includes('sessionExecutions(')) {
    await json(route, { sessionExecutions: [] });
    return;
  }
  if (body.includes('llmSession(')) {
    await json(route, {
      llmSession: {
        id: variables.id ?? WITH_TINS, workspaceId: WORKSPACE, key: `tins-check:${variables.id}`, keyPrefix: 'tins-check',
        eventCount: 0, createdAt: iso(4_000_000), lastEventAt: null, notes: [],
      },
    });
    return;
  }
  await route.continue();
});

/** A colour as the browser paints it, so a token and a computed style compare as equals. */
const painted = (value) =>
  page.evaluate((css) => {
    const probe = document.createElement('span');
    probe.style.background = css;
    document.body.appendChild(probe);
    const got = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return got;
  }, value);

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITH_TINS}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the session'), 'a session opens');

/* The panel, under the scratchpads. */
const panel = page.locator('[data-session-tins]');
const there = await panel.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the session draws a Tins panel');
const padsBox = await page.locator('aside', { hasText: 'plan.md' }).first().boundingBox().catch(() => null);
const panelBox = await panel.boundingBox().catch(() => null);
record(
  padsBox !== null && panelBox !== null && panelBox.y >= padsBox.y + padsBox.height - 1 && Math.abs(panelBox.x - padsBox.x) < 4,
  `and it is below the Scratchpads panel, in the same rail (${JSON.stringify(panelBox)} under ${JSON.stringify(padsBox)})`,
);

const rows = panel.locator('[data-session-tin]');
record((await rows.count()) === 2, `it lists both tin sessions (${await rows.count()})`);

/* The dots: the family's colours, green while active and orange once not. */
const green = await painted('var(--color-success, #3fb950)');
const orange = await painted('var(--color-warning, #d29922)');
const dotOf = (id) =>
  page.locator(`[data-session-tin="${id}"] [data-session-tin-dot]`).evaluate((one) => getComputedStyle(one).backgroundColor);
const activeDot = await dotOf('st-2').catch(() => null);
const idleDot = await dotOf('st-1').catch(() => null);
record(activeDot === green, `the active tin session's dot is green (${activeDot} against ${green})`);
record(idleDot === orange, `the closed one's is orange (${idleDot} against ${orange})`);
const familyDot = await page.evaluate(() => {
  const dot = document.querySelector('[data-session-tin="st-2"] [data-session-tin-dot]');
  return dot === null ? null : { width: dot.getBoundingClientRect().width, height: dot.getBoundingClientRect().height };
});
record(familyDot !== null && familyDot.width === 8 && familyDot.height === 8, `drawn the size the family's dots are (${JSON.stringify(familyDot)})`);

/* The Tin tab, to the right of Scratchpad, on the same line. */
const scratchTab = page.locator('[data-subview-tab="scratchpad"]');
const tinTab = page.locator('[data-subview-tab="tin"]');
const scratchBox = await scratchTab.boundingBox().catch(() => null);
const tinBox = await tinTab.boundingBox().catch(() => null);
record(
  scratchBox !== null && tinBox !== null && tinBox.x >= scratchBox.x + scratchBox.width && Math.abs(tinBox.y - scratchBox.y) < 4,
  `the Tin tab is right of the Scratchpad tab (${JSON.stringify(tinBox)} beside ${JSON.stringify(scratchBox)})`,
);
record(!(await tinTab.isDisabled().catch(() => true)), 'and it can be pressed while the session has tins');

/* Pressed, it opens the newest tin session's log in place of the transcript. */
await tinTab.click();
const log = page.locator('[data-tin-log]');
await log.waitFor({ timeout: 10_000 }).catch(() => {});
record((await page.locator('[data-subview]').getAttribute('data-subview').catch(() => null)) === 'tin', 'the body is the tin view');
record((await log.getAttribute('data-tin-log').catch(() => null)) === 'st-2', 'and it is the newest tin session');
record((await page.locator('input[type="search"]').count()) === 0, 'the transcript is not drawn beside it');
record((await tinTab.getAttribute('aria-selected')) === 'true', 'the Tin tab says it is the one open');

const lines = log.locator('[data-tin-event]');
await lines.first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await lines.count()) >= EVENTS.length, `every event is a line (${await lines.count()})`);
const summary = (await log.locator('[data-tin-event="2"] [data-tin-event-summary]').innerText().catch(() => '')).trim();
record(summary.startsWith('$ ls -la'), `a command reads as the command (${summary})`);
const lineBox = await log.locator('[data-tin-event="2"] button').first().boundingBox().catch(() => null);
record(lineBox !== null && lineBox.height < 40, `and an event is one line (${lineBox?.height}px)`);

/* The whole JSON, a press away. */
await log.locator('[data-tin-event="2"] button').first().click();
const pre = (await log.locator('[data-tin-event="2"] pre').innerText().catch(() => '')).trim();
record(pre.includes('"command": "ls -la"'), 'pressing a line shows its JSON, indented');

/* Followed while active: asked again from nextSeq, and what is new is added under the rest. */
await page.waitForTimeout(4_500);
record(askedAfter.some((after) => after === 3), `the log is asked again from where it ended (${JSON.stringify(askedAfter)})`);
record((await log.locator('[data-tin-event="4"]').count()) === 1, 'and the new event is drawn');
record((await lines.count()) === EVENTS.length + 1, 'without drawing the old ones twice');

/* The closed one, from the panel: its tin's own word on why there is no log. */
await page.locator('[data-session-tin="st-1"]').click();
const unavailable = page.locator('[data-tin-log-unavailable]');
await unavailable.waitFor({ timeout: 10_000 }).catch(() => {});
record((await log.getAttribute('data-tin-log').catch(() => null)) === 'st-1', 'a row in the panel opens that tin session');
record((await unavailable.innerText().catch(() => '')).trim() === UNAVAILABLE, 'and where the log could not be had, says why');
record((await page.locator('[data-session-tin="st-1"]').getAttribute('aria-current')) === 'page', 'the row says it is the one open');

/* Back to the transcript. */
await page.getByRole('tab', { name: /Transcript|Transkrypcja/ }).click();
record((await page.locator('[data-tin-log]').count()) === 0, 'the Transcript tab puts the transcript back');

/* A session that opened no tins: the tab is there and cannot be pressed. */
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITHOUT}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'a session without tins'), 'a session without tins opens');
await page.locator('[data-session-tins]').waitFor({ timeout: 20_000 }).catch(() => {});
record((await page.locator('[data-session-tin]').count()) === 0, 'its panel lists none');
record(await page.locator('[data-subview-tab="tin"]').isDisabled().catch(() => false), 'and its Tin tab is disabled');

await finish(browser);
