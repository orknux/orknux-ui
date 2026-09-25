/**
 * An agent step on a run's page links to the session it talked into. Issue #387.
 *
 * A workflow's agent node can keep a session - its turns are written into a
 * conversation somebody can open on the sessions page - and until now the run
 * that produced it had no way there. The step's panel now carries an Open
 * session link where the step kept one, and nothing where it did not.
 *
 * ---------------------------------------------------------------------------
 * Why the run is stubbed
 *
 * The link is drawn from one field on one step - sessionId - and what fills
 * that field when an agent node runs is AgentNodeRunnerTest's business, proved
 * against a real run there. Here the *drawing* is under test: a step that
 * carries a session shows the way to it, a step that carries none shows
 * nothing. So the run is a fixture and only its two agent steps matter.
 *
 * Makes nothing and removes nothing.
 * ---------------------------------------------------------------------------
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

const SESSION = '77042';
const DETAIL = {
  id: '99001',
  workspaceId: WORKSPACE,
  workflowId: '4242',
  workflowName: 'Incident response',
  status: 'COMPLETED',
  trigger: 'MANUAL',
  startedAt: '2026-09-24T09:00:00Z',
  finishedAt: '2026-09-24T09:00:20Z',
  durationSeconds: 20,
  error: null,
  workflowAssigned: true,
  stoppedAtNodeKey: null,
  stoppedReason: null,
  startedFrom: null,
  steps: [
    {
      key: 'start', kind: 'TRIGGER', name: 'Started', description: null, status: 'COMPLETED',
      startedAt: '2026-09-24T09:00:00Z', finishedAt: '2026-09-24T09:00:00Z', durationSeconds: 0,
      input: null, output: '{}', error: null, actionId: null, conditionId: null, agentId: null,
      sessionId: null, branch: null, attempts: 1, carriedOver: false, x: 0, y: 0,
    },
    {
      key: 'talker', kind: 'AGENT', name: 'Responder', description: null, status: 'COMPLETED',
      startedAt: '2026-09-24T09:00:01Z', finishedAt: '2026-09-24T09:00:12Z', durationSeconds: 11,
      input: '{}', output: 'Looked into it.', error: null, actionId: null, conditionId: null,
      agentId: '5', sessionId: SESSION, branch: null, attempts: 1, carriedOver: false, x: 260, y: 0,
    },
    {
      key: 'quiet', kind: 'AGENT', name: 'One-shot', description: null, status: 'COMPLETED',
      startedAt: '2026-09-24T09:00:13Z', finishedAt: '2026-09-24T09:00:20Z', durationSeconds: 7,
      input: '{}', output: 'Done.', error: null, actionId: null, conditionId: null,
      agentId: '6', sessionId: null, branch: null, attempts: 1, carriedOver: false, x: 520, y: 0,
    },
  ],
  edges: [
    { source: 'start', target: 'talker', branch: null },
    { source: 'talker', target: 'quiet', branch: null },
  ],
  logs: [],
  pictures: [],
  speeches: [],
  temporalUrl: null,
};

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('execution(id:')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { execution: DETAIL } }) });
    return;
  }
  await route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${DETAIL.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the run'), 'a run opens');

const node = (name) => page.locator('.react-flow__node', { hasText: name }).first();
await node('Responder').waitFor({ timeout: 30_000 }).catch(() => undefined);

/* ------------------------------------ the step that kept a session -------- */

await node('Responder').click({ force: true });
await page.waitForTimeout(1000);

const sessionLink = page.locator('aside a[href$="/sessions/' + SESSION + '"]');
const linked = await sessionLink.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
record(linked, 'the agent step that kept a session shows a way to open it');
if (linked) {
  const href = await sessionLink.getAttribute('href');
  record(
    href === `/workspace/${WORKSPACE}/sessions/${SESSION}`,
    `and it points at that session (${href})`,
  );
  record((await sessionLink.innerText()).toLowerCase().includes('session'), 'the link says it opens the session');
}

/* ------------------------------------ the step that kept none -------------- */

// Close the panel first: open on the right it covers and re-frames the graph,
// so a click on another node lands on the panel instead of the node. From a
// full-width canvas the pick is clean, the way the first one was.
await page.getByRole('button', { name: /Close node details/ }).click({ force: true });
await page.waitForTimeout(800);

// Switch the panel to the step that kept no session, and wait until the panel
// is actually showing it before reading what it holds - a click and a read in
// the same breath races the panel's re-render.
await node('One-shot').click({ force: true });
const onQuiet = await page
  .locator('aside')
  .filter({ hasText: 'One-shot' })
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(onQuiet, 'the panel switches to the step that kept none');
record(
  await page.locator('aside a[href*="/sessions/"]').count().then((many) => many === 0),
  'and that step shows no session link, because there is nothing to open',
);

await finish(browser);
