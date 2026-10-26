/**
 * Two people in one diagram's editor. Issue #683, as workflows have had since #645.
 *
 * Each tab sees the other is there and where it points. A shape moved in one
 * is saved without pressing Save and moves in the other without a reload. Two
 * shapes moved in the two tabs at the same moment both stay moved: the second
 * save is refused over the first's revision, merged node by node and sent
 * again, rather than writing over it.
 */
import { WORKSPACE, record, finish } from './suite/harness.mjs';
import { eachSeesTheOther, openBoth, pointerReaches, reachesTheServer, reachesTheTab, staleSaveRefused, twoTabs } from './suite/live-room.mjs';

const { browser, first, second, graphql, closeSecond } = await twoTabs();

const drawn = JSON.stringify({
  nodes: [
    { id: 'left', kind: 'rounded', label: 'Left one', x: 0, y: 0 },
    { id: 'right', kind: 'rounded', label: 'Right one', x: 520, y: 0 },
  ],
  edges: [],
});
const { createDiagram } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzTogether ${Date.now()}`, d: drawn },
);
const id = createDiagram.id;
const stored = async () => {
  const { diagram } = await graphql('query ($id: ID!) { diagram(id: $id) { revision document } }', { id });
  return { revision: diagram.revision, nodes: JSON.parse(diagram.document).nodes };
};
const xOf = (held, key) => held.nodes.find((one) => one.id === key)?.x;

async function drag(page, key, dx) {
  const box = await page.locator(`.react-flow__node[data-id="${key}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
}

try {
  await openBoth(first, second, `/workspace/${WORKSPACE}/explore/diagrams/${id}`, '.react-flow__node[data-id="right"]');
  await eachSeesTheOther(first, second);
  await pointerReaches(first, second, '.react-flow__pane');

  // Moved here, saved without a Save, and moved there.
  const before = await stored();
  const thereBefore = (await second.locator('.react-flow__node[data-id="left"]').boundingBox()).x;
  await drag(first, 'left', 160);
  await reachesTheServer(stored, (held) => xOf(held, 'left') > xOf(before, 'left') + 50, 'a shape moved');
  await reachesTheTab(
    second,
    `(() => { const one = document.querySelector('.react-flow__node[data-id="left"]'); return one !== null && one.getBoundingClientRect().x > ${thereBefore} + 50; })()`,
    'and it moves there too',
  );

  // Both at once: neither move is lost.
  await first.waitForTimeout(1500);
  const was = await stored();
  await Promise.all([drag(first, 'left', -120), drag(second, 'right', 140)]);
  await reachesTheServer(
    stored,
    (held) => xOf(held, 'left') < xOf(was, 'left') - 50 && xOf(held, 'right') > xOf(was, 'right') + 50,
    'two moves made at once in two tabs both stay, and',
  );

  // Under it all, a save over an older revision is refused, not written.
  const now = await stored();
  await staleSaveRefused(
    () => graphql('mutation ($id: ID!, $d: String!, $r: Int) { saveDiagram(id: $id, document: $d, revision: $r) { revision } }', { id, d: drawn, r: now.revision - 1 }),
    'DiagramChanged',
  );
  record(xOf(await stored(), 'right') === xOf(now, 'right'), 'and nothing of it was written');
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  await closeSecond();
}

await finish(browser);
