/**
 * A decision model provider, and the decision node that asks one. Issue #577.
 *
 * Jev and a self-hosted Laya speak one API, so the Providers form offers one
 * type for both, and its key is optional - a Laya started without LAYA_API_KEY
 * has none to give. On the canvas a decision node that branches on a choice
 * leaves by one door per option and one for an answer too unsure to take, and
 * those doors are what the saved lines carry.
 *
 * What is measured is what is drawn:
 *
 *   the form      the type is offered, and its key field carries no required
 *                 mark once it is picked
 *   the menu      Add node offers the node, called Decision - it is not only
 *                 a decision model's any more
 *   the picker    its model picker offers a chat model beside the decision
 *                 model, each said to be which
 *   the doors     a node branching on a two-option choice draws three source
 *                 handles, spaced down its edge in order, labelled with the
 *                 options and Unsure - and a line drawn from an option's door
 *                 leaves from that door, not from the node's middle
 *   yes or no     a node branching on a yes-or-no draws Yes, No and Unsure
 *   the pruning   an option removed in the panel takes its door and its line
 *                 with it, so the graph still saves
 *   it sticks     the questions come back after a reload
 *   the cards     each reads top to bottom as a question: the kind as three
 *                 segments, the Question (or a yes-or-no's Statement), the
 *                 answers - never fewer than two rows for a choice, fixed Yes
 *                 and No for a yes-or-no - and the output key last; removing
 *                 is an icon
 *   the doors     a decision's Yes and No are drawn exactly as a condition's,
 *                 a line drags from them the same way, and a choice with too
 *                 few options says so on the node
 *
 * Nothing here calls a model: the provider points at a `.invalid` host and is
 * never checked. `decision-run-check` is the half that runs one, over a stub.
 * Makes its own provider, model and workflow, and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const PREFIX = 'zzDecisionNode';
const STAMP = Date.now();

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });

/* ----------------------------------------------------------------- fixture */

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const old of modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ---- the form: the type, and a key it does not insist on ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#provider-type', { timeout: 30_000 });
const types = await page.locator('#provider-type option').evaluateAll((all) => all.map((one) => one.value));
record(types.includes('SYSTEM_ONE'), `the Providers form offers the decision model type (${JSON.stringify(types)})`);
await page.locator('#provider-type').selectOption('SYSTEM_ONE').catch(() => undefined);
await page.waitForTimeout(300);
const keyLabel = (await page.locator('label[for="provider-secret"]').first().textContent().catch(() => '')) ?? '';
record(!keyLabel.includes('*'), `and once picked, its key is not marked required (${JSON.stringify(keyLabel)})`);

/* ---- a provider, a model and a graph of this check's own ---- */

const provider = await graphql(
  `mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      name: `${PREFIX} Jev ${STAMP}`,
      type: 'SYSTEM_ONE',
      endpoint: 'https://decisions.invalid',
    },
  },
);
const model = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
  input: { providerId: provider.createModelProvider.id, name: `${PREFIX} model ${STAMP}`, modelId: 'jev-latest', kind: 'DECISION' },
});
/* A chat model too, which a decision node may run on; never called either. */
const chatProvider = await graphql(
  `mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  {
    input: {
      workspaceId: WORKSPACE,
      name: `${PREFIX} chat ${STAMP}`,
      type: 'OPENAI',
      endpoint: 'https://chat.invalid/v1',
      secret: 'sk-never-used',
    },
  },
);
const CHAT = `${PREFIX} chatty ${STAMP}`;
await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
  input: { providerId: chatProvider.createModelProvider.id, name: CHAT, modelId: 'gpt-stub', kind: 'CHAT' },
});
const made = await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
  input: { workspaceId: WORKSPACE, name: `${PREFIX} ${STAMP}`, description: 'Made by decision-node-check.' },
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
          key: 'decide',
          kind: 'DECISION',
          name: `${PREFIX} route`,
          x: 100,
          y: 200,
          decisionModelId: model.createModel.id,
          decisionBranchQuestion: 'department',
          decisionThreshold: 0.8,
          decisionQuestions: [
            {
              key: 'department',
              kind: 'CHOICE',
              instructions: 'Which team?',
              options: [{ name: 'billing', description: 'Charges' }, { name: 'returns' }, { name: 'shipping' }],
            },
          ],
          mappings: [{ name: 'state', expression: '', mode: 'VALUE' }],
        },
        { key: 'bill', kind: 'OBJECT', name: `${PREFIX} bill`, x: 520, y: 60, mappings: [{ name: 'to', expression: 'billing', mode: 'VALUE' }] },
        {
          key: 'judge',
          kind: 'DECISION',
          name: `${PREFIX} judge`,
          x: 100,
          y: 700,
          outputName: 'judged',
          decisionModelId: model.createModel.id,
          decisionBranchQuestion: 'urgent',
          decisionQuestions: [
            { key: 'urgent', kind: 'NOUL', instructions: 'Is it urgent?', options: [] },
            { key: 'team', kind: 'CHOICE', instructions: 'Which team?', options: [] },
          ],
          mappings: [{ name: 'state', expression: '', mode: 'VALUE' }],
        },
        {
          key: 'lonely',
          kind: 'DECISION',
          name: `${PREFIX} lonely`,
          x: 100,
          y: 1100,
          outputName: 'lonelyAnswer',
          decisionModelId: model.createModel.id,
          decisionBranchQuestion: 'team',
          decisionQuestions: [{ key: 'team', kind: 'CHOICE', instructions: 'Which team?', options: [{ name: 'billing' }] }],
          mappings: [{ name: 'state', expression: '', mode: 'VALUE' }],
        },
        { key: 'ask', kind: 'CONDITION', name: `${PREFIX} ask`, x: 900, y: 700, mappings: [] },
        { key: 'refund', kind: 'OBJECT', name: `${PREFIX} refund`, x: 520, y: 360, mappings: [{ name: 'to', expression: 'returns', mode: 'VALUE' }] },
      ],
      edges: [
        { source: 'decide', target: 'bill', branch: 'OPTION', option: 'billing' },
        { source: 'decide', target: 'refund', branch: 'OPTION', option: 'returns' },
      ],
    },
  },
);

/* ---- the menu ---- */

const openEditor = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await page.waitForTimeout(1500);
};
await openEditor();
if (!(await drawn(page, 'the editor', { within: 30_000, still: 0 }))) await clean();

await page.getByRole('button', { name: /add node/i }).click();
await page.waitForTimeout(300);
const offered = await page.getByRole('menuitem', { name: /^decision$/i }).count();
record(offered === 1, `Add node offers the decision node, called Decision (${offered})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);

/* ---- the doors ---- */

const node = page.locator('.react-flow__node', { hasText: `${PREFIX} route` }).first();
const doors = async () =>
  node.locator('[data-testid="decision-handle"]').evaluateAll((all) =>
    all.map((one) => {
      const box = one.getBoundingClientRect();
      return { id: one.getAttribute('data-handleid'), y: box.top + box.height / 2, x: box.left + box.width / 2 };
    }),
  );

const drawnDoors = await doors();
record(
  JSON.stringify(drawnDoors.map((one) => one.id)) === JSON.stringify(['opt:billing', 'opt:returns', 'opt:shipping', 'unsure']),
  `a node branching on three options draws a door per option and one for unsure (${JSON.stringify(drawnDoors.map((one) => one.id))})`,
);
record(
  drawnDoors.length === 4 && drawnDoors.every((one, at) => at === 0 || drawnDoors[at - 1].y < one.y),
  `spaced down the node's edge in order (${drawnDoors.map((one) => Math.round(one.y)).join(', ')})`,
);
const labels = await node.locator('span[class*="branchLabel"]').allTextContents();
record(
  JSON.stringify(labels) === JSON.stringify(['billing', 'returns', 'shipping', 'Unsure']),
  `each door says which answer it is (${JSON.stringify(labels)})`,
);

/*
 * The line to `refund` has to leave from the returns door. Read off the path
 * React Flow drew: its first point is where the edge starts.
 */
const start = await page
  .locator('.react-flow__edge[data-id*="opt:returns"] path.react-flow__edge-path, .react-flow__edge[data-testid*="opt:returns"] path')
  .first()
  .evaluate((path) => {
    const at = path.getPointAtLength(0);
    const point = new DOMPoint(at.x, at.y).matrixTransform(path.getScreenCTM());
    return { x: point.x, y: point.y };
  })
  .catch(() => null);
const returnsDoor = drawnDoors.find((one) => one.id === 'opt:returns');
record(
  start !== null && returnsDoor !== undefined && Math.abs(start.y - returnsDoor.y) < 6,
  `the line for returns leaves from its own door (line ${start ? Math.round(start.y) : 'missing'}, door ${returnsDoor ? Math.round(returnsDoor.y) : 'missing'})`,
);

/* ---- a yes-or-no branches by Yes, No and Unsure ---- */

const judge = page.locator('.react-flow__node', { hasText: `${PREFIX} judge` }).first();
const judged = await judge.locator('[data-testid="decision-handle"]').evaluateAll((all) =>
  all.map((one) => {
    const box = one.getBoundingClientRect();
    return { id: one.getAttribute('data-handleid'), y: box.top + box.height / 2 };
  }),
);
record(
  JSON.stringify(judged.map((one) => one.id)) === JSON.stringify(['opt:yes', 'opt:no', 'unsure']),
  `a node branching on a yes-or-no draws three doors (${JSON.stringify(judged.map((one) => one.id))})`,
);
record(
  judged.length === 3 && judged[0].y < judged[1].y && judged[1].y < judged[2].y,
  `in order down its edge (${judged.map((one) => Math.round(one.y)).join(', ')})`,
);
const judgedLabels = await judge.locator('span[class*="branchLabel"]').allTextContents();
record(
  JSON.stringify(judgedLabels) === JSON.stringify(['Yes', 'No', 'Unsure']),
  `labelled Yes, No and Unsure (${JSON.stringify(judgedLabels)})`,
);

/* ---- the pruning ---- */

await selectNode(page, node, 'the decision node');
await page.waitForSelector('[data-testid="decision-question"]', { timeout: 15_000 }).catch(() => undefined);

/* ---- the picker: a chat model beside the decision model, each named for what it is ---- */

await page.locator('#node-decision-model').click({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const rows = await page.locator('[role="listbox"] [role="option"]').allInnerTexts();
const row = (name) => rows.find((one) => one.includes(name)) ?? '';
record(
  row(`${PREFIX} model ${STAMP}`).includes('Decision model') && row(CHAT).includes('Chat model'),
  `the model picker offers the chat model beside the decision model, saying which is which (${JSON.stringify(rows.filter((one) => one.includes(PREFIX)))})`,
);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await page.getByRole('button', { name: 'Remove option' }).nth(1).click({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(900);

const after = await doors();
record(
  JSON.stringify(after.map((one) => one.id)) === JSON.stringify(['opt:billing', 'opt:shipping', 'unsure']),
  `removing an option takes its door away (${JSON.stringify(after.map((one) => one.id))})`,
);
const lines = await page.locator('.react-flow__edge').count();
record(lines === 1, `and the line that left by it (${lines} line(s) left)`);

await page.keyboard.press('Control+s');
await page.waitForTimeout(2500);
const refused = await page.locator('[role=alert]').allTextContents().catch(() => []);
record(refused.length === 0, `the graph still saves (${JSON.stringify(refused).slice(0, 160)})`);

/* ---- it sticks ---- */

await openEditor();
await selectNode(page, page.locator('.react-flow__node', { hasText: `${PREFIX} route` }).first(), 'the decision node');
await page.waitForSelector('[data-testid="decision-question"]', { timeout: 15_000 }).catch(() => undefined);
const kept = await page
  .locator('[data-testid="decision-question"] input[aria-label="Option name"]')
  .evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(kept) === JSON.stringify(['billing', 'shipping']), `the question comes back as it was saved (${JSON.stringify(kept)})`);

/* ---- the cards: each reads top to bottom as a question (never saved) ---- */

await page.getByRole('button', { name: /add question/i }).click({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(400);
const fresh = page.locator('[data-testid="decision-question"]').last();
const rowsDrawn = await fresh.locator('[data-testid="decision-option"]').count();
record(rowsDrawn === 2, `a new choice question draws two option rows to fill (${rowsDrawn})`);

const top = async (selector) => (await fresh.locator(selector).first().boundingBox({ timeout: 5_000 }).catch(() => null))?.y ?? null;
const order = {
  kind: await top('[data-testid="decision-kind"]'),
  asked: await top('[data-testid="decision-asked"]'),
  answers: await top('[data-testid="decision-answers"]'),
  key: await top('[data-testid="decision-key"]'),
};
record(
  order.kind !== null && order.asked !== null && order.answers !== null && order.key !== null &&
    order.kind < order.asked && order.asked < order.answers && order.answers < order.key,
  `the card reads kind, then the question, then the answers, then the key at the bottom (${JSON.stringify(order)})`,
);

const shape = await fresh.evaluate((card) => {
  const kinds = [...card.querySelectorAll('[data-testid="decision-kind"] [role="radio"]')].map((one) => one.innerText.trim());
  const asked = card.querySelector('[data-testid="decision-asked"]');
  const key = card.querySelector('[data-testid="decision-key"] input');
  const remove = card.querySelector('button[aria-label="Remove question"]');
  return {
    kinds,
    askedLabel: (asked?.closest('label')?.innerText ?? '').split('\n')[0].trim(),
    key: key?.tagName ?? null,
    keyLabel: (key?.closest('label')?.innerText ?? '').split('\n')[0].trim(),
    removeIcon: remove !== null && remove.querySelector('svg') !== null && remove.innerText.trim() === '',
  };
});
record(
  JSON.stringify(shape.kinds) === JSON.stringify(['Choice', 'Score', 'Yes or no']),
  `the kind is a segmented control of three (${JSON.stringify(shape.kinds)})`,
);
record(shape.askedLabel.toLowerCase() === 'question', `a choice's first field is the Question (${JSON.stringify(shape.askedLabel)})`);
record(
  shape.key === 'INPUT' && shape.keyLabel.toLowerCase() === 'output key',
  `and its key is an input labelled Output key (${JSON.stringify(shape)})`,
);
record(shape.removeIcon, 'removing a question is an icon button, not a word');

await fresh.getByRole('radio', { name: 'Yes or no' }).click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(300);
const sides = await fresh.locator('[data-testid="decision-side"]').allTextContents();
record(
  JSON.stringify(sides) === JSON.stringify(['Yes', 'No']),
  `a yes-or-no question draws its two fixed answers, Yes and No (${JSON.stringify(sides)})`,
);
record((await fresh.locator('[data-testid="decision-option"]').count()) === 0, 'and no option list to fill');
const statement = await fresh.evaluate(
  (card) => (card.querySelector('[data-testid="decision-asked"]')?.closest('label')?.innerText ?? '').split('\n')[0].trim(),
);
record(statement.toLowerCase() === 'statement', `and its first field is the Statement (${JSON.stringify(statement)})`);

/* ---- an existing choice with no options still shows two rows to fill ---- */

await selectNode(page, judge, 'the yes-or-no node');
await page.waitForTimeout(600);
const team = page.locator('[data-testid="decision-question"]').filter({ has: page.locator('input[aria-label="Output key"][value="team"]') });
const teamRows = await team.locator('[data-testid="decision-option"]').count();
record(teamRows === 2, `a saved choice with no options shows two empty rows to fill (${teamRows})`);

/* ---- a choice with too few options says so on the node ---- */

const lonely = page.locator('.react-flow__node', { hasText: `${PREFIX} lonely` }).first();
const note = (await lonely.locator('[data-testid="decision-note"]').textContent({ timeout: 3_000 }).catch(() => '')) ?? '';
const lonelyDoors = await lonely.locator('[data-testid="decision-handle"]').count();
record(
  /two options/i.test(note) && lonelyDoors === 0,
  `a node branching on a one-option choice draws no doors and says why (${JSON.stringify(note)}, ${lonelyDoors} doors)`,
);

/* ---- the doors are a condition's doors ---- */

const looks = async (handle, label) =>
  page
    .evaluate(
    ([h, l]) => {
      const pick = (el, names) => Object.fromEntries(names.map((n) => [n, getComputedStyle(el)[n]]));
      return {
        handle: pick(h, ['backgroundColor', 'width', 'height', 'borderRadius', 'borderColor']),
        label: pick(l, ['color', 'backgroundColor', 'fontSize', 'fontFamily']),
      };
    },
    [await handle.elementHandle({ timeout: 5_000 }), await label.elementHandle({ timeout: 5_000 })],
    )
    .catch(() => null);
const ask = page.locator('.react-flow__node', { hasText: `${PREFIX} ask` }).first();
const conditionYes = await looks(ask.locator('.react-flow__handle[data-handleid="yes"]'), ask.locator('[class*="branchLabel"]').nth(0));
const conditionNo = await looks(ask.locator('.react-flow__handle[data-handleid="no"]'), ask.locator('[class*="branchLabel"]').nth(1));
const judgeYes = await looks(judge.locator('.react-flow__handle[data-handleid="opt:yes"]'), judge.locator('[class*="branchLabel"]').nth(0));
const judgeNo = await looks(judge.locator('.react-flow__handle[data-handleid="opt:no"]'), judge.locator('[class*="branchLabel"]').nth(1));
record(
  judgeYes !== null && JSON.stringify(judgeYes) === JSON.stringify(conditionYes),
  `a decision's Yes looks exactly like a condition's Yes (${JSON.stringify(judgeYes)} / ${JSON.stringify(conditionYes)})`,
);
record(
  judgeNo !== null && JSON.stringify(judgeNo) === JSON.stringify(conditionNo),
  `and its No like a condition's No (${JSON.stringify(judgeNo)} / ${JSON.stringify(conditionNo)})`,
);

/* ---- and a line is dragged from one like from a condition ---- */

const centre = async (locator) => {
  const box = await locator.boundingBox({ timeout: 5_000 }).catch(() => null);
  return box === null ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const from = await centre(judge.locator('.react-flow__handle[data-handleid="opt:yes"]'));
const into = await centre(page.locator('.react-flow__node', { hasText: `${PREFIX} bill` }).first().locator('.react-flow__handle.target'));
if (from !== null && into !== null) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + into.x) / 2, (from.y + into.y) / 2, { steps: 8 });
  await page.mouse.move(into.x, into.y, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(600);
}
const drawnFromYes = await page.locator('.react-flow__edge[data-id*="judge-opt:yes->bill"]').count();
record(drawnFromYes === 1, `a line dragged from its Yes joins the node it is dropped on (${drawnFromYes})`);

await clean();
