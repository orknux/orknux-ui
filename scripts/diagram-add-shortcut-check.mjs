/**
 * The Add shortcut opens a menu of shapes where the pointer is, as it does in
 * a workflow.
 *
 * In the workflow editor a key opens the Add menu and a node is made without
 * the toolbar; in a diagram the same key did nothing, and every shape meant a
 * trip to the top of the page and a drag back. The key now opens the shapes
 * at the pointer, the arrows choose and Enter puts the shape there. This
 * presses the key over the canvas, picks with the keyboard, and measures where
 * the shape landed.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzAddKey ${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({ nodes: [{ id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 }], edges: [] }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const menu = page.getByTestId('diagram-add-menu');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  const first = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
  // Above the first shape, where the whole menu has room under the pointer: nearer the bottom it is moved up to fit.
  // And far enough left that a category's shapes have room to open on the menu's right.
  const at = { x: first.x + 200, y: first.y - 120 };
  await page.mouse.move(at.x, at.y, { steps: 3 });
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  record((await menu.count()) === 1 && (await menu.isVisible()), 'the Add key opens a menu of shapes over the canvas');
  const box = await menu.boundingBox();
  record(box !== null && Math.abs(box.x - at.x) <= 16 && Math.abs(box.y - at.y) <= 16, `where the pointer is (${box === null ? 'nowhere' : `${Math.round(box.x - at.x)}, ${Math.round(box.y - at.y)} from it`})`);
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
  record((await focused()) === 'diagram-add-search', `with its search under the keyboard (${await focused()})`);

  // The arrows lead out of the search to the first shape, and on through the shapes.
  await page.keyboard.press('ArrowDown');
  const opening = await focused();
  record(opening.startsWith('diagram-add-menu-'), `the down arrow goes to the first shape (${opening})`);
  await page.keyboard.press('ArrowDown');
  const chosen = await focused();
  record(chosen.startsWith('diagram-add-menu-') && chosen !== opening, `the arrows move through it (${chosen})`);
  const kind = chosen.replace('diagram-add-menu-', '');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  record((await menu.count()) === 0, 'Enter closes the menu');
  record((await page.locator('.react-flow__node').count()) === 2, 'and makes a shape');
  const made = await page.locator('.react-flow__node:not([data-id="a"])').boundingBox();
  const offX = made === null ? NaN : made.x + made.width / 2 - at.x;
  const offY = made === null ? NaN : made.y + made.height / 2 - at.y;
  record(Math.abs(offX) <= 6 && Math.abs(offY) <= 6, `with its middle where the pointer was (${Math.round(offX)}, ${Math.round(offY)} off, the grid's worth)`);

  await page.waitForTimeout(3000);
  const kept = (await stored()).nodes.find((node) => node.id !== 'a');
  record(kept?.kind === kind, `the server keeps it, of the kind that was chosen (${kept?.kind})`);

  /*
   * Opened again, what was just used leads, under the keyboard, and the
   * categories are names, each opening its shapes in a menu beside it: all of
   * them unfolded in the one list were forty rows and a scroll to find the
   * next category.
   */
  await page.mouse.move(at.x, at.y);
  await page.keyboard.press('a');
  await page.waitForTimeout(300);
  await page.keyboard.press('ArrowDown');
  const again = await focused();
  record(again === `diagram-add-recent-${kind}`, `opened again, the shape just made leads it as recently used, the first the arrow reaches (${again})`);
  await page.keyboard.press('ArrowUp');
  record((await focused()) === 'diagram-add-search', 'and up from it goes back to the search');
  const side = page.getByTestId('diagram-add-side');
  const short = await menu.evaluate((one) => ({
    rows: one.querySelectorAll('[role="menuitem"]').length,
    groups: one.querySelectorAll('[data-testid^="diagram-add-group-"]').length,
    scrolls: one.scrollHeight > one.clientHeight + 1,
  }));
  record(short.groups === 4 && short.rows <= 9 && !short.scrolls && (await side.count()) === 0, `with the four categories beneath it, nothing open beside it - ${short.rows} rows, no scroll`);

  // Pointing at a category opens its shapes beside the menu, at its row; pointing at another changes them, nothing scrolled.
  await page.getByTestId('diagram-add-group-flowchart').hover();
  await page.waitForTimeout(250);
  const main = await menu.boundingBox();
  const flowRow = await page.getByTestId('diagram-add-group-flowchart').boundingBox();
  const beside = await side.boundingBox();
  record(
    (await side.getAttribute('data-group-shown')) === 'flowchart' && (await page.getByTestId('diagram-add-menu-database').count()) === 1 && beside !== null && beside.x >= main.x + main.width &&
      // At its row, or as near as the window lets a list that long be: held up off the window's foot.
      (Math.abs(beside.y - flowRow.y) <= 12 || (beside.y < flowRow.y && Math.abs(beside.y + beside.height - (950 - 8)) <= 2)),
    `pointing at Flowchart opens its shapes in a menu to the right, at its row or held inside the window (${beside && Math.round(beside.x - main.x - main.width)}px off, ${beside && Math.round(beside.y - flowRow.y)}px down)`,
  );
  await page.getByTestId('diagram-add-group-uml').hover();
  await page.waitForTimeout(250);
  record((await side.getAttribute('data-group-shown')) === 'uml' && (await page.getByTestId('diagram-add-menu-database').count()) === 0, 'pointing at UML puts Flowchart\'s away and opens its own');

  // The keyboard: right opens the category's shapes and goes into them, left comes back to its name.
  await page.getByTestId('diagram-add-group-flowchart').focus();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(250);
  const inside = await focused();
  record((await side.getAttribute('data-group-shown')) === 'flowchart' && inside.startsWith('diagram-add-menu-'), `the right arrow opens a category and goes into its shapes (${inside})`);
  await page.keyboard.press('ArrowDown');
  const second = await focused();
  record(second.startsWith('diagram-add-menu-') && second !== inside, 'the arrows walk them');
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  record((await side.count()) === 0 && (await focused()) === 'diagram-add-group-flowchart', 'and the left arrow comes back to the category\'s name');

  // The scrollbar of a menu that scrolls is bright enough to see on it.
  const bar = await menu.evaluate((one) => {
    const thumb = getComputedStyle(one).scrollbarColor.match(/rgba?\([^)]*\)/)?.[0] ?? '';
    const back = getComputedStyle(one).backgroundColor;
    const lum = (css) => {
      const [r, g, b] = (css.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number).map((c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const [hi, lo] = [lum(thumb), lum(back)].sort((x, y) => y - x);
    return { thumb, contrast: (hi + 0.05) / (lo + 0.05) };
  });
  record(bar.contrast >= 3, `a menu's scrollbar stands out from it (${bar.thumb}, ${bar.contrast.toFixed(1)} : 1)`);

  // Typed on a row, letters search every category at once: the keyboard goes to the field, and down into what it found.
  await page.getByTestId('diagram-add-group-basic').focus();
  await page.keyboard.type('datab');
  await page.waitForTimeout(200);
  const field = page.getByTestId('diagram-add-search');
  const matched = await menu.evaluate((one) => [...one.querySelectorAll('[data-kind]')].map((row) => row.getAttribute('data-kind')));
  record(
    (await field.inputValue()) === 'datab' && (await focused()) === 'diagram-add-search' && JSON.stringify(matched) === '["database"]' && (await side.count()) === 0,
    `typing searches every shape at once (${await field.inputValue()} found ${JSON.stringify(matched)})`,
  );
  await page.keyboard.press('ArrowDown');
  record((await focused()) === 'diagram-add-menu-database', 'and the down arrow goes into what it found');
  await field.focus();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  record((await field.inputValue()) === '' && (await menu.count()) === 1 && (await page.getByTestId('diagram-add-group-uml').count()) === 1, 'Escape in the search empties it and brings the categories back, the menu still open');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);

  // The key again puts the menu away, and so does Escape.
  await page.keyboard.press('a');
  await page.waitForTimeout(250);
  const reopened = (await menu.count()) === 1;
  await page.keyboard.press('a');
  await page.waitForTimeout(250);
  record(reopened && (await menu.count()) === 0, 'the key a second time puts the menu away');
  await page.keyboard.press('a');
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(250);
  record((await menu.count()) === 0 && (await page.locator('.react-flow__node').count()) === 2, 'and so does Escape, making nothing');

  // A letter typed into a name is a letter.
  await page.locator('.react-flow__node[data-id="a"]').dblclick();
  await page.getByTestId('diagram-label-editor').waitFor({ timeout: 5_000 });
  await page.keyboard.type('a banana');
  record((await menu.count()) === 0, 'typed into a name, the letter opens nothing');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(3000);
  record((await stored()).nodes.find((node) => node.id === 'a')?.label.includes('a banana') === true, 'and is kept as part of the name');

  // Reading a diagram, there is nothing to add.
  await page.getByTestId('diagram-mode-view').click();
  await page.waitForTimeout(300);
  await page.mouse.move(at.x + 40, at.y);
  await page.keyboard.press('a');
  await page.waitForTimeout(250);
  record((await menu.count()) === 0, 'viewing, the key opens nothing');
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
