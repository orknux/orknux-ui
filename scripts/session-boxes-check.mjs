/**
 * A session's boxes: the panel under its scratchpads, the Box tab beside the
 * Scratchpad tab, and a box session's log read in place of the transcript.
 *
 * An agent granted a box label opens box sessions as it works, and the session
 * page lists them below its scratchpads - each with the family's dot, green
 * while the box session is active and orange once it is not. Clicking one, or
 * the Box tab (which opens the newest), draws that box session's log where the
 * transcript was: a line per event, its whole JSON a press away, followed from
 * `nextSeq` while the box session is active, and the box's own message where it
 * could not hand the log over.
 *
 * A command's line opens onto what it printed, below the line: a 240px window
 * holding the first stretch, read on as it is scrolled and followed while the
 * command runs, with Jump to top, Jump to bottom and a search in its corner and
 * a handle under it that drags it taller. The event's JSON is behind a toggle.
 *
 * A panel row reads name, label and the box session's id (the dot is the state),
 * and `?box=` in the address names the box session open: a link opens on it,
 * opening another replaces it, and leaving the Box tab drops it.
 *
 * ---------------------------------------------------------------------------
 * Why the boxes are stubbed and the contract is not
 *
 * A box session exists because a model called a box tool, and asking a real
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
  query.includes('sessionBoxes') && query.includes('sessionBoxLog'),
  "the server answers a session's boxes and a box session's log",
);
const sessionBox = await fieldsOf('SessionBox');
record(
  ['id', 'boxId', 'boxName', 'boxKind', 'boxLabel', 'remoteSessionId', 'active', 'status', 'createdAt', 'lastUsedAt'].every((one) =>
    sessionBox.includes(one),
  ),
  `a session box carries every field the panel draws (${sessionBox.join(' ')})`,
);
const boxOutput = await fieldsOf('BoxOutput');
record(
  query.includes('sessionBoxOutput') &&
    ['text', 'offset', 'nextOffset', 'done', 'available', 'message', 'shownLimit'].every((one) => boxOutput.includes(one)),
  `the server answers one execution's output a stretch at a time (${boxOutput.join(' ')})`,
);
const boxLog = await fieldsOf('BoxLog');
const boxEvent = await fieldsOf('BoxEvent');
record(
  ['events', 'nextSeq', 'available', 'message'].every((one) => boxLog.includes(one)) &&
    ['seq', 'at', 'type', 'data'].every((one) => boxEvent.includes(one)),
  'and a log carries its events, where to read on from, and whether it could be had',
);

/* ------------------------------------------------------------ the drawing - */

const WITH_BOXES = '525252';
const WITHOUT = '525253';
const NOW = Date.now();
const iso = (ago) => new Date(NOW - ago).toISOString();

const BOXES = [
  // Older, and closed: orange, and its box could not hand the log over.
  {
    id: 'st-1', boxId: 'local', boxName: 'Local box', boxKind: 'LOCAL', boxLabel: null, remoteSessionId: 'ses-old',
    active: false, status: 'CLOSED', createdAt: iso(3_600_000), lastUsedAt: iso(3_000_000),
  },
  // Newer, and still working: green, and the one the Box tab opens.
  {
    id: 'st-2', boxId: '7', boxName: 'Build box', boxKind: 'REMOTE', boxLabel: 'builders', remoteSessionId: 'ses-0f3c9a1e-7b2d-4c55-9e1a-2d6b8f4a9c10-build-box-builders-0f3c9a1e7b2d',
    active: true, status: 'RUNNING', createdAt: iso(60_000), lastUsedAt: iso(5_000),
  },
];

const EVENTS = [
  { seq: 1, at: iso(50_000), type: 'session.created', data: JSON.stringify({ runtime: 'local', workdir: '/work' }) },
  { seq: 2, at: iso(40_000), type: 'execution.started', data: JSON.stringify({ command: 'ls -la', cwd: '/work', executionId: 'ex-1' }) },
  { seq: 3, at: iso(30_000), type: 'execution.finished', data: JSON.stringify({ exitCode: 0, durationMs: 12, executionId: 'ex-1' }) },
];
const LATER = { seq: 4, at: iso(1_000), type: 'execution.started', data: JSON.stringify({ command: 'make build', executionId: 'ex-2' }) };
const UNAVAILABLE = 'The box that held this session has been removed.';

const askedAfter = [];
/** How often the session the panel calls closed was asked for its log. */
let closedAsked = 0;

/*
 * Output. ex-1 finished long ago and printed 3000 numbered lines, every
 * hundredth carrying MARKER - far more than one 16 KB read, so the panel has
 * to read on as it is scrolled. ex-2 is still running and prints a line a
 * second, so the panel has to follow it. ASCII only, so a byte is a character
 * and an offset can be checked by eye.
 */
const EX1 = Array.from({ length: 3000 }, (_, at) => {
  const n = String(at + 1).padStart(5, '0');
  return `line ${n} ${(at + 1) % 100 === 0 ? 'MARKER ' : ''}${'x'.repeat(30)}\n`;
}).join('');
const EX2_FROM = Date.now();
const ex2Text = () =>
  Array.from({ length: 1 + Math.floor((Date.now() - EX2_FROM) / 1000) }, (_, at) => `tick ${at}\n`).join('');
const EX2_NOTE = 'Output as last recorded.';
/** What the server says the interface may hold of ex-1 - less than it printed, so the cap is reached. */
const EX1_SHOWN = 65_536;
/** MARKER lines inside that limit. */
const EX1_MARKERS = EX1.slice(0, EX1_SHOWN).split('MARKER').length - 1;
/** Every output read, as asked. */
const askedOutput = [];

const json = (route, data) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const variables = JSON.parse(body || '{}').variables ?? {};
  if (body.includes('sessionBoxOutput(')) {
    const offset = variables.offset ?? 0;
    const limit = variables.limit ?? 16_384;
    askedOutput.push({ executionId: variables.executionId, offset, limit });
    const all = variables.executionId === 'ex-1' ? EX1 : ex2Text();
    const text = all.slice(offset, offset + limit);
    await json(route, {
      sessionBoxOutput: {
        text,
        offset,
        nextOffset: offset + text.length,
        done: variables.executionId === 'ex-1' && offset + text.length >= all.length,
        available: true,
        message: variables.executionId === 'ex-2' ? EX2_NOTE : null,
        shownLimit: variables.executionId === 'ex-1' ? EX1_SHOWN : 1_048_576,
      },
    });
    return;
  }
  if (body.includes('sessionBoxLog(')) {
    if (variables.sessionBoxId === 'st-1') {
      closedAsked += 1;
      await json(route, { sessionBoxLog: { events: [], nextSeq: 0, available: false, message: UNAVAILABLE } });
      return;
    }
    const after = variables.after ?? null;
    askedAfter.push(after);
    const events = after === null ? EVENTS : after >= 3 ? [LATER] : [];
    await json(route, { sessionBoxLog: { events, nextSeq: after === null ? 3 : 4, available: true, message: null } });
    return;
  }
  if (body.includes('sessionBoxes(')) {
    await json(route, { sessionBoxes: variables.sessionId === WITHOUT ? [] : BOXES });
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
        id: variables.id ?? WITH_BOXES, workspaceId: WORKSPACE, key: `boxes-check:${variables.id}`, keyPrefix: 'boxes-check',
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

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITH_BOXES}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the session'), 'a session opens');

/* The panel, under the scratchpads. */
const panel = page.locator('[data-session-boxes]');
const there = await panel.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(there, 'the session draws a Boxes panel');
const padsBox = await page.locator('aside', { hasText: 'plan.md' }).first().boundingBox().catch(() => null);
const panelBox = await panel.boundingBox().catch(() => null);
record(
  padsBox !== null && panelBox !== null && panelBox.y >= padsBox.y + padsBox.height - 1 && Math.abs(panelBox.x - padsBox.x) < 4,
  `and it is below the Scratchpads panel, in the same rail (${JSON.stringify(panelBox)} under ${JSON.stringify(padsBox)})`,
);

const rows = panel.locator('[data-session-box]');
record((await rows.count()) === 2, `it lists both box sessions (${await rows.count()})`);

/* Each row: the box's name, its label and the box session's id - the dot says the state, so no status word. */
const NEW_ID = BOXES[1].remoteSessionId;
const idCell = page.locator('[data-session-box="st-2"] [data-session-box-id]');
const idShown = await idCell
  .evaluate((one) => ({
    text: one.textContent,
    title: one.getAttribute('title'),
    font: getComputedStyle(one).fontFamily,
    cut: one.scrollWidth > one.clientWidth,
    right: one.getBoundingClientRect().right,
    rowRight: one.closest('[data-session-box]').getBoundingClientRect().right,
    left: one.getBoundingClientRect().left,
    height: one.getBoundingClientRect().height,
    scroll: one.scrollWidth,
    client: one.clientWidth,
    wrap: getComputedStyle(one).whiteSpace,
  }), null, { timeout: 5_000 })
  .catch(() => null);
record(idShown !== null && idShown.text === NEW_ID && idShown.title === NEW_ID, `a row shows its box session's id, whole on hover (${JSON.stringify(idShown)})`);
record(idShown !== null && /mono|courier|consolas/i.test(idShown.font), `in the monospace face (${idShown?.font})`);
record(idShown !== null && idShown.cut && idShown.right <= idShown.rowRight + 1, `and a long one is cut to fit the row rather than widening it (${JSON.stringify(idShown)})`);
const besideId = await page
  .locator('[data-session-box="st-2"]')
  .evaluate((row) => {
    const box = (sel) => row.querySelector(sel)?.getBoundingClientRect() ?? null;
    const label = row.querySelector('[data-session-box-label]');
    return {
      text: row.innerText,
      label: label === null ? null : { width: label.getBoundingClientRect().width, whole: label.scrollWidth <= label.clientWidth },
      idRight: box('[data-session-box-id]')?.right ?? null,
      labelLeft: box('[data-session-box-label]')?.left ?? null,
    };
  }, null, { timeout: 5_000 })
  .catch(() => null);
/* The box session's id, then its label - the box's name is not repeated on every row; it is on hover. */
record(
  besideId !== null && besideId.label?.whole === true && besideId.idRight !== null && besideId.labelLeft !== null &&
    besideId.labelLeft >= besideId.idRight - 1,
  `the id comes first and the label, drawn whole, after it (${JSON.stringify(besideId)})`,
);
record(besideId !== null && !besideId.text.includes('Build box'), `and the box's name is not on the row (${JSON.stringify(besideId?.text)})`);
const labelShown = (await page.locator('[data-session-box="st-2"] [data-session-box-label]').innerText().catch(() => '')).trim();
record(labelShown === 'builders', `and the box's label (${labelShown})`);
record((await page.locator('[data-session-box="st-1"] [data-session-box-label]').count()) === 0, 'a box with no label shows none');
const rowWords = (await panel.innerText().catch(() => '')).toUpperCase();
record(!rowWords.includes('RUNNING') && !rowWords.includes('CLOSED'), `no row says its status in words (${JSON.stringify(rowWords)})`);
record(((await rows.first().getAttribute('title').catch(() => '')) ?? '').match(/CLOSED|RUNNING/) !== null, 'the status is still on hover');

/* The dots: the family's colours, green while active and orange once not. */
const green = await painted('var(--color-success, #3fb950)');
const orange = await painted('var(--color-warning, #d29922)');
const dotOf = (id) =>
  page.locator(`[data-session-box="${id}"] [data-session-box-dot]`).evaluate((one) => getComputedStyle(one).backgroundColor);
const activeDot = await dotOf('st-2').catch(() => null);
const idleDot = await dotOf('st-1').catch(() => null);
record(activeDot === green, `the active box session's dot is green (${activeDot} against ${green})`);
record(idleDot === orange, `the closed one's is orange (${idleDot} against ${orange})`);
const familyDot = await page.evaluate(() => {
  const dot = document.querySelector('[data-session-box="st-2"] [data-session-box-dot]');
  return dot === null ? null : { width: dot.getBoundingClientRect().width, height: dot.getBoundingClientRect().height };
});
record(familyDot !== null && familyDot.width === 8 && familyDot.height === 8, `drawn the size the family's dots are (${JSON.stringify(familyDot)})`);

/* The Box tab, to the right of Scratchpad, on the same line. */
const scratchTab = page.locator('[data-subview-tab="scratchpad"]');
const boxTab = page.locator('[data-subview-tab="box"]');
const scratchBox = await scratchTab.boundingBox().catch(() => null);
const boxRect = await boxTab.boundingBox().catch(() => null);
record(
  scratchBox !== null && boxRect !== null && boxRect.x >= scratchBox.x + scratchBox.width && Math.abs(boxRect.y - scratchBox.y) < 4,
  `the Box tab is right of the Scratchpad tab (${JSON.stringify(boxRect)} beside ${JSON.stringify(scratchBox)})`,
);
record(!(await boxTab.isDisabled().catch(() => true)), 'and it can be pressed while the session has boxes');

/* Pressed, it opens the newest box session's log in place of the transcript. */
await boxTab.click();
const log = page.locator('[data-box-log]');
/** The `box` parameter of the address, or null. */
const boxParam = () => new URL(page.url()).searchParams.get('box');
await log.waitFor({ timeout: 10_000 }).catch(() => {});
record((await page.locator('[data-subview]').getAttribute('data-subview').catch(() => null)) === 'box', 'the body is the box view');
record((await log.getAttribute('data-box-log').catch(() => null)) === 'st-2', 'and it is the newest box session');
await page.waitForTimeout(300);
record(boxParam() === 'st-2', `the address names it (${page.url()})`);
record((await page.locator('input[type="search"]').count()) === 0, 'the transcript is not drawn beside it');
record((await boxTab.getAttribute('aria-selected')) === 'true', 'the Box tab says it is the one open');

const lines = log.locator('[data-box-event]');
await lines.first().waitFor({ timeout: 10_000 }).catch(() => {});

/* Newest first by default, and the order button turns it round. */
const seqs = async () => (await lines.evaluateAll((all) => all.map((one) => Number(one.getAttribute('data-box-event')))));
const newest = await seqs();
record(newest.length > 1 && newest[0] > newest[newest.length - 1], `the newest event is on top (${newest.join(', ')})`);
await page.locator('[data-box-log-order]').click();
const oldest = await seqs();
record(oldest[0] < oldest[oldest.length - 1], `and the order button turns it round (${oldest.join(', ')})`);
record((await lines.count()) >= EVENTS.length, `every event is a line (${await lines.count()})`);
const summary = (await log.locator('[data-box-event="2"] [data-box-event-summary]').innerText().catch(() => '')).trim();
record(summary.startsWith('$ ls -la'), `a command reads as the command (${summary})`);
const lineBox = await log.locator('[data-box-event="2"] button').first().boundingBox().catch(() => null);
record(lineBox !== null && lineBox.height < 40, `and an event is one line (${lineBox?.height}px)`);

/* A command's line opens onto what it printed, below the line. */
await log.locator('[data-box-event="2"] button').first().click();
const output = log.locator('[data-box-event="2"] [data-box-output="ex-1"]');
const outputText = output.locator('[data-box-output-text]');
await outputText.waitFor({ timeout: 10_000 }).catch(() => {});
const shownText = await outputText.innerText().catch(() => '');
record(shownText.startsWith('line 00001'), `pressing a command's line shows its output (${JSON.stringify(shownText.slice(0, 20))})`);
const headerBox = await log.locator('[data-box-event="2"] button').first().boundingBox().catch(() => null);
const frame = output.locator('[data-box-output-frame]');
const frameBox = await frame.boundingBox().catch(() => null);
record(
  headerBox !== null && frameBox !== null && frameBox.y >= headerBox.y + headerBox.height - 1,
  `below the line's header (${JSON.stringify(frameBox)} under ${JSON.stringify(headerBox)})`,
);
record(frameBox !== null && Math.abs(frameBox.height - 240) <= 4, `in a window about 240px tall (${frameBox?.height})`);
record(
  shownText.length > 0 && shownText.length < EX1.length && !shownText.includes('line 03000'),
  `and only the first stretch of it (${shownText.length} of ${EX1.length} characters)`,
);
record(
  (await log.locator('[data-box-event="3"] button').first().getAttribute('aria-expanded')) === 'true' &&
    (await log.locator('[data-box-output]').count()) === 1,
  "the same execution's finished line says it is open too, and the output is drawn once",
);

/* Scrolled to the bottom, it asks for the next stretch from where the first ended, and adds it under. */
const scroller = output.locator('[data-box-output-scroller]');
const firstEnd = askedOutput.find((one) => one.executionId === 'ex-1')?.limit ?? 16_384;
await scroller.evaluate((box) => {
  box.scrollTop = box.scrollHeight;
  box.dispatchEvent(new Event('scroll'));
}, null, { timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(1_000);
record(
  askedOutput.some((one) => one.executionId === 'ex-1' && one.offset === firstEnd),
  `scrolling to the bottom asks for the next stretch from ${firstEnd} (${JSON.stringify(askedOutput.map((one) => one.offset))})`,
);
const grown = await outputText.innerText().catch(() => '');
record(
  grown.length > shownText.length && grown.startsWith(shownText.slice(0, 1000)) && EX1.startsWith(grown.trimEnd()),
  `and adds it under what was there (${shownText.length} then ${grown.length})`,
);

/* Jump to the top and to the bottom. */
const scrollOf = () =>
  scroller
    .evaluate((box) => ({ top: box.scrollTop, height: box.scrollHeight, client: box.clientHeight }), null, { timeout: 5_000 })
    .catch(() => ({ top: -1, height: 0, client: 0 }));
await output.locator('[data-box-output-top]').click({ timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(200);
record((await scrollOf()).top === 0, 'Jump to top puts the output at its start');
await output.locator('[data-box-output-bottom]').click({ timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(1_500);
const atBottom = await scrollOf();
const whole = await outputText.innerText().catch(() => '');
record(
  whole.trimEnd() === EX1.slice(0, EX1_SHOWN).trimEnd(),
  `Jump to bottom reads the rest first, up to the administrator's limit (${whole.length} of ${EX1.length}, limit ${EX1_SHOWN})`,
);
const pastLimit = askedOutput.filter((one) => one.executionId === 'ex-1' && one.offset + one.limit > EX1_SHOWN);
record(pastLimit.length === 0, `and never asks for more than the limit (${JSON.stringify(pastLimit)})`);
const capNote = (await output.locator('[data-box-output-status]').innerText().catch(() => '')).trim();
record(capNote === 'Only the first 64 KB of this output is shown here.', `and says how much it shows (${capNote})`);
record(
  atBottom.top > 0 && atBottom.top + atBottom.client >= atBottom.height - 2,
  `and goes there (${JSON.stringify(atBottom)})`,
);

/* Search: every match highlighted, counted, and the current one brought into view. */
const search = output.locator('[data-box-output-search]');
await search.fill('marker', { timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(300);
const count = await output.locator('[data-box-output-count]').getAttribute('data-box-output-count').catch(() => null);
const marks = await output.locator('mark[data-box-output-match]').count();
record(count === String(EX1_MARKERS) && marks === EX1_MARKERS, `searching highlights every match and counts them (${count} counted, ${marks} drawn)`);
const shownCount = (await output.locator('[data-box-output-count]').innerText().catch(() => '')).trim();
record(shownCount === `1/${EX1_MARKERS}`, `and says which one is current (${shownCount})`);
await search.press('Enter', { timeout: 5_000 }).catch(() => {});
await search.press('Enter', { timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(300);
const currentIndex = await output.locator('[data-box-output-match-current]').getAttribute('data-box-output-match').catch(() => null);
record(currentIndex === '2', `Enter moves to the next match (${currentIndex})`);
await search.press('Shift+Enter', { timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(300);
const backIndex = await output.locator('[data-box-output-match-current]').getAttribute('data-box-output-match').catch(() => null);
record(backIndex === '1', `and Shift+Enter to the one before (${backIndex})`);
const inView = await page.evaluate(() => {
  const mark = document.querySelector('[data-box-output-match-current]');
  const box = mark?.closest('[data-box-output-scroller]');
  if (!mark || !box) return null;
  const m = mark.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  return { inside: m.top >= b.top && m.bottom <= b.bottom, mark: m.top, from: b.top, to: b.bottom, text: mark.textContent };
});
record(inView !== null && inView.inside && inView.text === 'MARKER', `the current match is scrolled into the window (${JSON.stringify(inView)})`);
await search.fill('', { timeout: 5_000 }).catch(() => {});

/* Dragged taller by the handle under it. */
const handle = output.locator('[role="separator"]');
const handleBox = await handle.boundingBox().catch(() => null);
if (handleBox !== null) {
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 100, { steps: 5 });
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2 + 200, { steps: 5 });
  await page.mouse.up();
}
const taller = await frame.boundingBox().catch(() => null);
record(
  frameBox !== null && taller !== null && taller.height >= frameBox.height + 180,
  `dragging the handle down makes the output taller (${frameBox?.height} then ${taller?.height})`,
);

/* The raw JSON is still there, behind a small toggle. */
record((await log.locator('[data-box-event="2"] pre:not([data-box-output-text])').count()) === 0, 'the JSON is not the main thing');
await log.locator('[data-box-event="2"] [data-box-event-json-toggle]').click({ timeout: 5_000 }).catch(() => {});
const pre = (await log.locator('[data-box-event="2"] pre:not([data-box-output-text])').innerText().catch(() => '')).trim();
record(pre.includes('"command": "ls -la"'), 'the JSON toggle shows the event, indented');

/* A line that is not a command still opens straight onto its JSON. */
await log.locator('[data-box-event="1"] button').first().click();
const plain = (await log.locator('[data-box-event="1"] pre').innerText().catch(() => '')).trim();
record(plain.includes('"runtime": "local"'), 'pressing a line with no command shows its JSON, indented');

/* Followed while active: asked again from nextSeq, and what is new is added under the rest. */
await page.waitForTimeout(4_500);
record(askedAfter.some((after) => after === 3), `the log is asked again from where it ended (${JSON.stringify(askedAfter)})`);
record((await log.locator('[data-box-event="4"]').count()) === 1, 'and the new event is drawn');
record((await seqs()).at(-1) === 4, 'at the end, while the order is oldest first');
record((await lines.count()) === EVENTS.length + 1, 'without drawing the old ones twice');

/* A command still running: its output is followed, and the box's word about it sits quietly above. */
await log.locator('[data-box-event="4"] button').first().click();
const running = log.locator('[data-box-output="ex-2"]');
const runningText = running.locator('[data-box-output-text]');
await runningText.waitFor({ timeout: 10_000 }).catch(() => {});
const ticksBefore = (await runningText.innerText().catch(() => '')).trim().split('\n').length;
record(ticksBefore >= 1, `a running command shows what it has printed so far (${ticksBefore} lines)`);
const note = (await running.locator('[data-box-output-note]').innerText().catch(() => '')).trim();
const noteBox = await running.locator('[data-box-output-note]').boundingBox().catch(() => null);
const runningFrame = await running.locator('[data-box-output-frame]').boundingBox().catch(() => null);
record(
  note === EX2_NOTE && noteBox !== null && runningFrame !== null && noteBox.y + noteBox.height <= runningFrame.y + 1,
  `a message with the text is a note above it (${note})`,
);
await page.waitForTimeout(4_500);
const ticksAfter = (await runningText.innerText().catch(() => '')).trim().split('\n').length;
record(
  askedOutput.some((one) => one.executionId === 'ex-2' && one.offset > 0) && ticksAfter > ticksBefore,
  `and it is followed while it runs (${ticksBefore} then ${ticksAfter} lines)`,
);

/* Follow mode: on for a running command, keeping the newest line in view; a scroll up stops it, the toggle restarts it. */
const followButton = running.locator('[data-box-output-follow]');
const runningScroller = running.locator('[data-box-output-scroller]');
const atEnd = () =>
  runningScroller.evaluate((one) => ({ top: one.scrollTop, room: one.scrollHeight - one.clientHeight })).catch(() => null);
record((await followButton.getAttribute('data-box-output-follow').catch(() => null)) === 'on', 'a running command is followed from the start');
await page.waitForTimeout(2_500);
const followed = await atEnd();
record(followed !== null && followed.room > 0 && followed.top >= followed.room - 2, `and the panel keeps to its newest line (${JSON.stringify(followed)})`);
await runningScroller.hover();
await page.mouse.wheel(0, -2_000);
await page.waitForTimeout(400);
record((await followButton.getAttribute('data-box-output-follow').catch(() => null)) === 'off', 'scrolling up stops following');
await page.waitForTimeout(2_500);
const stayed = await atEnd();
record(stayed !== null && stayed.top < stayed.room - 2, `and new output no longer pulls the panel down (${JSON.stringify(stayed)})`);
await followButton.click();
await page.waitForTimeout(800);
const resumed = await atEnd();
record(
  (await followButton.getAttribute('data-box-output-follow').catch(() => null)) === 'on' && resumed !== null && resumed.top >= resumed.room - 2,
  `Follow, pressed, goes back to the newest line (${JSON.stringify(resumed)})`,
);
record(
  (await log.locator('[data-box-output="ex-1"] [data-box-output-follow]').getAttribute('data-box-output-follow').catch(() => 'off')) === 'off',
  'a finished command is not followed: it opens at its top',
);

/* The closed one, from the panel: its box's own word on why there is no log. */
await page.locator('[data-session-box="st-1"]').click();
const unavailable = page.locator('[data-box-log-unavailable]');
await unavailable.waitFor({ timeout: 10_000 }).catch(() => {});
record((await log.getAttribute('data-box-log').catch(() => null)) === 'st-1', 'a row in the panel opens that box session');
await page.waitForTimeout(300);
record(boxParam() === 'st-1', `the address names the box session open (${page.url()})`);
record((await unavailable.innerText().catch(() => '')).trim() === UNAVAILABLE, 'and where the log could not be had, says why');
record((await page.locator('[data-session-box="st-1"]').getAttribute('aria-current')) === 'page', 'the row says it is the one open');
/* Followed even so: the panel's word on whether it is active can be behind, and a log that stops being asked shows nothing new until a reload. */
const before = closedAsked;
await page.waitForTimeout(4_500);
record(closedAsked > before, `an open log is still asked again when the panel calls its session closed (${before} then ${closedAsked})`);

/* Back to the transcript. */
await page.getByRole('tab', { name: /Transcript|Transkrypcja/ }).click();
record((await page.locator('[data-box-log]').count()) === 0, 'the Transcript tab puts the transcript back');
await page.waitForTimeout(300);
record(boxParam() === null, `and the address drops the box (${page.url()})`);

/* A link to one box session - what an agent hands a person - opens on its log, with its row lit. */
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITH_BOXES}?box=st-2`, { waitUntil: 'domcontentloaded' });
const linked = page.locator('[data-box-log="st-2"]');
await linked.waitFor({ timeout: 20_000 }).catch(() => {});
record((await linked.count()) === 1, '?box= opens that box session\'s log on arrival');
record((await page.locator('[data-subview-tab="box"]').getAttribute('aria-selected').catch(() => null)) === 'true', 'on the Box tab');
record((await page.locator('[data-session-box="st-2"]').getAttribute('aria-current').catch(() => null)) === 'page', 'with its row lit in the panel');
await page.locator('[data-box-log] [data-box-event]').first().waitFor({ timeout: 10_000 }).catch(() => {});
record((await page.locator('[data-box-log] [data-box-event]').count()) >= EVENTS.length, 'and its events drawn');
const historyBefore = await page.evaluate(() => history.length);
await page.locator('[data-session-box="st-1"]').click();
await page.locator('[data-box-log="st-1"]').waitFor({ timeout: 10_000 }).catch(() => {});
await page.waitForTimeout(300);
record(boxParam() === 'st-1', `opening another box from the panel puts it in the address (${page.url()})`);
record((await page.evaluate(() => history.length)) === historyBefore, 'replacing the entry rather than adding one');
await page.locator('[data-subview-tab="scratchpad"]').click({ timeout: 5_000 }).catch(() => {});
await page.waitForTimeout(500);
record(boxParam() === null, `and the Scratchpad tab drops it again (${page.url()})`);

/* A link to a box the session never opened falls back to the transcript, and the address stops claiming it. */
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITH_BOXES}?box=st-nope`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-session-boxes] [data-session-box]').first().waitFor({ timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(1_000);
record(
  (await page.locator('[data-box-log]').count()) === 0 &&
    (await page.locator('[data-subview]').getAttribute('data-subview').catch(() => null)) === 'transcript',
  'a ?box= the session does not have opens the transcript',
);
record(boxParam() === null, `and is dropped from the address (${page.url()})`);

/* A session that opened no boxes: the tab is there and cannot be pressed. */
await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${WITHOUT}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'a session without boxes'), 'a session without boxes opens');
await page.locator('[data-session-boxes]').waitFor({ timeout: 20_000 }).catch(() => {});
record((await page.locator('[data-session-box]').count()) === 0, 'its panel lists none');
record(await page.locator('[data-subview-tab="box"]').isDisabled().catch(() => false), 'and its Box tab is disabled');

await finish(browser);
