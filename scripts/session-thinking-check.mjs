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

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
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
record(thinking.length === 2, `both thinking lines are drawn as thinking (${thinking.length})`);

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
 * Narrowing to Thinking leaves the thinking and nothing else - the kind is a
 * filter like the others rather than a badge that happens to be drawn.
 */
await page.getByRole('button', { name: 'Thinking', exact: true }).click();
await page.waitForTimeout(400);
record(
  (await page.locator('[class*="_kindChip_"][aria-pressed="true"]').innerText()).trim() === 'Thinking',
  'Thinking is one of the kinds the transcript filters by',
);

await finish(browser);
