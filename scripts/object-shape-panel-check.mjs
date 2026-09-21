/**
 * A shape's fields are edited where the node that points at it is.
 *
 * Issue #360. Making an object from the workflow editor asked for a name and a
 * description and stopped there: the fields the shape exists to fix were on the
 * object's own page, which is off the graph, and the way back was a breadcrumb.
 * So the common case - make a shape, say what is in it, carry on wiring - cost
 * two journeys and a lost place on the canvas.
 *
 * It is the same editor the object's page draws, handed the panel's own class
 * names, so a property means one thing in both. What is measured here is that
 * it is there, that it writes, and that what it wrote is what the server holds.
 *
 * The second half of the issue is the four lines of prose that used to sit
 * under an empty property list. An explanation of a thing belongs behind the
 * (?) beside it, so the sentence is asserted to be *absent* from the page and
 * present on the control that explains it.
 *
 * Makes a workflow and an object, and removes both.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzObjectShapePanel';
const SHAPE_NAME = `${PREFIX}Shape`;

/** The sentence that used to be printed under an empty list. */
const PROSE = 'the sentence is what a reader has instead of guessing from the name';

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept workflow ${old.name} (#${old.id})`);
  }

  const { workspaceObjects } = await graphql(
    `query($w: ID!) { workspaceObjects(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceObjects.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept object ${old.name} (#${old.id})`);
  }
};

await sweep();

/*
 * A shape with nothing in it, which is what one made from the panel is: the
 * dialog there asks for a name and a description and no more.
 */
const made = await graphql(`mutation($input: CreateObjectInput!) { createObject(input: $input) { id name } }`, {
  input: { workspaceId: WORKSPACE, name: SHAPE_NAME, description: 'Made by object-shape-panel-check.' },
});
const SHAPE = made.createObject.id;
console.log(`made object ${SHAPE_NAME} (#${SHAPE}), with no properties`);

const workflow = await graphql(
  `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      name: `${PREFIX} flow`,
      description: 'Made by object-shape-panel-check, and removed again.',
    },
  },
);
const WORKFLOW = workflow.createWorkflow.workflowId;

await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [{ key: 'held', kind: 'OBJECT', name: `${PREFIX} holds`, x: 120, y: 120, objectId: SHAPE }],
      edges: [],
    },
  },
);
console.log(`made workflow ${PREFIX} flow (#${WORKFLOW}) with a node pointing at it`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });

const drew = await page
  .waitForSelector('.react-flow__node', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
record(drew, 'the editor drew the node');
if (!drew) await clean();

await page.waitForTimeout(1000);
await page.click('.react-flow__node');

const inspected = await page
  .waitForSelector('#node-object', { timeout: 15_000 })
  .then(() => true)
  .catch(() => false);
record(inspected, 'clicking the node opens its properties, Shape among them');
if (!inspected) await clean();

/*
 * Waited for rather than slept past: the panel is drawn from the node, and the
 * shape it points at is a second answer that lands after it.
 */
const adds = page.locator('button', { hasText: '+ Add Property' });
const editable = await adds
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);

/* ---- the editor is there, beside the node ---- */

record(editable, 'the shape it points at is editable in the panel, without leaving the graph');
if (!editable) await clean();

/* ---- and the prose is behind the (?) rather than under the list ---- */

const shown = await page.evaluate(() => document.body.innerText);
record(!shown.includes(PROSE), 'the four lines of prose are not printed under the empty list');
record(
  (await page.locator('button[data-hint="Properties"]').count()) > 0,
  'there is a (?) beside Properties, which is where the explanation went',
);

/* ---- a property added here is a property the server holds ---- */

await adds.first().click();
await page.waitForTimeout(300);

await page.fill('#node-shape-name-0', 'channel');
await page.fill('#node-shape-description-0', 'Where the message goes');
await page.waitForTimeout(200);

const saving = page.locator('button', { hasText: 'Save shape' });
record((await saving.count()) > 0, 'a changed shape offers to be saved');
await saving.first().click();
await page.waitForTimeout(1500);

const { workflowObject } = await graphql(
  `query($id: ID!) { workflowObject(id: $id) { properties { name kind description } } }`,
  { id: SHAPE },
);
const stored = workflowObject?.properties ?? [];
console.log(`stored: ${JSON.stringify(stored)}`);

record(stored.length === 1 && stored[0].name === 'channel', 'the property reached the server under its name');
record(stored[0]?.kind === 'STRING', 'with the type the row was left on');
record(
  stored[0]?.description === 'Where the message goes',
  'and the sentence saying what it means, which is what a model reads',
);

/* ------------------------------------------------------------------- tidy up */

await clean();
