/**
 * Every node card draws a picture, and a chosen one replaces it.
 *
 * A card used to draw an icon only where the node had one - an action or a
 * condition took its definition's, a session was given one when it was made -
 * so an image node, an agent, a decision, an object or a trigger whose
 * definition had none was a card with a gap where every other card had a
 * picture. Each kind now has a default, the picture its Add-menu entry uses,
 * and an action that speaks is drawn as a speaker. The run page's cards drew no
 * icon at all, and now draw the same one.
 *
 * What is measured, on the canvas rather than in the source:
 *
 *   - each of the eight kinds, and an action pointed at a Speak action, draws an
 *     icon box with a real size on its card, of the kind's default;
 *   - a node given an icon draws that one instead;
 *   - the node panel's Icon field, with nothing chosen, shows the default greyed
 *     and says Default rather than None;
 *   - a run's cards draw the default and the chosen icon too.
 *
 * Makes a workflow of its own - nine nodes and nothing joining them, which the
 * editor draws whatever the validator thinks of it - a Speak action, and a
 * second little workflow it runs; takes all of them away again.
 */
import { BASE, WORKSPACE, open, record, drawn, selectNode, shot, finish } from './suite/harness.mjs';

const PREFIX = 'zzIcons';
/** Somebody's choice, on one node: anything from the set that is no kind's default. */
const CHOSEN = 'rocket';

const DEFAULTS = {
  TRIGGER: 'bell',
  AGENT: 'bot',
  ACTION: 'activity',
  CONDITION: 'filter',
  OBJECT: 'box',
  SESSION: 'message-square',
  IMAGE: 'image',
  DECISION: 'split',
};

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { workspaceActions } = await graphql(
    `query($w: ID!) { workspaceActions(workspaceId: $w, page: 0, size: 200, search: "${PREFIX}") { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceActions.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();

/** A workflow of its own; the name is unique because a removed one keeps its name taken. */
async function workflow(label) {
  const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
    input: { workspaceId: WORKSPACE, name: `${PREFIX} ${label} ${Date.now()}`, description: 'Made by node-default-icons-check.' },
  });
  return made.createWorkflow.workflowId;
}

async function saveGraph(workflowId, nodes, edges = []) {
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
       saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
     }`,
    { w: WORKSPACE, f: workflowId, input: { nodes, edges } },
  );
}

/*
 * A Speak action of its own, with no icon, so the speaker on the card can only
 * have come from the default. Shared rather than owned by the workflow, which
 * is what the editor's Text to speech entry makes.
 */
const { createAction: speak } = await graphql(
  `mutation($input: CreateActionInput!) { createAction(input: $input) { id icon subtype } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      type: 'EXECUTE',
      name: `${PREFIX} speak`,
      subtype: 'SPEAK',
      speechText: 'Something to say.',
    },
  },
);
record(speak.subtype === 'SPEAK' && (speak.icon ?? null) === null, `a Speak action with no icon of its own (#${speak.id})`);

const EDITOR_FLOW = await workflow('editor');
const node = (key, kind, x, y, extra = {}) => ({ key, kind, name: `${PREFIX} ${key}`, x, y, ...extra });
const KINDS = Object.keys(DEFAULTS);
await saveGraph(EDITOR_FLOW, [
  ...KINDS.map((kind, at) => node(kind.toLowerCase(), kind, 40 + (at % 4) * 300, 40 + Math.floor(at / 4) * 220)),
  node('speaks', 'ACTION', 40, 480, { actionId: speak.id }),
  node('chosen', 'OBJECT', 340, 480, { icon: CHOSEN }),
]);

/* ------------------------------------------------------------ the editor */

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${EDITOR_FLOW}/editor`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

const card = (key) => page.locator('.react-flow__node').filter({ hasText: `${PREFIX} ${key}` }).first();

/** The icon on a card: what it is, where it came from, and the box it is drawn in. */
async function iconOn(key) {
  const icon = card(key).locator('[data-testid="node-icon"]');
  if ((await icon.count()) !== 1) return { count: await icon.count() };
  return {
    name: await icon.getAttribute('data-icon'),
    origin: await icon.getAttribute('data-icon-origin'),
    box: await icon.boundingBox(),
    mask: await icon.evaluate((element) => getComputedStyle(element).maskImage || getComputedStyle(element).webkitMaskImage),
  };
}

const drawnBox = (box) => box !== null && box !== undefined && box.width >= 10 && box.height >= 10;

for (const kind of KINDS) {
  const key = kind.toLowerCase();
  const found = await iconOn(key);
  record(
    found.name === DEFAULTS[kind] && found.origin === 'default' && drawnBox(found.box) && /url\(/.test(found.mask ?? ''),
    `the ${kind} card draws its default icon, ${DEFAULTS[kind]} (${JSON.stringify({ ...found, mask: undefined })})`,
  );
}

const speaker = await iconOn('speaks');
record(
  speaker.name === 'volume-2' && speaker.origin === 'default' && drawnBox(speaker.box),
  `an action that speaks draws a speaker (${JSON.stringify({ ...speaker, mask: undefined })})`,
);

const chosen = await iconOn('chosen');
record(
  chosen.name === CHOSEN && chosen.origin === 'chosen' && drawnBox(chosen.box),
  `a chosen icon replaces the default (${JSON.stringify({ ...chosen, mask: undefined })})`,
);

await page.screenshot({ path: shot('node-default-icons-editor.png') });

/* ------------------------------------------------- the panel's Icon field */

const field = page.locator('[data-testid="node-icon-field"]');

if (await selectNode(page, card('image'), 'the image node')) {
  await field.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  const text = (await field.innerText().catch(() => '')).trim();
  const preview = field.locator('[data-icon]');
  const previewName = (await preview.count()) === 1 ? await preview.getAttribute('data-icon') : null;
  const greyed = (await preview.count()) === 1
    ? await preview.evaluate((element) => {
        const colour = getComputedStyle(element).backgroundColor;
        const text = getComputedStyle(document.body).color;
        return colour !== text;
      })
    : false;
  record(text.startsWith('Default'), `with nothing chosen the field says Default ("${text}")`);
  record(!text.includes('None'), 'and not None');
  record(previewName === 'image' && drawnBox(await preview.boundingBox()), `beside the default it shows (${previewName})`);
  record(greyed, 'greyed, not in the colour of the text');
}

if (await selectNode(page, card('chosen'), 'the node with a chosen icon')) {
  await page.waitForTimeout(400);
  const text = (await field.innerText().catch(() => '')).trim();
  record(text.startsWith(CHOSEN), `a chosen icon is named in the field ("${text}")`);
}

/* ------------------------------------------------------------ the run page */

/*
 * Two Object nodes, which run in no time and need nothing: one with no icon,
 * one with a chosen one. The run records no icon, so the chosen one has to be
 * read back off the workflow's graph by the page.
 */
const RUN_FLOW = await workflow('run');
await saveGraph(
  RUN_FLOW,
  [
    node('plain', 'OBJECT', 40, 200, { outputName: 'plain', mappings: [{ name: 'value', expression: 'a', mode: 'VALUE' }] }),
    node('picked', 'OBJECT', 360, 200, {
      icon: CHOSEN,
      outputName: 'picked',
      mappings: [{ name: 'value', expression: 'b', mode: 'VALUE' }],
    }),
  ],
  [{ source: 'plain', target: 'picked' }],
);
const { startExecution } = await graphql(
  `mutation($w: ID!, $id: ID!) { startExecution(workspaceId: $w, workflowId: $id) { id } }`,
  { w: WORKSPACE, id: RUN_FLOW },
);
const runId = startExecution.id;
for (let waited = 0; waited < 30_000; waited += 1000) {
  const { execution } = await graphql(`query($id: ID!) { execution(id: $id) { status } }`, { id: runId });
  if (execution.status !== 'RUNNING') break;
  await page.waitForTimeout(1000);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${runId}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the run page')) {
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const plain = await iconOn('plain');
  const picked = await iconOn('picked');
  record(
    plain.name === 'box' && plain.origin === 'default' && drawnBox(plain.box),
    `the run's card for a node with no icon draws the default (${JSON.stringify({ ...plain, mask: undefined })})`,
  );
  record(
    picked.name === CHOSEN && picked.origin === 'chosen' && drawnBox(picked.box),
    `the run's card for a node with a chosen icon draws that one (${JSON.stringify({ ...picked, mask: undefined })})`,
  );
  await page.screenshot({ path: shot('node-default-icons-run.png') });
}

await sweep();
await finish(browser);
