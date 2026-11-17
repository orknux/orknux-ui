/**
 * Everything a line can be given fits the side panel without scrolling.
 *
 * With a line selected the panel held its label, style, routing, colour,
 * thickness and both ends one under another, in a space that showed about
 * two-thirds of them: "At the end" - the arrowhead, the thing most often
 * changed - was below the fold, behind a scroll nobody thinks to make in a
 * panel. Now the pairs stand side by side and the settings take the room the
 * line's properties need. This measures the panel with a line selected, at a
 * laptop's height.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzLinePanel ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'second', x: 400, y: 0, w: 160, h: 60 },
      ],
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'arrow', label: 'calls' }],
    }),
  })
).createDiagram.id;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  const line = await page.locator('.react-flow__edge[data-id="e"] path.react-flow__edge-path').boundingBox();
  await page.mouse.click(line.x + line.width / 3, line.y + line.height / 2);
  await page.getByTestId('diagram-edge-inspector').waitFor({ timeout: 5_000 });
  await page.waitForTimeout(400);

  const seen = await page.evaluate(() => {
    const settings = document.querySelector('[data-testid="diagram-panel-settings"]');
    const room = settings.getBoundingClientRect();
    const box = (testId) => document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect();
    return {
      scroll: settings.scrollHeight,
      shown: settings.clientHeight,
      across: settings.scrollWidth - settings.clientWidth,
      bottom: room.bottom,
      end: box('diagram-edge-end')?.bottom,
      start: box('diagram-edge-start')?.top,
      endTop: box('diagram-edge-end')?.top,
      style: box('diagram-edge-line')?.top,
      routing: box('diagram-edge-routing')?.top,
    };
  });
  record(seen.scroll <= seen.shown + 1, `with a line selected the settings need no scrolling (${seen.scroll}px of content in ${seen.shown}px)`);
  record(seen.end !== undefined && seen.end <= seen.bottom, `"At the end" is on screen (its bottom at ${Math.round(seen.end ?? NaN)}, the settings end at ${Math.round(seen.bottom)})`);
  record(seen.across <= 0, 'and nothing runs off to the side');
  record(Math.abs((seen.style ?? 0) - (seen.routing ?? 99)) < 1, 'line style and routing share a row');
  record(Math.abs((seen.start ?? 0) - (seen.endTop ?? 99)) < 1, 'and so do the two ends');
} catch (error) {
  // A step that throws is a failure, said as one: the clean-up below must not let the run end as a pass.
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
} finally {
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
