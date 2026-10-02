/**
 * An image node's model can be made from the node, as an agent node's agent can.
 *
 * An agent node has New beside its Agent label, which opens the drawer down the
 * left on a new agent; an image node's Image Model had only a picker, and a
 * workspace with no image model had to leave the graph for the Models page to
 * make one. It now has the same New, opening the model drawer to make one.
 *
 * What is measured:
 *
 *   - New is drawn beside the Image Model label, on its line;
 *   - pressing it opens the drawer, beside the graph, headed Create model, with
 *     the type fixed to Image and the fixture's provider offered;
 *   - saving makes an image model on that provider, as the server holds it;
 *   - the node's picker then shows the new model by name, and the drawer stays
 *     open holding it in the model's settings form.
 *
 * Builds a provider on an address that can never answer - nothing here draws -
 * and a workflow with one image node and no model, and takes them away again
 * with the model it made.
 */
import { BASE, WORKSPACE, open, record, selectNode, shot, finish } from './suite/harness.mjs';

const PREFIX = 'zzModelNew';
const NAME = `${PREFIX} made`;
const MODEL_ID = 'zzmodelnew-made';

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

const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}`, description: 'Made by image-model-new-check.' },
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
const label = () => page.locator('label[for="node-image-model"]');
// The innermost element holding both the label and its links: the label's row.
const labelRow = () => page.locator('span', { has: label() }).filter({ has: page.getByRole('button', { name: 'New', exact: true }) }).last();
const newButton = () => labelRow().getByRole('button', { name: 'New', exact: true });
const drawer = () => page.locator('dialog[open][data-testid="model-drawer"]');
const picker = () => page.locator('#node-image-model');

try {
  await page.goto(EDITOR, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(1200);
  if (await selectNode(page, imageNode(), 'the image node')) {
    await label().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    record((await newButton().count()) === 1, 'New is beside the Image Model label');
    const labelBox = await label().boundingBox();
    const newBox = await newButton().boundingBox().catch(() => null);
    record(
      labelBox !== null &&
        newBox !== null &&
        newBox.x > labelBox.x + labelBox.width &&
        Math.abs(newBox.y + newBox.height / 2 - (labelBox.y + labelBox.height / 2)) < 8,
      `on the label's line, to its right (label ${JSON.stringify(labelBox)}, New ${JSON.stringify(newBox)})`,
    );

    // Without a New there is nothing to press, and every line below says so rather than a timeout.
    await newButton().click({ timeout: 5_000 }).catch(() => undefined);
    await drawer().locator('#new-model-name').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    const box = await drawer().boundingBox({ timeout: 5_000 }).catch(() => null);
    record(box !== null && box.width > 200 && box.height > 200, `the drawer opens with a size (${JSON.stringify(box)})`);
    record(
      (await drawer().locator('h2').first().innerText().catch(() => '')).trim() === 'Create model',
      'headed Create model',
    );
    record(new URL(page.url()).pathname.endsWith(`/workflows/${WORKFLOW}/editor`), 'and the editor is still where it was');
    const kind = drawer().locator('#new-model-kind');
    record(
      (await kind.inputValue().catch(() => '')) === 'IMAGE' && (await kind.isDisabled().catch(() => false)),
      `the type is fixed to Image (${await kind.inputValue().catch(() => '')})`,
    );
    const providers = drawer().locator('#new-model-provider');
    record(
      (await providers.locator(`option[value="${provider.id}"]`).count()) === 1,
      "the fixture's provider is offered",
    );
    record(
      (await drawer().getByRole('link', { name: 'Add Provider', exact: true }).getAttribute('href').catch(() => null)) ===
        `/workspace/${WORKSPACE}/models/providers/new`,
      'and a provider can be added from beside it',
    );
    await page.screenshot({ path: shot('image-model-new-form.png') });

    const quick = { timeout: 5_000 };
    await providers.selectOption(provider.id, quick).catch(() => undefined);
    await drawer().locator('#new-model-name').fill(NAME, quick).catch(() => undefined);
    await drawer().locator('#new-model-id').fill(MODEL_ID, quick).catch(() => undefined);
    await drawer().locator('button[type="submit"]').click(quick).catch(() => undefined);
    await drawer().locator('input#model-name').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(600);

    const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name modelId kind providerId } }`, {
      w: WORKSPACE,
    });
    const stored = models.find((one) => one.name === NAME);
    record(stored !== undefined, 'saving makes the model');
    record(
      stored?.kind === 'IMAGE' && stored?.modelId === MODEL_ID && stored?.providerId === provider.id,
      `an image model, with the id typed, on the provider chosen (${JSON.stringify(stored)})`,
    );

    record(
      (await picker().innerText().catch(() => '')).includes(NAME),
      `the node's picker shows it ("${(await picker().innerText().catch(() => '')).trim()}")`,
    );
    record((await drawer().count()) === 1, 'the drawer stays open');
    record(
      (await drawer().locator('h2').first().innerText().catch(() => '')).trim() === 'Model Settings',
      'now headed Model Settings',
    );
    record(
      (await drawer().locator('input#model-name').inputValue().catch(() => '')) === NAME,
      `holding the model it made ("${await drawer().locator('input#model-name').inputValue().catch(() => '')}")`,
    );
    record((await drawer().locator('#image-cost').count()) === 1, "in the model's own form, price of a picture and all");
    await page.screenshot({ path: shot('image-model-new-made.png') });
  }
} finally {
  await sweep();
}

await finish(browser);
