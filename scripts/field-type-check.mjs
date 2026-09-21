/**
 * A field an Object node names for itself can say what it holds.
 *
 * Issue #359. The fields of a node with no saved shape were a name and a value
 * and nothing else, so `3` typed into one arrived downstream as the string
 * `"3"` - and a saved shape, which does have types, was the only way to say
 * otherwise. That made "I want this one node to hand on a number" a reason to
 * add a name to the workspace's library.
 *
 * The control is the one the object's page draws for a property, because it is
 * the same question: what one of it is, and whether there is one or a list.
 *
 * Driven end to end - chosen in the panel, saved with the graph, read back off
 * the server - because a picker that shows the right word and stores nothing is
 * the failure this is for.
 *
 * Makes a workflow with one Object node in it and removes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzFieldType';

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept workflow ${old.name} (#${old.id})`);
  }
};

await sweep();

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: `${PREFIX} flow`,
    description: 'Made by field-type-check, and removed again.',
  },
});
const WORKFLOW = made.createWorkflow.workflowId;

/*
 * One Object node with no shape and one field of its own, holding something
 * that spells a number. What it is declared to be is the whole of this check.
 */
await graphql(
  `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) {
     saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { nodes { key } }
   }`,
  {
    w: WORKSPACE,
    f: WORKFLOW,
    input: {
      nodes: [
        {
          key: 'held',
          kind: 'OBJECT',
          name: `${PREFIX} holds`,
          x: 120,
          y: 120,
          outputName: 'ticket',
          mappings: [{ name: 'count', expression: '3', mode: 'VALUE' }],
        },
      ],
      edges: [],
    },
  },
);
console.log(`made workflow ${PREFIX} flow (#${WORKFLOW})`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

/** What the server holds for the node's one field. */
const stored = async () => {
  const { workflowGraph } = await graphql(
    `query($w: ID!, $f: ID!) {
       workflowGraph(workspaceId: $w, workflowId: $f) {
         nodes { key mappings { name expression fieldKind fieldElementKind fieldRefObjectId } }
       }
     }`,
    { w: WORKSPACE, f: WORKFLOW },
  );
  return workflowGraph.nodes.find((one) => one.key === 'held')?.mappings?.[0] ?? null;
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

const offered = await page
  .waitForSelector('#node-field-type-0', { timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(offered, "a field of the node's own is offered a type, beside its name");
if (!offered) await clean();

/* ---- what it says before anybody chooses ---- */

const says = () => page.$eval('#node-field-type-0', (one) => one.textContent?.trim() ?? '');
record(
  (await says()) === 'string',
  `a field nobody has typed reads as what it is rather than as unfilled (${JSON.stringify(await says())})`,
);

/* ---- choosing a type ---- */

await page.click('#node-field-type-0');
await page.waitForSelector('[role="option"]', { timeout: 10_000 });
await page.locator('[role="option"]', { hasText: 'number' }).first().click();
await page.waitForTimeout(400);
record((await says()) === 'number', `the type chosen is the one shown (${JSON.stringify(await says())})`);

/* ---- saved with the graph, and held by the server ---- */

await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const held = await stored();
console.log(`stored: ${JSON.stringify(held)}`);
record(held?.fieldKind === 'NUMBER', 'the server holds the field as a number');
record(held?.expression === '3', 'and the value it was already carrying is untouched');

/* ---- a list of them, which is the other half of the control ---- */

await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
await page.waitForTimeout(1000);
await page.click('.react-flow__node');
await page.waitForSelector('#node-field-type-0', { timeout: 20_000 });

record(
  (await says()) === 'number',
  `the type comes back from a reload (${JSON.stringify(await says())})`,
);

await page.locator('button[aria-pressed]', { hasText: 'List' }).first().click();
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2500);

const asList = await stored();
console.log(`as a list: ${JSON.stringify(asList)}`);
record(asList?.fieldKind === 'ARRAY', 'a list of them is stored as an array');
record(asList?.fieldElementKind === 'NUMBER', 'and what the list holds is kept beside it');

/* ------------------------------------------------------------------- tidy up */

await clean();
