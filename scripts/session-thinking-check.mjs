/**
 * What a session says about a model that is thinking.
 *
 * A thinking line is written while the model is still doing it and carries no
 * duration until it stops, so the record holds two states and the page has to
 * tell them apart: one that is still going, and one that took four seconds.
 * Drawn the same way, a transcript of a run in flight reads as a transcript of
 * a run that finished - which is the state somebody watching a long turn is
 * staring at.
 *
 * The transcript is stubbed rather than produced. Making a real one means a
 * reasoning model answering, which is a provider, a key and a model that
 * thinks - none of which a check should need, and none of which is what this
 * is about: what a line *looks like* given what the record holds is a fact
 * about this page alone. `AgentNodeRunnerTest` is where the other half lives -
 * that a node's turn writes those lines at all, and closes them when the model
 * stops.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const AT = '2026-09-20T09:00:00Z';

/** One session and four lines: a question, a settled think, an open one, an answer. */
const EVENTS = [
  { id: 1, kind: 'USER', actor: 'Incident node', content: 'What failed last night?', result: null, millis: null, at: AT },
  {
    id: 2,
    kind: 'THINKING',
    actor: 'Reviewer',
    content: 'Checking the runs. The database timed out twice.',
    result: null,
    millis: 4200,
    at: AT,
  },
  {
    id: 3,
    kind: 'THINKING',
    actor: 'Reviewer',
    content: 'Now looking at what the second one',
    result: null,
    // No duration: the record's way of saying the model has not stopped.
    millis: null,
    at: AT,
  },
  { id: 4, kind: 'AGENT', actor: 'Reviewer', content: 'The database was the cause.', result: null, millis: null, at: AT },
  /* A thought long enough to fold: 4,000 characters, about 1,000 tokens. */
  { id: 5, kind: 'THINKING', actor: 'Reviewer', content: 'Long thought. '.repeat(285) + 'abcdefghij', result: null, millis: 9000, at: AT },
];

const SESSION = {
  id: '9001',
  key: 'zz-thinking-check',
  keyPrefix: 'zz',
  workspaceId: WORKSPACE,
  eventCount: EVENTS.length,
  createdAt: AT,
  lastEventAt: AT,
};

/* What the model is writing this second, as the server holds it in memory. */
const WRITING = { agent: 'Reviewer', tool: 'orkbox_write', chars: 12345, since: AT };

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('llmSessionWriting(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSessionWriting: WRITING } }),
    });
    return;
  }
  if (body.includes('llmSessionEvents')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { llmSessionEvents: { totalElements: EVENTS.length, totalPages: 1, content: EVENTS } },
      }),
    });
    return;
  }
  if (body.includes('llmSession(')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { llmSession: SESSION } }),
    });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('article[class*="_event_"]', { timeout: 20_000 });

/** Every line drawn: its badge, and whatever is said beside the badge. */
const lines = () =>
  page.$$eval('article[class*="_event_"]', (all) =>
    all.map((one) => ({
      kind: one.querySelector('[class*="_kindBadge_"]')?.textContent?.trim() ?? '',
      thought: one.querySelector('[class*="_thoughtFor_"]')?.textContent?.trim() ?? '',
      still: one.querySelector('[class*="_stillThinking_"]')?.textContent?.trim() ?? '',
      text: one.querySelector('pre')?.textContent?.trim() ?? '',
    })),
  );

const drawn = await lines();

record(drawn.length === EVENTS.length, `every line of the transcript is drawn (${drawn.length})`);

const thinking = drawn.filter((one) => one.kind === 'Thinking');
record(thinking.length === 3, `every thinking line is drawn as thinking (${thinking.length})`);

record(
  thinking.some((one) => one.text.startsWith('Checking the runs.')),
  'what the model thought is on the page, not only that it thought',
);

/*
 * The settled one says what it cost, coarsely. Nobody waiting on a model cares
 * about the last hundred milliseconds of it, and a figure that precise reads as
 * a measurement of the machine rather than an account of the wait.
 */
const settled = thinking.find((one) => one.thought !== '');
record(settled?.thought === 'thought for 4.2s', `a settled line says how long it took (${settled?.thought ?? 'nothing'})`);
record(settled?.still === '', 'and does not also claim to be going on');

/*
 * And the open one says it has not stopped. This is the assertion the page
 * exists for: a line with no duration drawn like a settled one is a run in
 * flight that reads as a run that ended.
 */
const going = thinking.find((one) => one.still !== '');
record(going?.still === 'still thinking', `an unsettled line says the model has not stopped (${going?.still ?? 'nothing'})`);
record(going?.thought === '', 'and claims no duration it does not have');

/*
 * A thought and the answer after it are told apart by more than the badge: a
 * different rule down the left and a different fill. In the agent's own colour
 * they were twins.
 */
const looks = await page.$$eval('article[class*="_event_"]', (all) =>
  all.map((one) => ({
    kind: one.querySelector('[class*="_kindBadge_"]')?.textContent?.trim() ?? '',
    rule: getComputedStyle(one).borderLeftColor,
    fill: getComputedStyle(one).backgroundColor,
  })),
);
const thought = looks.find((one) => one.kind === 'Thinking');
const answer = looks.find((one) => one.kind === 'Agent');
record(thought && answer && thought.rule !== answer.rule, `a thought's rule is not the answer's (${thought?.rule} / ${answer?.rule})`);
record(thought && answer && thought.fill !== answer.fill, `nor its fill (${thought?.fill} / ${answer?.fill})`);

/*
 * Narrowing to Thinking leaves the thinking and nothing else - the kind is a
 * filter like the others rather than a badge that happens to be drawn.
 */
await page.getByRole('button', { name: 'Thinking', exact: true }).click();
await page.waitForTimeout(400);
record(
  (await page.locator('[class*="_kindChip_"][aria-pressed="true"]').innerText()).trim() === 'Thinking',
  'Thinking is one of the kinds the transcript filters by',
);

/*
 * A folded line opens from an icon at its top right, which says how much it
 * holds in tokens as well as characters - an output limit is counted in tokens -
 * and stays where it was once the block is open. Both sit on the line's head,
 * beside the time and "still thinking", not on a row of their own under it.
 */
const toggle = page.locator('[data-fold-toggle]').first();
const size = (await page.locator('[data-fold-size]').first().innerText().catch(() => '')).trim();
record(size === '4,000 chars · ~1,000 tokens', `a folded line names its size in tokens too (${size})`);
const where = await toggle.evaluate((button) => {
  const line = button.closest('article');
  const time = line?.querySelector('[class*="_at_"]')?.getBoundingClientRect();
  const block = line?.querySelector('pre')?.getBoundingClientRect();
  const size = button.parentElement?.querySelector('[data-fold-size]')?.getBoundingClientRect();
  const b = button.getBoundingClientRect();
  const middle = (r) => r.top + r.height / 2;
  return time && block && size
    ? {
        timeBeforeToggle: size.right <= time.left + 1 && time.right <= b.left + 1,
        oneLine: Math.round(Math.abs(middle(b) - middle(time))) <= 4 && Math.round(Math.abs(middle(size) - middle(time))) <= 4,
        aboveTop: b.bottom <= block.top + 1,
        rightGap: Math.round(block.right - b.right),
      }
    : null;
}).catch(() => null);
record(where !== null && where.oneLine, `its size and toggle are on the line with the time, not under it (${JSON.stringify(where)})`);
record(where !== null && where.timeBeforeToggle, `the time sits right before the toggle, after the size (${JSON.stringify(where)})`);
record(where !== null && where.aboveTop && Math.abs(where.rightGap) <= 2, `and the toggle sits at the block's top right (${JSON.stringify(where)})`);
record(
  (await page.getByRole('button', { name: /^Show (all|less)/ }).filter({ hasText: /Show/ }).count()) === 0,
  'and there is no "Show all" link any more, only the icon',
);
const before = await toggle.boundingBox();
await toggle.click();
await page.waitForTimeout(200);
const after = await toggle.boundingBox();
record(
  (await toggle.getAttribute('aria-expanded')) === 'true' && before !== null && after !== null && Math.abs(before.y - after.y) < 1,
  `pressed, it opens the block and does not move (${before?.y} then ${after?.y})`,
);

/*
 * A call being spelled out is in no line of the transcript until it is made,
 * and a model writing a file into one can be at it for minutes - so the page
 * says so above the transcript, with how much has arrived.
 */
const writingLine = await page
  .evaluate(() => {
    const line = document.querySelector('[data-session-writing]');
    if (line === null) return null;
    const next = line.nextElementSibling;
    const box = line.getBoundingClientRect();
    const style = getComputedStyle(line);
    return {
      badge: line.querySelector('[class*="_kindBadge_"]')?.textContent?.trim() ?? '',
      agent: line.querySelector('[class*="_writingAgent_"]')?.textContent?.trim() ?? '',
      label: line.querySelector('[class*="_stillThinking_"]')?.textContent?.trim() ?? '',
      padding: Math.min(parseFloat(style.paddingTop), parseFloat(style.paddingLeft)),
      border: style.borderTopStyle,
      gapBelow: next === null ? null : Math.round(next.getBoundingClientRect().top - box.bottom),
      // From the search and filters above the transcript, which it sat flush against.
      gapAbove: (() => {
        const above = line.closest('section')?.previousElementSibling;
        return above == null ? null : Math.round(box.top - above.getBoundingClientRect().bottom);
      })(),
    };
  })
  .catch(() => null);
record(
  writingLine !== null && writingLine.badge === 'Writing' && writingLine.agent === 'Reviewer' &&
    writingLine.label === 'Writing orkbox_write… 12,345 chars (~3,086 tokens)',
  `while the model writes a call, the page says so above the transcript (${JSON.stringify(writingLine)})`,
);
record(
  writingLine !== null && writingLine.padding >= 8 && writingLine.border === 'solid' && writingLine.gapBelow !== null && writingLine.gapBelow >= 8,
  `as a card with room inside it and space under it (padding ${writingLine?.padding}, gap ${writingLine?.gapBelow})`,
);
record(
  writingLine !== null && writingLine.gapAbove !== null && writingLine.gapAbove >= 12,
  `and space above it, apart from the filters (gap ${writingLine?.gapAbove})`,
);

/* Hovering a line's time says the date and time on the reader's clock, never the ISO string the record holds. */
const hover = (await page.locator('[class*="_at_"]').first().getAttribute('title').catch(() => null)) ?? '';
record(hover !== '' && !/T\d\d:\d\d|Z$/.test(hover) && /2026/.test(hover), `a line's time reads as a local date and time on hover (${hover})`);

await finish(browser);
