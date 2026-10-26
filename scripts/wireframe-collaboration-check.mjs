/**
 * Two people in one wireframe's editor. Issue #683, as workflows have had since #645.
 *
 * Each tab sees the other is there and where it points. An element moved in
 * one is saved without pressing Save and moves in the other without a reload.
 * Two elements moved in the two tabs at the same moment both stay moved: the
 * second save is refused over the first's revision, merged element by element
 * and sent again, rather than writing over it.
 */
import { WORKSPACE, record, finish } from './suite/harness.mjs';
import { eachSeesTheOther, openBoth, pointerReaches, reachesTheServer, reachesTheTab, staleSaveRefused, twoTabs } from './suite/live-room.mjs';

const { browser, first, second, graphql, closeSecond } = await twoTabs();

const drawn = JSON.stringify({
  elements: [
    { id: 'left', type: 'rect', x: 0, y: 0, w: 120, h: 60, text: 'Left one' },
    { id: 'right', type: 'rect', x: 480, y: 0, w: 120, h: 60, text: 'Right one' },
  ],
});
const { createWireframe } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzTogether ${Date.now()}`, d: drawn },
);
const id = createWireframe.id;
const stored = async () => {
  const { wireframe } = await graphql('query ($id: ID!) { wireframe(id: $id) { revision document } }', { id });
  return { revision: wireframe.revision, elements: JSON.parse(wireframe.document).elements };
};
const xOf = (held, key) => held.elements.find((one) => one.id === key)?.x;
const element = (key) => `[data-testid="wireframe-svg"] [data-element-id="${key}"]`;

async function drag(page, key, dx) {
  const box = await page.locator(element(key)).first().boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx / 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
}

try {
  await openBoth(first, second, `/workspace/${WORKSPACE}/design/wireframes/${id}`, element('right'));
  await eachSeesTheOther(first, second);
  await pointerReaches(first, second, '[data-testid="wireframe-canvas"]');

  const before = await stored();
  const thereBefore = (await second.locator(element('left')).first().boundingBox()).x;
  await drag(first, 'left', 160);
  await reachesTheServer(stored, (held) => xOf(held, 'left') > xOf(before, 'left') + 50, 'an element moved');
  await reachesTheTab(
    second,
    `(() => { const one = document.querySelector('${element('left')}'); return one !== null && one.getBoundingClientRect().x > ${thereBefore} + 50; })()`,
    'and it moves there too',
  );

  await first.waitForTimeout(1500);
  const was = await stored();
  await Promise.all([drag(first, 'left', -120), drag(second, 'right', 140)]);
  await reachesTheServer(
    stored,
    (held) => xOf(held, 'left') < xOf(was, 'left') - 50 && xOf(held, 'right') > xOf(was, 'right') + 50,
    'two moves made at once in two tabs both stay, and',
  );

  const now = await stored();
  await staleSaveRefused(
    () => graphql('mutation ($id: ID!, $d: String!, $r: Int) { saveWireframe(id: $id, document: $d, revision: $r) { revision } }', { id, d: drawn, r: now.revision - 1 }),
    'WireframeChanged',
  );
  record(xOf(await stored(), 'right') === xOf(now, 'right'), 'and nothing of it was written');
} finally {
  await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id }).catch(() => undefined);
  await closeSecond();
}

await finish(browser);
