/**
 * Sheets in Design: the list lists Sheets after Documents, a new sheet opens
 * in the editor, numbers typed into cells and a formula over them draw the
 * value the server worked out, that value is still drawn after a reload, and
 * dragging a column's edge makes the column drawn wider. An empty sheet draws
 * its column lines too. While typing, an arrow goes to the next cell, a formula's
 * cells are outlined, and function names are offered.
 *
 * Read off the DOM: the text of the cell drawn at A3, and the width
 * getBoundingClientRect gives column B's letter and the cell under it. Makes
 * its own sheet and removes it at the end.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const cell = (address) => page.locator(`[data-testid="sheet-cell"][data-cell="${address}"]`);
const drawnText = async (address) => ((await cell(address).count()) === 0 ? null : (await cell(address).innerText()).trim());

/** Waits for the cell to read what it should, as the values arrive a moment after the typing. */
async function reads(address, wanted, within = 10_000) {
  const until = Date.now() + within;
  let seen = null;
  while (Date.now() < until) {
    seen = await drawnText(address);
    if (seen === wanted) return seen;
    await page.waitForTimeout(150);
  }
  return seen;
}

let made = null;
try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/sheets`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('new-sheet').waitFor({ timeout: 20_000 });

  const menu = (await page.locator('nav a, aside a').allInnerTexts().catch(() => [])).map((one) => one.trim());
  record(menu.includes('Sheets') && menu.indexOf('Documents') < menu.indexOf('Sheets'), `Design's menu has Sheets after Documents (${menu.join(', ')})`);

  await page.getByTestId('new-sheet').click();
  await page.waitForURL(/\/design\/sheets\/\d+$/, { timeout: 15_000 });
  made = /\/design\/sheets\/(\d+)$/.exec(page.url())?.[1] ?? null;
  record(made !== null, `New sheet opens its editor (${page.url()})`);

  const grid = page.getByTestId('sheet-grid');
  await page.getByTestId('sheet-cells').waitFor({ timeout: 15_000 });

  // An empty sheet still has columns: only a filled cell is drawn, and the lines across used to be its edge.
  const drawnLines = await page.evaluate(() => {
    const box = document.querySelector('[data-testid="sheet-cells"]').getBoundingClientRect();
    const heads = [...document.querySelectorAll('[data-testid="sheet-column-head"]')]
      .map((head) => head.getBoundingClientRect().right)
      .filter((right) => right > box.left && right < box.right);
    const lines = [...document.querySelectorAll('[data-testid="sheet-column-line"]')].map((line) => {
      const at = line.getBoundingClientRect();
      return { right: at.right, height: at.height, colour: getComputedStyle(line).backgroundColor };
    });
    return { box: box.height, heads, lines };
  });
  record(drawnLines.heads.length > 3, `the empty sheet shows several columns (${drawnLines.heads.length})`);
  record(
    drawnLines.heads.every((right) => drawnLines.lines.some((line) => Math.abs(line.right - right) <= 1)),
    `an empty sheet draws a line at each column's right edge (${drawnLines.lines.length} lines, ${drawnLines.heads.length} columns)`,
  );
  record(
    drawnLines.lines.length > 0 && drawnLines.lines.every((line) => line.height >= drawnLines.box && line.colour !== 'rgba(0, 0, 0, 0)'),
    'and each line runs the height of the grid in a colour that shows',
  );

  // Clicked at A1: the first cell, just inside the grid's corner.
  const cells = await page.getByTestId('sheet-cells').boundingBox();
  await page.mouse.click(cells.x + 20, cells.y + 12);
  await grid.focus();
  await page.keyboard.type('2');
  await page.keyboard.press('Enter');
  await page.keyboard.type('3');
  await page.keyboard.press('Enter');
  await page.keyboard.type('=A1+A2');
  await page.keyboard.press('Enter');

  record((await reads('A1', '2')) === '2', 'A1 draws 2');
  record((await reads('A2', '3')) === '3', 'A2 draws 3');
  const sum = await reads('A3', '5');
  record(sum === '5', `A3, =A1+A2, draws what the server worked out: 5 (drew ${JSON.stringify(sum)})`);

  // The formula bar shows the formula, not its value.
  await page.mouse.click(cells.x + 20, cells.y + 2 * 24 + 12);
  const typed = await page.getByTestId('sheet-formula').inputValue();
  record(typed === '=A1+A2', `the formula bar shows A3 as typed (${JSON.stringify(typed)})`);

  // Saved by itself, and drawn the same after a reload.
  await page.getByTestId('sheet-unsaved').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('sheet-cells').waitFor({ timeout: 15_000 });
  const after = await reads('A3', '5');
  record(after === '5', `after a reload A3 still draws 5 (${JSON.stringify(after)})`);

  // Column B dragged 80px wider by the edge of its letter.
  await page.mouse.click(cells.x + 100 + 20, cells.y + 12);
  await grid.focus();
  await page.keyboard.type('wide');
  await page.keyboard.press('Enter');
  await reads('B1', 'wide');
  const head = page.locator('[data-testid="sheet-column-head"][data-column="B"]');
  const before = (await head.boundingBox())?.width ?? 0;
  const cellBefore = (await cell('B1').boundingBox())?.width ?? 0;
  const edge = await page.getByTestId('sheet-resize-B').boundingBox();
  await page.mouse.move(edge.x + edge.width / 2, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(edge.x + edge.width / 2 + 40, edge.y + edge.height / 2, { steps: 4 });
  await page.mouse.move(edge.x + edge.width / 2 + 80, edge.y + edge.height / 2, { steps: 4 });
  await page.mouse.up();
  const widened = (await head.boundingBox())?.width ?? 0;
  const cellWidened = (await cell('B1').boundingBox())?.width ?? 0;
  record(Math.abs(widened - before - 80) <= 2, `column B's letter is drawn 80px wider (${Math.round(before)} -> ${Math.round(widened)})`);
  record(Math.abs(cellWidened - cellBefore - 80) <= 2, `and so is the cell under it (${Math.round(cellBefore)} -> ${Math.round(cellWidened)})`);
  const lineMoved = await page.evaluate(() => {
    const right = document.querySelector('[data-testid="sheet-column-head"][data-column="B"]').getBoundingClientRect().right;
    return [...document.querySelectorAll('[data-testid="sheet-column-line"]')].some((line) => Math.abs(line.getBoundingClientRect().right - right) <= 1);
  });
  record(lineMoved, "and the line at column B's edge moved with it");

  // Typing in a cell: arrows, the blocks a formula reads, and the functions offered.
  const box = await page.getByTestId('sheet-cells').boundingBox();
  const clickCell = async (column, row) => {
    const head = await page.locator(`[data-testid="sheet-column-head"][data-column="${column}"]`).boundingBox();
    await page.mouse.click(head.x + head.width / 2, box.y + 24 * (row - 1) + 12);
    await grid.focus();
  };
  const address = () => page.getByTestId('sheet-address').innerText();
  const field = page.getByTestId('sheet-cell-input');

  await clickCell('D', 5);
  await page.keyboard.type('x');
  await page.keyboard.press('ArrowRight');
  record((await address()) === 'E5', `an arrow while typing in a cell goes to the next cell (${await address()})`);
  record((await reads('D5', 'x')) === 'x', 'and writes what was typed');
  await clickCell('D', 5);
  await page.keyboard.press('F2');
  await page.keyboard.press('ArrowLeft');
  record((await field.count()) === 1 && (await address()) === 'D5', 'after F2 left and right stay the caret\'s');
  await page.keyboard.press('Escape');

  await clickCell('D', 7);
  await page.keyboard.type('=sum(a1:a2');
  const block = page.getByTestId('sheet-formula-block');
  const blocks = await block.count();
  const blockBox = blocks === 1 ? await block.boundingBox() : null;
  record(
    blockBox !== null && Math.abs(blockBox.y - box.y) <= 1 && Math.abs(blockBox.height - 48) <= 1 && Math.abs(blockBox.x - box.x) <= 1,
    `=sum(a1:a2 draws one block over A1:A2 (${JSON.stringify(blockBox)})`,
  );
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  record((await block.count()) === 0, 'and it goes when the typing is left');

  await clickCell('D', 7);
  await page.keyboard.type('=sum');
  const whole = await page.getByTestId('sheet-function-hint').allInnerTexts();
  record(whole[0] === 'SUM', `a name typed in full is still offered, first (${whole.join(', ')})`);
  await page.keyboard.press('Enter');
  record((await field.inputValue()) === '=SUM(', `and Enter takes it (${await field.inputValue()})`);
  await page.keyboard.press('Escape');

  await clickCell('D', 7);
  await page.keyboard.type('=su');
  const offered = await page.getByTestId('sheet-function-hint').allInnerTexts();
  record(offered.includes('SUM'), `=su offers SUM (${offered.join(', ')})`);
  for (let i = 0; i < offered.indexOf('SUM'); i++) await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Tab');
  record((await field.inputValue()) === '=SUM(', `Tab takes it, bracket opened (${await field.inputValue()})`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp');
  record((await field.inputValue()) === '=SUM(D5', `arrows after the bracket choose a cell and write its name (${await field.inputValue()})`);
  await page.keyboard.press('Escape');

  // Dragging the selection's corner: a series goes on, one number and text copy, a formula moves.
  const put = async (column, row, text) => {
    await clickCell(column, row);
    await page.keyboard.type(text);
    await page.keyboard.press('Enter');
  };
  const centre = async (column, row) => {
    const head = await page.locator(`[data-testid="sheet-column-head"][data-column="${column}"]`).boundingBox();
    return { x: head.x + head.width / 2, y: box.y + 24 * (row - 1) + 12 };
  };
  const dragCorner = async (toColumn, toRow, ctrl = false) => {
    const handle = await page.getByTestId('sheet-fill-handle').boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    const to = await centre(toColumn, toRow);
    await page.mouse.move(to.x, to.y, { steps: 4 });
    const shown = await page.getByTestId('sheet-fill-preview').count();
    if (ctrl) await page.keyboard.down('Control');
    await page.mouse.move(to.x, to.y + 1);
    await page.mouse.up();
    if (ctrl) await page.keyboard.up('Control');
    return shown;
  };
  await put('F', 1, '1');
  await put('F', 2, '2');
  const f1 = await centre('F', 1);
  const f2 = await centre('F', 2);
  await page.mouse.move(f1.x, f1.y);
  await page.mouse.down();
  await page.mouse.move(f2.x, f2.y, { steps: 3 });
  await page.mouse.up();
  const previewed = await dragCorner('F', 5);
  record(previewed === 1, 'the block being dragged out to is outlined');
  record((await reads('F3', '3')) === '3' && (await reads('F5', '5')) === '5', `1, 2 dragged goes on to 3, 4, 5 (F5 ${await drawnText('F5')})`);

  await put('G', 1, '7');
  await clickCell('G', 1);
  await dragCorner('G', 3);
  record((await reads('G3', '7')) === '7', 'one number dragged is copied');
  await clickCell('G', 1);
  await dragCorner('G', 3, true);
  record((await reads('G3', '9')) === '9', 'and with Ctrl held it counts');

  await put('H', 1, 'Item1');
  await clickCell('H', 1);
  await dragCorner('H', 3);
  record((await reads('H3', 'Item3')) === 'Item3', 'text ending in a number counts on');

  await put('I', 1, 'word');
  await clickCell('I', 1);
  await dragCorner('K', 1);
  record((await reads('K1', 'word')) === 'word', 'plain text is copied, and across as well as down');

  await put('E', 1, '=A1*2+$A$1');
  await clickCell('E', 1);
  await dragCorner('E', 2);
  await clickCell('E', 2);
  const moved = await page.getByTestId('sheet-formula').inputValue();
  record(moved === '=A2*2+$A$1', `a formula moves with the drag and $ holds (${moved})`);
  await grid.focus();
  await page.screenshot({ path: shot('sheets-editor.png') });
} finally {
  if (made !== null) await graphql('mutation ($id: ID!) { deleteSheet(id: $id) }', { id: made }).catch(() => undefined);
}
await finish(browser);
