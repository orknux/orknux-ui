/**
 * A diagram's line has a style and a mark at each end, each picked with its
 * picture beside its name; and a line saved as one of the four old kinds is
 * drawn as it always was.
 *
 * Makes its own diagram, with a dashed arrow and an arrow both ways saved the
 * old way, checks they draw as before, restyles the first through the panel -
 * dotted, a filled diamond at its start, an open arrow at its end - and reads
 * back both what is drawn and what was saved. Removes the diagram.
 */
import { BASE, WORKSPACE, open, record, finish, saveEditor } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const nodes = [
  { id: 'a', kind: 'box', label: 'Order', x: 0, y: 0 },
  { id: 'b', kind: 'box', label: 'Line', x: 420, y: 0 },
  { id: 'c', kind: 'box', label: 'Client', x: 0, y: 300 },
  { id: 'd', kind: 'box', label: 'Server', x: 420, y: 300 },
];
const edges = [
  { id: 'dashed', from: 'a', to: 'b', kind: 'dashed' },
  { id: 'both', from: 'c', to: 'd', kind: 'both' },
];
const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzLines ${Date.now()}`, d: JSON.stringify({ nodes, edges }) },
);

/** A dash pattern as numbers, however the browser spells it: "6, 4", "6px 4px" and "6 4" are one. */
const dashed = (said) => said.replace(/px/g, '').split(/[\s,]+/).filter(Boolean).join(' ');

/** What the line of an edge is drawn with: its dashes and the markers at its two ends. */
const drawn = (id) =>
  page.evaluate((edge) => {
    const path = document.querySelector(`.react-flow__edge[data-id="${edge}"] path.react-flow__edge-path`);
    if (path === null) return null;
    return {
      dashes: path.style.strokeDasharray || path.getAttribute('stroke-dasharray') || '',
      start: path.getAttribute('marker-start') ?? '',
      end: path.getAttribute('marker-end') ?? '',
    };
  }, id);

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.locator('.react-flow__edge[data-id="dashed"] path.react-flow__edge-path').waitFor({ state: 'attached', timeout: 10_000 });
  await page.getByRole('button', { name: /fit view/i }).click().catch(() => {});
  await page.waitForTimeout(600);

  // The old kinds, drawn as they were: React Flow's closed arrow, dashed six and four.
  const old = await drawn('dashed');
  record(
    old !== null && dashed(old.dashes) === '6 4' && /arrowclosed/i.test(old.end) && old.start === '',
    `a line saved as a dashed arrow is drawn as one (${JSON.stringify(old)})`,
  );
  const both = await drawn('both');
  record(
    both !== null && both.dashes === '' && /arrowclosed/i.test(both.end) && /arrowclosed/i.test(both.start),
    `a line saved as an arrow both ways has an arrow at each end (${JSON.stringify(both)})`,
  );

  // The panel: three pickers, each row drawn as well as named.
  // Clicked where the line runs, half way along, as a person would.
  const along = await page.locator('.react-flow__edge[data-id="dashed"] path.react-flow__edge-path').boundingBox();
  if (along !== null) await page.mouse.click(along.x + along.width / 2, along.y + along.height / 2);
  const line = page.getByTestId('diagram-edge-line');
  const offered = await line.waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  const ends = (await page.getByTestId('diagram-edge-start').count()) === 1 && (await page.getByTestId('diagram-edge-end').count()) === 1;
  record(offered && ends, 'a selected line offers its style and each of its ends');
  record(((await line.textContent()) ?? '').includes('Dashed') && (await line.locator('[data-line-icon="dashed"]').count()) === 1,
    `its style shows the one it has, drawn (${await line.textContent().catch(() => '')})`);

  /** Opens a picker and takes the row named [name]; how many of its rows carry a drawing. */
  async function pick(testId, name, icon) {
    await page.getByTestId(testId).click();
    const rows = page.getByRole('option');
    await rows.first().waitFor({ timeout: 5_000 });
    const drawnRows = await page.locator(`[role="option"] [${icon}]`).count();
    const all = await rows.count();
    await rows.filter({ hasText: new RegExp(`^\\s*${name}\\s*$`) }).first().click();
    await page.waitForTimeout(300);
    return { drawnRows, all };
  }
  const lines = await pick('diagram-edge-line', 'Dotted', 'data-line-icon');
  record(lines.all === 3 && lines.drawnRows === 3, `the style is solid, dashed or dotted, each drawn (${JSON.stringify(lines)})`);
  const starts = await pick('diagram-edge-start', 'Filled diamond', 'data-end-icon');
  record(starts.all === 7 && starts.drawnRows === 7, `each end offers seven marks, each drawn (${JSON.stringify(starts)})`);
  await pick('diagram-edge-end', 'Open arrow', 'data-end-icon');

  const restyled = await drawn('dashed');
  record(
    restyled !== null && dashed(restyled.dashes) === '1.5 3.5'
      && restyled.start.includes('diagram-start-filled-diamond') && restyled.end.includes('diagram-end-open'),
    `the line is drawn dotted, a filled diamond at its start and an open arrow at its end (${JSON.stringify(restyled)})`,
  );
  const marks = await page.evaluate(() => ['diagram-start-filled-diamond', 'diagram-end-open'].every((id) => document.getElementById(id)?.tagName.toLowerCase() === 'marker'));
  record(marks, 'the marks it names are on the page');

  await saveEditor(page, 'diagram-save');
  const { diagram } = await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id: made.id });
  const saved = JSON.parse(diagram.document).edges.find((one) => one.id === 'dashed');
  record(
    saved?.line === 'dotted' && saved?.start === 'filled-diamond' && saved?.end === 'open',
    `and it is saved so (${JSON.stringify(saved)})`,
  );
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id }).catch(() => undefined);
}

await finish(browser);
