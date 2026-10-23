/**
 * Two people in one workflow's editor. Issue #645.
 *
 * There is no Save button: the editor saves as it is edited and says so. Each
 * tab sees the other is there and where it points, and a node moved in one is
 * moved in the other without a reload. Two nodes moved in the two tabs at the
 * same moment both stay moved - the second save is refused over the first's
 * revision, merged with it and sent again, rather than writing over it.
 */
import { BASE, WORKSPACE, open, record, finish, signIn } from './suite/harness.mjs';

const { browser, page: first, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await signIn(context);
const second = await context.newPage();

const name = `zzCollab ${Date.now()}`;
const { createWorkflow } = await graphql(
  'mutation($w: ID!, $n: String!) { createWorkflow(input: { workspaceId: $w, name: $n }) { workflowId } }',
  { w: WORKSPACE, n: name },
);
const workflowId = createWorkflow.workflowId;
await graphql(
  `mutation($w: ID!, $f: ID!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: {
     nodes: [
       { key: "left", kind: OBJECT, name: "Left one", x: 0, y: 0 },
       { key: "right", kind: OBJECT, name: "Right one", x: 520, y: 0 }
     ], edges: [] }) { revision } }`,
  { w: WORKSPACE, f: workflowId },
);
const stored = async () =>
  (await graphql('query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key x y } } }', { w: WORKSPACE, f: workflowId }))
    .workflowGraph.nodes;
const xOf = async (key) => (await stored()).find((node) => node.key === key)?.x;

const editor = `${BASE}/workspace/${WORKSPACE}/workflows/${workflowId}/editor`;
for (const page of [first, second]) {
  await page.goto(editor, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').nth(1).waitFor({ timeout: 20_000 });
}
const node = (page, text) => page.locator('.react-flow__node').filter({ hasText: text }).first();
const settled = (page) =>
  page.waitForFunction(() => document.querySelector('[data-testid="save-state"]')?.getAttribute('data-state') === 'saved', null, { timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

async function drag(page, text, dx) {
  const box = await node(page, text).boundingBox();
  await page.mouse.move(box.x + 30, box.y + 12);
  await page.mouse.down();
  await page.mouse.move(box.x + 30 + dx / 2, box.y + 12, { steps: 4 });
  await page.mouse.move(box.x + 30 + dx, box.y + 12, { steps: 4 });
  await page.mouse.up();
}

try {
  const saveButtons = await first.locator('button', { hasText: /^Save$/ }).count() + await first.getByRole('button', { name: 'Save', exact: true }).count();
  record(saveButtons === 0, 'the editor has no Save button');
  record((await first.getByRole('button', { name: 'Discard', exact: true }).count()) === 0, 'nor a Discard one');
  record(await settled(first), `it says the graph is saved (${await first.getByTestId('save-state').textContent()})`);

  // Each sees the other.
  const seen = await second.getByTestId('presence').locator('[data-login]').count().catch(() => 0);
  await first.getByTestId('presence').waitFor({ timeout: 10_000 }).catch(() => undefined);
  record((await first.getByTestId('presence').locator('[data-login]').count()) === 1 && seen === 1, `each tab shows the other is there (${seen})`);

  // A pointer moved in one is drawn in the other, with its login.
  const canvas = await first.locator('.react-flow__pane').boundingBox();
  await first.mouse.move(canvas.x + 300, canvas.y + 300);
  await first.mouse.move(canvas.x + 320, canvas.y + 310, { steps: 3 });
  const pointer = second.locator('[data-pointer]');
  const drawn = await pointer.first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(drawn, `the other tab draws this one's pointer with its login (${drawn ? await pointer.first().textContent() : 'none'})`);

  // A node moved here is saved without a button, and moves there.
  const before = await xOf('left');
  const thereBefore = (await node(second, 'Left one').boundingBox()).x;
  await drag(first, 'Left one', 160);
  const stateWhile = await first.getByTestId('save-state').getAttribute('data-state');
  record(stateWhile === 'saving' || stateWhile === 'saved', `moving it says it is saving (${stateWhile})`);
  record(await settled(first), 'and then that it is saved');
  const after = await xOf('left');
  record(after > before + 50, `the move reached the server without a Save (${before} -> ${after})`);
  const moved = await second
    .waitForFunction((was) => {
      const one = [...document.querySelectorAll('.react-flow__node')].find((el) => el.textContent.includes('Left one'));
      return one !== undefined && one.getBoundingClientRect().x > was + 50;
    }, thereBefore, { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  record(moved, 'and the other tab redraws it where it went, without a reload');

  // Both at once: neither move is lost.
  const leftWas = await xOf('left');
  const rightWas = await xOf('right');
  await Promise.all([drag(first, 'Left one', -120), drag(second, 'Right one', 140)]);
  await Promise.all([settled(first), settled(second)]);
  await first.waitForTimeout(1500);
  const leftNow = await xOf('left');
  const rightNow = await xOf('right');
  record(leftNow < leftWas - 50 && rightNow > rightWas + 50, `two moves made at once in two tabs both stay (left ${leftWas} -> ${leftNow}, right ${rightWas} -> ${rightNow})`);
} finally {
  const held = await graphql('query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { assignmentId } }', { w: WORKSPACE, f: workflowId }).catch(() => null);
  if (held?.workflowGraph?.assignmentId) await graphql('mutation($id: ID!) { removeWorkflow(id: $id) }', { id: held.workflowGraph.assignmentId }).catch(() => undefined);
  await context.close().catch(() => undefined);
}

await finish(browser);
