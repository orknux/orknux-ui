/**
 * The task page shows what the task wrote into its scratchpads. Issue #575.
 *
 * What was reported: task 85 wrote poem.html into a scratchpad before turning
 * it into a PDF, and its page showed the PDF and nothing of the page it came
 * from - the working files were only on the session page, which nobody watching
 * a task had any reason to open.
 *
 * What is asserted, off the real page:
 *
 *   the row               a pad written into the task's session is drawn under
 *                         the task, by name and with its description
 *   and it opens          pressing it draws the pad's content, read-only
 *   the way to change it  a link to the task's session, where the editor is
 *   and it keeps up       a second pad written while the page is open appears
 *                         as the task works again, without a reload
 *
 * The task is real and needs no model that answers, the way task-check's is: a
 * model pointed at `.invalid` fails the task at once, and the session it was
 * given stays behind with the prompt in it - which is all a scratchpad needs.
 * The pads are written with the same mutation the session page's form uses.
 */
import { BASE, WORKSPACE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const stamp = Date.now();
const PROVIDER = `zzScratchPadTaskProvider${stamp}`;
const MODEL = `zzScratchPadTaskModel${stamp}`;
const PROMPT = `zz Scratch Pad Task ${stamp} - write a poem into a page`;
const PAD = `zzPad575-${stamp}.html`;
const PAD_LINE = `<h1>A poem written at ${stamp}</h1>`;
const LATER = `zzPad575-later-${stamp}.md`;

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ---------------------------------------------------------------- fixture */

/* Anything an earlier run left behind, swept first: a `finally` cannot clean up after the suite's timeout. */
const before = await graphql(
  `query($workspaceId: ID!) {
     workspaceTasks(workspaceId: $workspaceId, page: 0, size: 200) { content { id title status } }
     modelProviders(workspaceId: $workspaceId) { id name }
     workspaceAgents(workspaceId: $workspaceId, page: 0, size: 200) { content { id name } }
   }`,
  { workspaceId: WORKSPACE },
);
for (const old of before.workspaceTasks.content.filter((row) => row.title.startsWith('zz Scratch Pad Task'))) {
  if (!['DONE', 'FAILED', 'STOPPED'].includes(old.status)) {
    await graphql(`mutation($id: ID!) { stopTask(id: $id) { id } }`, { id: old.id }).catch(() => undefined);
  }
  await graphql(`mutation($id: ID!) { deleteTask(id: $id) }`, { id: old.id }).catch(() => undefined);
  console.log(`swept task ${old.title} (#${old.id})`);
}
for (const old of before.modelProviders.filter((row) => row.name.startsWith('zzScratchPadTaskProvider'))) {
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  console.log(`swept provider ${old.name} (#${old.id})`);
}
for (const old of before.workspaceAgents.content.filter((row) => row.name.startsWith('zzScratchPadTaskModel'))) {
  await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: old.id }).catch(() => undefined);
  console.log(`swept agent ${old.name} (#${old.id})`);
}

const provider = (
  await graphql(`mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, name: PROVIDER, endpoint: 'http://nowhere.invalid', secret: 'sk-scratch' },
  })
).createModelProvider;
const model = (
  await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
    input: { providerId: provider.id, name: MODEL, modelId: 'scratch', kind: 'CHAT' },
  })
).createModel;
const worker = (
  await graphql(`mutation($m: ID!) { createAgentForModel(modelId: $m) { id name } }`, { m: model.id })
).createAgentForModel;

const started = (
  await graphql(
    `mutation($input: StartTaskInput!) { startTask(input: $input) { id sessionId } }`,
    { input: { workspaceId: WORKSPACE, prompt: PROMPT, agentId: worker.id } },
  )
).startTask;
const taskId = started.id;
let sessionId = started.sessionId;
for (let look = 0; look < 20 && sessionId === null; look += 1) {
  await page.waitForTimeout(500);
  sessionId = (await graphql(`query($id: ID!) { task(id: $id) { sessionId } }`, { id: taskId })).task.sessionId;
}
console.log(`started task #${taskId} on session #${sessionId}`);

async function cleanUp() {
  if (sessionId !== null) {
    for (const name of [PAD, LATER]) {
      await graphql(`mutation($id: ID!, $name: String!) { deleteSessionScratchpad(sessionId: $id, name: $name) }`, {
        id: sessionId,
        name,
      }).catch(() => undefined);
    }
  }
  await graphql(`mutation($id: ID!) { stopTask(id: $id) { id } }`, { id: taskId }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { deleteTask(id: $id) }`, { id: taskId }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: worker.id }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: provider.id }).catch(() => undefined);
}

if (sessionId === null) {
  record(false, 'the task was never given a session, so there is nowhere for a scratchpad to be');
  await cleanUp();
  await finish(browser);
}

const writePad = (name, description, content) =>
  graphql(
    `mutation($id: ID!, $name: String!, $description: String, $content: String) {
       createSessionScratchpad(sessionId: $id, name: $name, description: $description, content: $content) { name }
     }`,
    { id: sessionId, name, description, content },
  );

await writePad(PAD, 'The poem, as a page', `<!doctype html>\n${PAD_LINE}\n<p>Line two of it.</p>`);

/* ------------------------------------------------------------------- page */

await page.goto(`${BASE}/workspace/${WORKSPACE}/tasks/${taskId}`, { waitUntil: 'domcontentloaded' });
if (!(await drawn(page, 'the task page'))) {
  await cleanUp();
  await finish(browser);
}

const section = page.locator('[data-testid="task-scratchpads"]');
const row = section.locator(`[data-task-scratchpad="${PAD}"]`);
await row.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
record((await row.count()) === 1, `the pad the task wrote is listed on its page (${await row.count()} rows named ${PAD})`);
const rowText = (await row.count()) === 1 ? await row.innerText() : '';
record(rowText.includes('The poem, as a page'), `and says what it is for (the row reads "${rowText.replace(/\s+/g, ' ')}")`);

if ((await row.count()) === 1) {
  await row.click();
  const content = section.locator(`[data-task-scratchpad-content="${PAD}"]`);
  await content.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  const text = (await content.count()) === 1 ? await content.innerText() : '';
  record(text.includes(PAD_LINE), `pressing it draws what is in it (read "${text.slice(0, 60).replace(/\s+/g, ' ')}")`);
  const box = (await content.count()) === 1 ? await content.boundingBox() : null;
  record(box !== null && box.height > 20, `as a block with height (${box === null ? 'none' : Math.round(box.height)}px)`);
  record(
    (await content.evaluate((node) => node.tagName)) === 'PRE',
    'and read-only, not a box to type into',
  );
}

const edit = section.locator('[data-task-scratchpad-edit]');
const href = (await edit.count()) === 1 ? await edit.getAttribute('href') : null;
record(
  href === `/workspace/${WORKSPACE}/sessions/${sessionId}`,
  `the way to change one is the task's session (the link goes to ${href})`,
);

await page.screenshot({ path: shot('task-scratchpad.png'), fullPage: true });

/*
 * And a pad written while the page is open, drawn without a reload. The task
 * has ended, so it is asked to carry on: that sets it working again on the same
 * session, its new lines arrive on the stream, and the list follows them. The
 * model still cannot answer, so the task ends again a moment later.
 */
await writePad(LATER, null, 'Written after the page was opened.');
const later = page.locator(`[data-testid="task-scratchpads"] [data-task-scratchpad="${LATER}"]`);
await page.waitForTimeout(1000);
record((await later.count()) === 0, 'a pad written after the page was drawn is not there before anything happens');
await page.locator('[data-testid="task-message-box"]').fill('Carry on, please.');
await page.locator('[data-testid="task-message-send"]').click();
await later.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
record((await later.count()) === 1, 'and appears once the task works again, without a reload');
/*
 * The pad opened above is still open. The stream's frames carry the session id
 * as a number and GraphQL as text; keyed on the raw value, every frame read as
 * a different session and closed whatever somebody was reading.
 */
record(
  (await page.locator(`[data-task-scratchpad-content="${PAD}"]`).count()) === 1,
  'and the pad being read stays open while the task works',
);

await cleanUp();
await finish(browser);
