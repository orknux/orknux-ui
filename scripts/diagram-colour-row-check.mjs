/**
 * The row of colours fits the side panel, however narrow the panel is.
 *
 * The swatches were a row of fixed squares, a few pixels wider altogether than
 * the panel at the width it opens at: the last colour was cut in half by the
 * panel's edge and the settings grew a sideways scroll to reach it. The row
 * now shares the width it is given. This selects a shape at the narrowest the
 * panel goes, at the width it opens at and at a wide one, and measures the row
 * against the panel each time.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzColourRow ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({ nodes: [{ id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 64 }], edges: [] }),
  })
).createDiagram.id;

const measure = () =>
  page.evaluate(() => {
    const settings = document.querySelector('[data-testid="diagram-panel-settings"]');
    const room = settings.getBoundingClientRect();
    const inside = room.left + settings.clientLeft + settings.clientWidth;
    // The row is whatever holds the No colour mark: the swatches, the picker and the toggle beside it.
    const row = document.querySelector('[data-testid="diagram-node-colour-none"]').parentElement;
    const swatches = [...row.children].map((one) => one.getBoundingClientRect()).filter((one) => one.width > 0);
    return {
      panel: Math.round(document.querySelector('[data-testid="diagram-panel"]').getBoundingClientRect().width),
      spare: settings.scrollWidth - settings.clientWidth,
      swatches: swatches.length,
      over: Math.max(...swatches.map((one) => one.right)) - inside,
      narrowest: Math.min(...swatches.map((one) => one.width)),
      rows: new Set(swatches.map((one) => Math.round(one.top))).size,
    };
  });

try {
  for (const [width, what] of [
    ['300', 'at its narrowest'],
    [null, 'at the width it opens at'],
    ['460', 'made wide'],
  ]) {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate((to) => (to === null ? window.localStorage.removeItem('orknux.diagram.panel-width') : window.localStorage.setItem('orknux.diagram.panel-width', to)), width);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(800);
    if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
      await page.getByTestId('diagram-mode-edit').click();
    }
    await page.locator('.react-flow__node[data-id="a"]').click();
    await page.getByTestId('diagram-node-colour-none').waitFor({ timeout: 5_000 });
    await page.waitForTimeout(300);
    const seen = await measure();
    record(seen.swatches >= 8, `the panel ${what} (${seen.panel}px) offers its colours (${seen.swatches})`);
    record(seen.over <= 0.5, `none of them past the panel's edge (the last ends ${Math.abs(seen.over).toFixed(1)}px ${seen.over > 0 ? 'outside' : 'inside'} it)`);
    record(seen.spare <= 0, `and the settings do not scroll sideways (${seen.spare}px over)`);
    record(seen.narrowest >= 14, `each still big enough to press (the narrowest is ${seen.narrowest.toFixed(1)}px)`);
  }
} catch (error) {
  // A step that throws is a failure, said as one: the clean-up below must not let the run end as a pass.
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
} finally {
  await page.evaluate(() => window.localStorage.removeItem('orknux.diagram.panel-width')).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  // A deleted diagram is kept in the workspace's bin, and a check's own is nobody's to restore.
  const kept = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
    .then((data) => data.recycleBin.content)
    .catch(() => []);
  for (const entry of kept.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
  }
}

await finish(browser);
