/**
 * Cut, Copy and Paste in the workflow editor, as drawn:
 *
 *   cut        two selected nodes and the line between them leave the canvas on
 *              Ctrl+X, and so does the line joining them to the rest
 *   undo       one Ctrl+Z puts all of it back
 *   paste      Ctrl+V after a cut gives the two nodes back, under their own
 *              names, with the line between them
 *   menu       the toolbar's Cut and Paste do the same as the keys
 *   copy       Ctrl+C leaves the nodes where they are, and a paste beside them
 *              is a second pair, named as copies, wired as the first
 *   elsewhere  a cut in one workflow pastes into another, lines and all, and
 *              saves there
 *   typing     Ctrl+X inside the node's name is the text box's, not the canvas's
 *   joints     a joint picked by a click, or by a selection rectangle, comes
 *              off its line on Ctrl+X and on the toolbar's Cut, and one Ctrl+Z
 *              puts it back; Copy of joints alone is nothing; cut with a node,
 *              a joint on a line that stays comes off, and one on a line
 *              between two cut nodes is pasted back with its line
 *
 * Makes its own two workflows and removes them.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, selectNode } from './suite/harness.mjs';

const PREFIX = 'zzEditorCut';
const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = async (nodes, edges) => {
  const id = (
    await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}` },
    })
  ).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: id, input: { nodes, edges } },
  );
  return id;
};

const FIRST = await made(
  [
    { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
    { key: 'make', kind: 'OBJECT', name: 'Make', x: 350, y: 0, outputName: 'made', mappings: [] },
    { key: 'read', kind: 'OBJECT', name: 'Read', x: 700, y: 0, mappings: [] },
  ],
  [
    { source: 'start', target: 'make' },
    { source: 'make', target: 'read' },
  ],
);
const SECOND = await made([{ key: 'begin', kind: 'TRIGGER', name: 'Begin', x: 0, y: 0 }], []);
const THIRD = await made(
  [
    { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
    { key: 'make', kind: 'OBJECT', name: 'Make', x: 350, y: 0, outputName: 'made', mappings: [] },
    { key: 'read', kind: 'OBJECT', name: 'Read', x: 700, y: 0, mappings: [] },
  ],
  [
    { source: 'start', target: 'make' },
    { source: 'make', target: 'read' },
  ],
);

/** Every node on the canvas by the name it shows, and every line by its two ends. */
const canvas = () =>
  page.evaluate(() => {
    const nodes = [...document.querySelectorAll('.react-flow__node')].map((node) => ({
      id: node.getAttribute('data-id'),
      name: node.querySelector('[class*="nodeName"]')?.textContent?.trim() ?? '',
    }));
    const named = new Map(nodes.map((node) => [node.id, node.name]));
    const lines = [...document.querySelectorAll('.react-flow__edge')]
      .map((edge) => edge.getAttribute('data-id') ?? '')
      .filter((id) => !id.startsWith('reads:') && !id.startsWith('saves:'))
      .map((id) => {
        const [from, to] = id.split('->');
        const source = from.slice(0, from.lastIndexOf('-'));
        return `${named.get(source) ?? source}->${named.get(to) ?? to}`;
      });
    return { names: nodes.map((node) => node.name).sort(), lines: lines.sort() };
  });
const node = (name) =>
  page.locator('.react-flow__node').filter({ has: page.locator('[class*="nodeName"]', { hasText: new RegExp(`^${name}$`) }) }).first();

const openEditor = async (workflow) => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${workflow}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await drawn(page, 'the editor', { within: 30_000, still: 0 });
  // StrictMode loads the graph twice; an edit made before the second answer is put back by it.
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(1000);
};
/** Make and Read selected together, as a Shift-click does it. */
const selectPair = async () => {
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  // By the top-left corner: a pasted copy sits forty pixels down and right, over the middle.
  // Pressed again until it takes: a click between React Flow drawing a node and measuring it selects nothing.
  for (let press = 0; press < 5 && (await page.locator('.react-flow__node.selected').count()) === 0; press += 1) {
    await node('Make').click({ position: { x: 12, y: 12 } });
    await page.waitForTimeout(300);
  }
  await node('Read').click({ modifiers: ['Shift'], position: { x: 12, y: 12 } });
  await page.waitForTimeout(200);
  return page.locator('.react-flow__node.selected').count();
};
const settle = () => page.waitForTimeout(800);

try {
  await openEditor(FIRST);
  const before = await canvas();
  record(
    JSON.stringify(before.names) === JSON.stringify(['Make', 'Read', 'Start']) && before.lines.length === 2,
    `the graph is drawn as made (${before.names.join(', ')}; ${before.lines.join(', ')})`,
  );

  /* ---- cut with the keyboard, and undo ---- */

  record((await selectPair()) === 2, 'Make and Read are selected together');
  await page.keyboard.press('Control+x');
  await settle();
  const cut = await canvas();
  record(
    JSON.stringify(cut.names) === JSON.stringify(['Start']) && cut.lines.length === 0,
    `Ctrl+X takes both nodes off the canvas, and every line joined to them (${cut.names.join(', ')}; ${cut.lines.join(', ') || 'no lines'})`,
  );
  await page.keyboard.press('Control+z');
  await settle();
  const undone = await canvas();
  record(
    JSON.stringify(undone.names) === JSON.stringify(['Make', 'Read', 'Start']) &&
      JSON.stringify(undone.lines) === JSON.stringify(['Make->Read', 'Start->Make']),
    `one Ctrl+Z puts the cut back, lines and all (${undone.names.join(', ')}; ${undone.lines.join(', ')})`,
  );

  /* ---- cut from the toolbar, paste with the keyboard ---- */

  await selectPair();
  const cutButton = page.locator('button[aria-label^="Cut"]');
  record((await cutButton.count()) === 1 && (await cutButton.isEnabled()), 'the toolbar offers Cut while nodes are selected');
  await cutButton.click();
  await settle();
  record(JSON.stringify((await canvas()).names) === JSON.stringify(['Start']), 'the toolbar Cut takes them off too');
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+v');
  await settle();
  const pasted = await canvas();
  record(
    JSON.stringify(pasted.names) === JSON.stringify(['Make', 'Read', 'Start']) && pasted.lines.includes('Make->Read'),
    `Ctrl+V after a cut gives them back under their own names, with the line between them (${pasted.names.join(', ')}; ${pasted.lines.join(', ')})`,
  );

  /* ---- copy, and paste beside ---- */

  await selectPair();
  await page.keyboard.press('Control+c');
  await settle();
  record((await canvas()).names.length === 3, 'Ctrl+C leaves the nodes where they are');
  await page.keyboard.press('Control+v');
  await settle();
  const copied = await canvas();
  record(
    JSON.stringify(copied.names) === JSON.stringify(['Make', 'Make copy', 'Read', 'Read copy', 'Start']) &&
      copied.lines.includes('Make copy->Read copy'),
    `a paste beside the originals is a second pair, named as copies and wired as the first (${copied.names.join(', ')}; ${copied.lines.join(', ')})`,
  );

  /* ---- typing ---- */

  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await selectNode(page, node('Read copy'), 'Read copy');
  const nameField = page.locator('#node-name');
  await nameField.waitFor({ timeout: 10_000 });
  await nameField.click();
  await nameField.press('End');
  await nameField.press('Shift+Home');
  await nameField.press('Control+x');
  await settle();
  const typed = await canvas();
  record(
    typed.names.length === 5 && (await nameField.inputValue()) === '',
    `Ctrl+X in the name box cuts the text, not the node (${typed.names.length} nodes, name ${JSON.stringify(await nameField.inputValue())})`,
  );
  await nameField.press('Control+z');
  await page.keyboard.press('Escape');

  /* ---- into another workflow ---- */

  await selectPair();
  await page.keyboard.press('Control+x');
  await settle();
  // Leaving asks about the unsaved cut; this workflow is thrown away anyway.
  page.once('dialog', (dialog) => dialog.accept().catch(() => {}));
  await openEditor(SECOND);
  const pasteButton = page.locator('button[aria-label^="Paste"]');
  record((await pasteButton.count()) === 1 && (await pasteButton.isEnabled()), 'another workflow offers Paste for what was cut');
  await pasteButton.click();
  await settle();
  const elsewhere = await canvas();
  record(
    JSON.stringify(elsewhere.names) === JSON.stringify(['Begin', 'Make', 'Read']) &&
      JSON.stringify(elsewhere.lines) === JSON.stringify(['Make->Read']),
    `the cut pastes into another workflow, with the line between them (${elsewhere.names.join(', ')}; ${elsewhere.lines.join(', ')})`,
  );
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(2000);
  const { workflowGraph } = await graphql(
    `query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { key name } edges { source target } } }`,
    { w: WORKSPACE, f: SECOND },
  );
  const savedNames = workflowGraph.nodes.map((one) => one.name).sort();
  const keyOf = new Map(workflowGraph.nodes.map((one) => [one.key, one.name]));
  const savedLines = workflowGraph.edges.map((one) => `${keyOf.get(one.source)}->${keyOf.get(one.target)}`);
  record(
    JSON.stringify(savedNames) === JSON.stringify(['Begin', 'Make', 'Read']) && JSON.stringify(savedLines) === JSON.stringify(['Make->Read']),
    `and saves there (${savedNames.join(', ')}; ${savedLines.join(', ')})`,
  );

  /* ---- joints ---- */

  // Two joints on Start->Make and one on Make->Read, put where the editor keeps them, below each line.
  const BENDS = `orknux.edge-labels.${THIRD}`;
  await page.evaluate((key) => localStorage.removeItem(key), BENDS);
  await openEditor(THIRD);
  const lineIds = await page.evaluate(() =>
    [...document.querySelectorAll('.react-flow__edge')]
      .map((edge) => edge.getAttribute('data-id') ?? '')
      .filter((id) => !id.startsWith('reads:') && !id.startsWith('saves:')),
  );
  const START_MAKE = lineIds.find((id) => id.startsWith('start-'));
  const MAKE_READ = lineIds.find((id) => id.startsWith('make-'));
  await page.evaluate(
    ([key, first, second]) =>
      localStorage.setItem(
        key,
        JSON.stringify({ [first]: { x: -40, y: 90, more: [{ x: 40, y: 90 }] }, [second]: { x: 0, y: 90 } }),
      ),
    [BENDS, START_MAKE, MAKE_READ],
  );
  await openEditor(THIRD);
  /** The joints a line holds, as the editor keeps them; Make->Read by its two names, since a paste renames it. */
  const pointsOn = (edge) =>
    page.evaluate(
      ([key, id]) => {
        const bend = JSON.parse(localStorage.getItem(key) ?? '{}')[id];
        return bend === undefined ? 0 : 1 + (bend.more?.length ?? 0);
      },
      [BENDS, edge],
    );
  const joint = (edge, at) => page.locator(`button[data-edge="${edge}"][data-point="${at}"]`);
  const clickJoint = async (edge, at, modifiers = []) => {
    const box = await joint(edge, at).boundingBox();
    for (const key of modifiers) await page.keyboard.down(key);
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    for (const key of modifiers) await page.keyboard.up(key);
    await page.waitForTimeout(200);
  };
  const isPicked = (edge, at) => joint(edge, at).evaluate((one) => one.className.includes('edgePointPicked'));
  const counts = async () => `${await pointsOn(START_MAKE)}+${await pointsOn(MAKE_READ)}`;
  record((await counts()) === '2+1', `the lines are drawn bent (${await counts()} joints)`);

  // A click picks one joint; Ctrl+X takes that one off and keeps the line and the nodes.
  await clickJoint(START_MAKE, 1);
  record(await isPicked(START_MAKE, 1), 'a click picks a joint, drawn as picked');
  await page.keyboard.press('Control+x');
  await settle();
  const clicked = await canvas();
  record(
    (await counts()) === '1+1' && clicked.names.length === 3 && clicked.lines.length === 2,
    `Ctrl+X takes the clicked joint off its line, and leaves the lines and nodes (${await counts()} joints; ${clicked.names.length} nodes, ${clicked.lines.length} lines)`,
  );
  await page.keyboard.press('Control+z');
  await settle();
  record((await counts()) === '2+1', `one Ctrl+Z puts the joint back (${await counts()} joints)`);

  // A rectangle round both joints of Start->Make picks them; Ctrl+X takes both off in one step.
  const one = await joint(START_MAKE, 0).boundingBox();
  const two = await joint(START_MAKE, 1).boundingBox();
  await page.keyboard.down('Shift');
  await page.mouse.move(one.x - 20, one.y - 20);
  await page.mouse.down();
  await page.mouse.move(two.x + two.width + 20, two.y + two.height + 20, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  await page.waitForTimeout(200);
  record(
    (await isPicked(START_MAKE, 0)) && (await isPicked(START_MAKE, 1)) && (await page.locator('.react-flow__node.selected').count()) === 0,
    'a selection rectangle picks both joints and no node',
  );
  await page.keyboard.press('Control+x');
  await settle();
  record(
    (await counts()) === '0+1' && (await canvas()).lines.length === 2,
    `Ctrl+X takes the rectangle's joints off, and the line stays (${await counts()} joints)`,
  );
  await page.keyboard.press('Control+z');
  await settle();
  record((await counts()) === '2+1', `one Ctrl+Z puts both back (${await counts()} joints)`);

  // Copy of joints alone is nothing, and says so by being grey; Cut is offered and works from the toolbar.
  const clipBefore = await page.evaluate(() => localStorage.getItem('orknux.workflowClipboard'));
  await clickJoint(MAKE_READ, 0);
  const copyButton = page.locator('button[aria-label^="Copy"]').first();
  record(await cutButton.isEnabled(), 'the toolbar offers Cut while a joint is picked');
  record(!(await copyButton.isEnabled()), 'and not Copy, which has nothing to take');
  await page.keyboard.press('Control+c');
  await settle();
  record(
    (await page.evaluate(() => localStorage.getItem('orknux.workflowClipboard'))) === clipBefore && (await counts()) === '2+1',
    'Ctrl+C on joints alone leaves the clipboard and the joints as they were',
  );
  await clickJoint(MAKE_READ, 0);
  await cutButton.click();
  await settle();
  record((await counts()) === '2+0', `the toolbar's Cut takes the joint off (${await counts()} joints)`);
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+z');
  await settle();
  record((await counts()) === '2+1', `and one Ctrl+Z puts it back (${await counts()} joints)`);

  // A node and a joint on a line that stays: the node goes, and the joint comes off its line.
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await node('Read').click({ position: { x: 12, y: 12 } });
  await page.waitForTimeout(300);
  await clickJoint(START_MAKE, 0, ['Control']);
  record(
    (await page.locator('.react-flow__node.selected').count()) === 1 && (await isPicked(START_MAKE, 0)),
    `Read and a joint on Start->Make are selected together (${await page.locator('.react-flow__node.selected').count()} node, joint ${(await isPicked(START_MAKE, 0)) ? '' : 'not '}picked)`,
  );
  await page.keyboard.press('Control+x');
  await settle();
  const mixed = await canvas();
  record(
    JSON.stringify(mixed.names) === JSON.stringify(['Make', 'Start']) &&
      JSON.stringify(mixed.lines) === JSON.stringify(['Start->Make']) &&
      (await pointsOn(START_MAKE)) === 1,
    `Ctrl+X takes Read and its line, and the joint off the line that stays (${mixed.names.join(', ')}; ${mixed.lines.join(', ')}; ${await pointsOn(START_MAKE)} joint left)`,
  );
  await page.keyboard.press('Control+z');
  await settle();
  const back = await canvas();
  record(
    back.names.length === 3 && back.lines.length === 2 && (await counts()) === '2+1',
    `one Ctrl+Z puts the node, its line and the joint back (${back.names.length} nodes, ${back.lines.length} lines, ${await counts()} joints)`,
  );

  // Two nodes cut with the line between them: its joint goes onto the clipboard and comes back with it.
  await selectPair();
  await page.keyboard.press('Control+x');
  await settle();
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('Control+v');
  await settle();
  const pastedLine = await page.evaluate(() => {
    const named = new Map(
      [...document.querySelectorAll('.react-flow__node')].map((one) => [
        one.getAttribute('data-id'),
        one.querySelector('[class*="nodeName"]')?.textContent?.trim(),
      ]),
    );
    return [...document.querySelectorAll('.react-flow__edge')]
      .map((edge) => edge.getAttribute('data-id') ?? '')
      .find((id) => {
        const [from, to] = id.split('->');
        return named.get(from.slice(0, from.lastIndexOf('-'))) === 'Make' && named.get(to) === 'Read';
      });
  });
  record(
    pastedLine !== undefined && (await pointsOn(pastedLine)) === 1,
    `a joint on the line between two cut nodes is pasted back with it (${pastedLine === undefined ? 'no line' : `${await pointsOn(pastedLine)} joint`})`,
  );
} finally {
  await sweep();
}

await finish(browser);
