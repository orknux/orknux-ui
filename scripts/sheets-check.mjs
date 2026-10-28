/**
 * Sheets in Design: the list lists Sheets after Documents, a new sheet opens
 * in the editor, numbers typed into cells and a formula over them draw the
 * value the server worked out, that value is still drawn after a reload, and
 * dragging a column's edge makes the column drawn wider.
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
  await page.screenshot({ path: shot('sheets-editor.png') });
} finally {
  if (made !== null) await graphql('mutation ($id: ID!) { deleteSheet(id: $id) }', { id: made }).catch(() => undefined);
}
await finish(browser);
