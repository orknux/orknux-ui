/**
 * An image node's model opens in the drawer beside the graph, as an agent does.
 *
 * An agent node's Open definition puts the agent's whole settings in the
 * drawer and keeps the canvas on the screen; an image node had nothing of the
 * kind, so changing the model it draws with meant leaving the graph for the
 * Models page. It now has the same mark beside its Image Model picker, opening
 * the model page's own form in the drawer.
 *
 * What is measured:
 *
 *   - the mark is a real link to the model's page, for a ctrl-click;
 *   - a plain click opens the drawer, on the editor, holding the node's model
 *     by name - and the drawer is drawn, with a width, beside the canvas;
 *   - a field edited and saved there is what the server holds, the drawer is put
 *     away, and opening it again shows the saved value;
 *   - choosing the node's other model while the drawer is open switches the
 *     drawer to that model.
 *
 * Builds a provider and two image models of its own on an address that can
 * never answer - nothing here draws - and a workflow with one image node, and
 * takes them all away again.
 */
import { BASE, WORKSPACE, open, record, selectNode, shot, finish } from './suite/harness.mjs';

const PREFIX = 'zzModelDrawer';

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
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  for (const old of models.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const old of modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();

const { createModelProvider: provider } = await graphql(
  `mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      name: `${PREFIX} provider`,
      type: 'OPENAI',
      // `.invalid` never resolves: nothing in this check is meant to reach a model.
      endpoint: 'http://image.invalid',
      secret: 'sk-check',
    },
  },
);

async function imageModel(name) {
  const { createModel } = await graphql(
    `mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }`,
    { input: { providerId: provider.id, name: `${PREFIX} ${name}`, modelId: `${PREFIX.toLowerCase()}-${name}`, kind: 'IMAGE' } },
  );
  return createModel;
}
const first = await imageModel('first');
const second = await imageModel('second');

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}`, description: 'Made by image-model-drawer-check.' },
});
const WORKFLOW = made.createWorkflow.workflowId;
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
          key: 'drawing',
          kind: 'IMAGE',
          name: `${PREFIX} drawing`,
          x: 200,
          y: 200,
          imageModelId: first.id,
          outputName: 'image',
          mappings: [{ name: 'prompt', expression: 'a red square', mode: 'VALUE' }],
        },
      ],
      edges: [],
    },
  },
);

/* ------------------------------------------------------------ the editor */

const EDITOR = `${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`;
const imageNode = () => page.locator('.react-flow__node').filter({ hasText: `${PREFIX} drawing` }).first();
const jump = () => page.getByRole('link', { name: "Open the model's definition", exact: true });
const drawer = () => page.locator('dialog[open][data-testid="model-drawer"]');
const nameIn = () => drawer().locator('input#model-name');

async function openEditor() {
  await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(1200);
  return selectNode(page, imageNode(), 'the image node');
}

/** Presses the mark and waits for the drawer to hold a model. */
async function openDrawer() {
  await jump().click();
  await nameIn().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
}

try {
  if (await openEditor()) {
    record((await jump().count()) === 1, 'the mark is beside the Image Model picker');
    const href = await jump().getAttribute('href');
    record(href === `/workspace/${WORKSPACE}/models/${first.id}`, `and it is a link to the model's own page (${href})`);

    await openDrawer();
    const box = await drawer().boundingBox();
    record(box !== null && box.width > 200 && box.height > 200, `the drawer opens with a size (${JSON.stringify(box)})`);
    record(
      ((await drawer().locator('h2').first().innerText().catch(() => '')).trim()) === 'Model Settings',
      'headed Model Settings',
    );
    record(
      (await nameIn().inputValue().catch(() => '')) === first.name,
      `holding the node's model ("${await nameIn().inputValue().catch(() => '')}")`,
    );
    record(new URL(page.url()).pathname.endsWith(`/workflows/${WORKFLOW}/editor`), 'and the editor is still where it was');
    record((await page.locator('.react-flow__node').count()) > 0, 'with the graph on the screen');
    // The page's form, not a cut-down copy: a picture's price is what the page edits for an image model.
    record((await drawer().locator('#image-cost').count()) === 1, 'the price of a picture is in the drawer');
    record((await drawer().locator('#model-id').count()) === 1, 'and the model ID');
    record((await drawer().locator('#model-provider').count()) === 1, 'and the provider');
    await page.screenshot({ path: shot('image-model-drawer.png') });

    // ---- a field edited and saved -----------------------------------------
    await drawer().locator('#image-cost').fill('0.07');
    const submit = drawer().locator('button[type="submit"]');
    await submit.scrollIntoViewIfNeeded();
    await submit.evaluate((button) => button.click());
    await drawer().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(400);
    record((await drawer().count()) === 0, 'saving puts the drawer away');
    const { model: stored } = await graphql(`query($id: ID!) { model(id: $id) { name imageCostPerImage } }`, {
      id: first.id,
    });
    record(stored.imageCostPerImage === 0.07, `the server holds the price saved there (${stored.imageCostPerImage})`);
    record(stored.name === first.name, `and the name it was given (${stored.name})`);

    await openDrawer();
    record(
      (await drawer().locator('#image-cost').inputValue().catch(() => '')) === '0.07',
      `opened again, the drawer shows it (${await drawer().locator('#image-cost').inputValue().catch(() => '')})`,
    );

    // ---- the node's other model ---------------------------------------------
    const picker = page.locator('#node-image-model');
    await picker.click();
    await picker.locator('..').getByRole('option', { name: second.name, exact: true }).click();
    await page.waitForTimeout(1200);
    record((await drawer().count()) === 1, 'the drawer is still open');
    record(
      (await nameIn().inputValue().catch(() => '')) === second.name,
      `choosing the other model switches the drawer to it ("${await nameIn().inputValue().catch(() => '')}")`,
    );
    record(
      (await jump().getAttribute('href')) === `/workspace/${WORKSPACE}/models/${second.id}`,
      'and the mark follows it',
    );

    // ---- put away by its × ----------------------------------------------------
    await drawer().getByRole('button', { name: 'Close', exact: true }).click();
    await page.waitForTimeout(400);
    record((await drawer().count()) === 0, 'the × puts it away');
  }
} finally {
  await sweep();
}

await finish(browser);
