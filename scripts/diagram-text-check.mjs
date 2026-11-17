/**
 * The words in a shape can be put against any side of it, and made any size.
 *
 * A label sat in the middle of its box and nowhere else, at the one size the
 * editor draws - so a big box used as a region had its title lost in its
 * centre, and a heading could not be bigger than a caption. A shape now says
 * where its words go, across and down, and how big they are. This sets each
 * from the side panel, measures where the words are drawn and how big, and
 * reads the choice back from the server, from a reload and from the export.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzText ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({ nodes: [{ id: 'a', kind: 'box', label: 'words', x: 0, y: 0, w: 320, h: 200 }], edges: [] }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
/** How far the drawn words stand from each side of their shape, and how big they are. */
const words = () =>
  page.evaluate(() => {
    const node = document.querySelector('.react-flow__node[data-id="a"]');
    const label = node.querySelector('[data-testid="diagram-node-label-text"]');
    const range = document.createRange();
    range.selectNodeContents(label);
    const drawn = range.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    return {
      left: drawn.left - box.left,
      right: box.right - drawn.right,
      top: drawn.top - box.top,
      bottom: box.bottom - drawn.bottom,
      size: getComputedStyle(label).fontSize,
    };
  });
const arrive = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }
};

try {
  await arrive();
  const usual = await words();
  record(Math.abs(usual.left - usual.right) < 4 && Math.abs(usual.top - usual.bottom) < 4, 'left alone, the words of a box are in its middle');

  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.getByTestId('diagram-node-text').waitFor({ timeout: 5_000 });
  record((await page.getByTestId('diagram-node-align-center').getAttribute('aria-pressed')) === 'true', 'and the panel says so: centre is the one pressed');

  await page.getByTestId('diagram-node-align-left').click();
  await page.waitForTimeout(250);
  const left = await words();
  record(left.left < 24 && left.right > 150, `"to the left" puts them against the left side (${Math.round(left.left)}px from it, ${Math.round(left.right)}px from the right)`);

  await page.getByTestId('diagram-node-valign-bottom').click();
  await page.waitForTimeout(250);
  const low = await words();
  record(low.bottom < 24 && low.top > 100, `"at the bottom" puts them against the bottom (${Math.round(low.bottom)}px from it, ${Math.round(low.top)}px from the top)`);

  await page.getByTestId('diagram-node-align-right').click();
  await page.waitForTimeout(250);
  const right = await words();
  record(right.right < 24 && right.left > 150, `"to the right" puts them against the right side (${Math.round(right.right)}px from it)`);

  const field = page.getByTestId('diagram-node-text-size');
  await field.fill('22');
  await field.evaluate((one) => one.blur());
  await page.waitForTimeout(300);
  const big = await words();
  record(big.size === '22px', `a text size of 22 draws the words at ${big.size}`);
  record(usual.size !== '22px', `which is not what they were (${usual.size})`);

  await page.waitForTimeout(3000);
  const kept = (await stored()).nodes.find((node) => node.id === 'a');
  record(kept?.align === 'right' && kept?.valign === 'bottom', `the server keeps where the words go (${kept?.align}, ${kept?.valign})`);
  record(kept?.textSize === 22, `and their size (${kept?.textSize})`);

  await arrive();
  const again = await words();
  record(again.right < 24 && again.bottom < 24 && again.size === '22px', 'a reload draws them where they were put, at the size they were given');

  // What the export draws is what the canvas drew.
  const svg = await (await page.request.get(`${BASE}/api/diagrams/${id}/export/svg`)).text();
  const drawn = /<text[^>]*>(?:(?!<\/text>)[\s\S])*words/.exec(svg)?.[0] ?? '';
  record(/font-size="22"/.test(drawn), 'the exported picture writes them at that size');
  record(/text-anchor="end"/.test(drawn), 'and against the right side');

  // Back to what the kind does by itself is back to saying nothing.
  await page.locator('.react-flow__node[data-id="a"]').click();
  await page.getByTestId('diagram-node-align-center').click();
  await page.getByTestId('diagram-node-valign-middle').click();
  await page.getByTestId('diagram-node-text-size').fill('');
  await page.getByTestId('diagram-node-text-size').evaluate((one) => one.blur());
  await page.waitForTimeout(3000);
  const plain = (await stored()).nodes.find((node) => node.id === 'a');
  record(plain !== undefined && plain.align === undefined && plain.valign === undefined && plain.textSize === undefined, 'put back to the middle and the usual size, the shape says nothing about its words');
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
