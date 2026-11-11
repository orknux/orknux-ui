/**
 * Formatting in a sheet, as it is drawn: Ctrl+B, Ctrl+I and Ctrl+U on a cell
 * draw it bold, italic and underlined; a fill from the format bar's palette is
 * the cell's background, with dark words on a pale fill whatever the theme; a
 * cell aligned centre is drawn centred; a percent format draws 0.256 as 26%,
 * and one more place as 25.6%; an empty cell given a fill is drawn; dragging a
 * bold cell's corner draws the cells it reaches bold; a cell copied and pasted
 * in the editor carries its formatting; and all of it is still drawn after a
 * reload, so it was saved.
 *
 * And: a number format is drawn at once - every animation frame after it is
 * chosen is sampled, and none may draw the bare number before the formatted
 * one; borders from the picker are drawn as lines on the sides they name; and
 * a double-click on a column's edge makes it as wide as its longest text.
 *
 * Read off the DOM with getComputedStyle on the cell drawn at each address -
 * the font weight, style and line, the background, the colour and the
 * alignment - and the cell's text. Makes its own sheet and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({
  viewport: { width: 1440, height: 900 },
  context: { permissions: ['clipboard-read', 'clipboard-write'] },
});

const cell = (address) => page.locator(`[data-testid="sheet-cell"][data-cell="${address}"]`);

/** What the cell at [address] is drawn with, or null where no cell is drawn there. */
async function drawn(address) {
  if ((await cell(address).count()) === 0) return null;
  return cell(address).evaluate((one) => {
    const style = getComputedStyle(one);
    return {
      text: one.innerText.trim(),
      weight: style.fontWeight,
      italic: style.fontStyle,
      line: style.textDecorationLine,
      background: style.backgroundColor,
      colour: style.color,
      align: style.textAlign,
      borders: ['Top', 'Right', 'Bottom', 'Left'].filter((side) => style[`border${side}Style`] === 'solid' && Number.parseFloat(style[`border${side}Width`]) >= 1),
      fits: one.scrollWidth <= one.clientWidth,
      width: one.getBoundingClientRect().width,
    };
  });
}

/** Waits for the cell to be drawn as [wanted] says, as a change is drawn a moment after it is made. */
async function becomes(address, wanted, within = 10_000) {
  const until = Date.now() + within;
  let seen = null;
  while (Date.now() < until) {
    seen = await drawn(address);
    if (seen !== null && wanted(seen)) return { ok: true, seen };
    await page.waitForTimeout(150);
  }
  return { ok: false, seen };
}

let made = null;
try {
  made = (
    await graphql(
      'mutation ($workspaceId: ID!, $workbook: String) { createSheet(workspaceId: $workspaceId, name: "Formatting check", workbook: $workbook) { id } }',
      {
        workspaceId: WORKSPACE,
        workbook: JSON.stringify({
          tabs: [{ name: 'Sheet1', cells: { A1: 'Item', B1: '0.256', A2: 'x', D1: '1234.5', F1: 'A rather long piece of text that runs well past the edge' } }],
        }),
      },
    )
  ).createSheet.id;

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/sheets/${made}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('sheet-cells').waitFor({ timeout: 20_000 });
  await cell('A1').waitFor({ timeout: 15_000 });

  const grid = page.getByTestId('sheet-grid');
  const box = await page.getByTestId('sheet-cells').boundingBox();
  const centre = async (column, row) => {
    const head = await page.locator(`[data-testid="sheet-column-head"][data-column="${column}"]`).boundingBox();
    return { x: head.x + head.width / 2, y: box.y + 24 * (row - 1) + 12 };
  };
  const clickCell = async (column, row) => {
    const at = await centre(column, row);
    await page.mouse.click(at.x, at.y);
    await grid.focus();
  };

  // The format bar is the document editor's: a row of 28px tools above the formula bar.
  const bold = page.getByTestId('sheet-bold');
  const tool = await bold.boundingBox();
  const bar = await page.getByTestId('sheet-toolbar').boundingBox();
  const formula = await page.getByTestId('sheet-formula').boundingBox();
  record(tool !== null && Math.round(tool.width) === 28 && Math.round(tool.height) === 28, `the bold tool is 28px square, as the document's are (${JSON.stringify(tool)})`);
  record(bar !== null && formula !== null && bar.y + bar.height <= formula.y + 1, 'and the format bar sits above the formula bar');

  const plain = await drawn('A1');
  record(plain !== null && plain.weight === '400' && plain.italic === 'normal', `A1 starts plain (${JSON.stringify(plain)})`);

  await clickCell('A', 1);
  await page.keyboard.press('Control+b');
  const boldened = await becomes('A1', (one) => Number(one.weight) >= 700);
  record(boldened.ok, `Ctrl+B draws A1 bold (font-weight ${boldened.seen?.weight})`);
  record((await bold.getAttribute('aria-pressed')) === 'true', 'and the bold tool shows it pressed');
  await page.keyboard.press('Control+i');
  const slanted = await becomes('A1', (one) => one.italic === 'italic');
  record(slanted.ok, `Ctrl+I draws it italic (font-style ${slanted.seen?.italic})`);
  await page.keyboard.press('Control+u');
  const lined = await becomes('A1', (one) => one.line.includes('underline'));
  record(lined.ok, `Ctrl+U draws it underlined (text-decoration-line ${lined.seen?.line})`);
  await page.keyboard.press('Control+b');
  const unbold = await becomes('A1', (one) => Number(one.weight) < 700);
  record(unbold.ok, `Ctrl+B again takes the bold away (font-weight ${unbold.seen?.weight})`);
  await page.keyboard.press('Control+b');

  await page.getByTestId('sheet-align-center').click();
  const centred = await becomes('A1', (one) => one.align === 'center');
  record(centred.ok, `Align centre draws A1 centred (text-align ${centred.seen?.align})`);

  // A pale fill from the palette, with words dark enough to read on it in either theme.
  await clickCell('B', 1);
  await page.getByTestId('sheet-fill').click();
  await page.locator('[data-testid="sheet-fill-swatch"][data-colour="#fff2cc"]').click();
  const filled = await becomes('B1', (one) => one.background === 'rgb(255, 242, 204)');
  record(filled.ok, `the fill is drawn behind B1 (background ${filled.seen?.background})`);
  record(filled.seen?.colour === 'rgb(31, 31, 35)', `and its words are drawn dark on it (color ${filled.seen?.colour})`);

  /**
   * Every text [address] is drawn with, frame by frame, from the moment the
   * control [control] is used until [stop] is called - so what the cell showed
   * before the change, rightly unformatted, is not counted against it.
   */
  const sampling = (address, control) =>
    page.evaluate(
      ([at, by]) => {
        window.__drawn = [];
        window.__sampling = true;
        const look = () => {
          const one = document.querySelector(`[data-testid="sheet-cell"][data-cell="${at}"]`);
          if (one !== null) window.__drawn.push(one.innerText.trim());
          if (window.__sampling) requestAnimationFrame(look);
        };
        const start = () => requestAnimationFrame(look);
        const used = document.querySelector(`[data-testid="${by}"]`);
        used.addEventListener(used.tagName === 'SELECT' ? 'change' : 'click', start, { once: true, capture: true });
      },
      [address, control],
    );
  const stop = () => page.evaluate(() => { window.__sampling = false; return [...new Set(window.__drawn)]; });

  await sampling('B1', 'sheet-number-format');
  await page.getByTestId('sheet-number-format').selectOption('percent');
  const percent = await becomes('B1', (one) => one.text === '26%');
  await page.waitForTimeout(1500);
  const percentFrames = await stop();
  record(!percentFrames.includes('0.256') && percentFrames[0] === '26%', `choosing Percentage never draws the bare 0.256 first (drew ${JSON.stringify(percentFrames)})`);
  record(percent.ok, `Percentage draws 0.256 as 26% (drew ${JSON.stringify(percent.seen?.text)})`);
  record((await page.getByTestId('sheet-formula').inputValue()) === '0.256', 'and the formula bar still holds 0.256');
  await sampling('B1', 'sheet-decimals-more');
  await page.getByTestId('sheet-decimals-more').click();
  const placed = await becomes('B1', (one) => one.text === '25.6%');
  await page.waitForTimeout(1500);
  const placedFrames = await stop();
  record(placed.ok, `one more place draws 25.6% (drew ${JSON.stringify(placed.seen?.text)})`);
  record(placedFrames.every((one) => one === '26%' || one === '25.6%'), `and goes from 26% to 25.6% with no bare number between (drew ${JSON.stringify(placedFrames)})`);

  // A whole number made Numeric: 1,234.50 from the first frame, never 1234.5 on the way.
  await clickCell('D', 1);
  await sampling('D1', 'sheet-number-format');
  await page.getByTestId('sheet-number-format').selectOption('number');
  const numeric = await becomes('D1', (one) => one.text === '1,234.50');
  await page.waitForTimeout(1500);
  const numericFrames = await stop();
  record(numeric.ok, `Numeric draws 1234.5 as 1,234.50 (drew ${JSON.stringify(numeric.seen?.text)})`);
  record(numericFrames.length === 1 && numericFrames[0] === '1,234.50', `with no frame of the bare number (drew ${JSON.stringify(numericFrames)})`);

  // Borders: an outline round A5:B6 is drawn on each edge cell's outer sides and nowhere inside.
  await clickCell('A', 5);
  const corner = await centre('B', 6);
  await page.keyboard.down('Shift');
  await page.mouse.click(corner.x, corner.y);
  await page.keyboard.up('Shift');
  const pickBorder = async (choice) => {
    await page.getByTestId('sheet-borders').click();
    await page.getByTestId(`sheet-border-${choice}`).click();
  };
  /** What the bar says of the cell in focus: whether Borders is pressed, which sides, and which of the seven are marked. */
  const barSays = async () => {
    const button = page.getByTestId('sheet-borders');
    const pressed = (await button.getAttribute('aria-pressed')) === 'true';
    const sides = (await button.getAttribute('data-sides')) ?? '';
    await button.click();
    const marked = await page.locator('[data-testid="sheet-borders-menu"] [aria-checked="true"]').evaluateAll((all) => all.map((one) => one.dataset.testid.replace('sheet-border-', '')));
    await page.keyboard.press('Escape');
    return { pressed, sides, marked };
  };
  record((await page.getByTestId('sheet-borders').evaluate((one) => one.tagName)) === 'BUTTON', 'Borders is an icon button on the bar, not a list to choose from');
  await pickBorder('outer');
  const outlined = await becomes('A5', (one) => one.borders.includes('Top'));
  record(
    outlined.ok && JSON.stringify(outlined.seen.borders) === JSON.stringify(['Top', 'Left']),
    `Outer borders draw A5 on its top and left only (${JSON.stringify(outlined.seen?.borders)})`,
  );
  const farCorner = await becomes('B6', (one) => one.borders.length > 0);
  record(JSON.stringify(farCorner.seen?.borders) === JSON.stringify(['Right', 'Bottom']), `and B6 on its right and bottom (${JSON.stringify(farCorner.seen?.borders)})`);
  // The bar says what the cell has: moved away and back, A5 still shows its top and left.
  await clickCell('D', 3);
  record(!(await barSays()).pressed, 'on a cell with no border, Borders is not pressed');
  await clickCell('A', 5);
  const onA5 = await barSays();
  record(onA5.pressed && onA5.sides === 'top left' && JSON.stringify(onA5.marked) === JSON.stringify(['top', 'left']),
    `back on A5, Borders is pressed and Top and Left are marked (${JSON.stringify(onA5)})`);
  await clickCell('D', 1);
  await pickBorder('all');
  const boxed = await becomes('D1', (one) => one.borders.length === 4);
  record(boxed.ok, `All borders draw D1 on every side (${JSON.stringify(boxed.seen?.borders)})`);
  await pickBorder('top');
  const topless = await becomes('D1', (one) => one.borders.length === 3);
  record(topless.ok && !topless.seen.borders.includes('Top'), `Top, already there, pressed again takes the top line away (${JSON.stringify(topless.seen?.borders)})`);
  await pickBorder('none');
  const unboxed = await becomes('D1', (one) => one.borders.length === 0);
  record(unboxed.ok, `and No borders takes them away (${JSON.stringify(unboxed.seen?.borders)})`);
  await pickBorder('bottom');
  await becomes('D1', (one) => one.borders.length === 1);

  // A double-click on column F's edge: as wide as its long text, which is drawn whole.
  const longBefore = await drawn('F1');
  const fEdge = await page.getByTestId('sheet-resize-F').boundingBox();
  await page.mouse.dblclick(fEdge.x + fEdge.width / 2, fEdge.y + fEdge.height / 2);
  const fitted = await becomes('F1', (one) => one.fits && one.width > (longBefore?.width ?? 0) + 50);
  record(longBefore !== null && !longBefore.fits, `F1's text is cut off at the usual width (${Math.round(longBefore?.width ?? 0)}px)`);
  record(fitted.ok, `a double-click on F's edge widens it to fit the text whole (${Math.round(fitted.seen?.width ?? 0)}px)`);
  record((fitted.seen?.width ?? 0) < 600, 'and no wider than it needs');

  // An empty cell with a fill is drawn: a coloured header has empty cells in it.
  await clickCell('C', 2);
  await page.getByTestId('sheet-fill').click();
  await page.locator('[data-testid="sheet-fill-swatch"][data-colour="#ddebf7"]').click();
  const empty = await becomes('C2', (one) => one.background === 'rgb(221, 235, 247)');
  record(empty.ok, `an empty cell given a fill is drawn with it (${JSON.stringify(empty.seen)})`);

  // A bold cell's corner dragged down: the cells it reaches are bold too.
  await clickCell('A', 1);
  const handle = await page.getByTestId('sheet-fill-handle').boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  const to = await centre('A', 3);
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.move(to.x, to.y + 1);
  await page.mouse.up();
  const dragged = await becomes('A3', (one) => Number(one.weight) >= 700 && one.align === 'center');
  record(dragged.ok, `dragging A1's corner to A3 draws A3 bold and centred (${JSON.stringify(dragged.seen)})`);

  // Copied and pasted in the editor, a cell takes its formatting with it.
  await clickCell('B', 1);
  await page.keyboard.press('Control+c');
  await clickCell('E', 1);
  await page.keyboard.press('Control+v');
  const pasted = await becomes('E1', (one) => one.background === 'rgb(255, 242, 204)' && one.text === '25.6%');
  record(pasted.ok, `B1 copied to E1 is drawn with its fill and its format (${JSON.stringify(pasted.seen)})`);

  // Saved by itself, and drawn the same after a reload.
  await page.getByTestId('sheet-unsaved').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByTestId('sheet-cells').waitFor({ timeout: 15_000 });
  const again = await becomes('A1', (one) => Number(one.weight) >= 700 && one.italic === 'italic' && one.line.includes('underline') && one.align === 'center');
  record(again.ok, `after a reload A1 is still bold, italic, underlined and centred (${JSON.stringify(again.seen)})`);
  const kept = await becomes('B1', (one) => one.background === 'rgb(255, 242, 204)' && one.text === '25.6%');
  record(kept.ok, `and B1 still has its fill and draws 25.6% (${JSON.stringify(kept.seen)})`);
  const lines = await becomes('A5', (one) => one.borders.length === 2);
  record(lines.ok, `and A5 still has its outline (${JSON.stringify(lines.seen?.borders)})`);
  await clickCell('A', 5);
  const afterReload = await barSays();
  record(afterReload.pressed && afterReload.sides === 'top left', `and the bar still says A5 has its top and left lines (${JSON.stringify(afterReload)})`);
  const stillWide = await becomes('F1', (one) => one.fits);
  record(stillWide.ok, `and column F is still wide enough for F1 (${Math.round(stillWide.seen?.width ?? 0)}px)`);
  await page.screenshot({ path: shot('sheet-format.png') });
} finally {
  if (made !== null) await graphql('mutation ($id: ID!) { deleteSheet(id: $id) }', { id: made }).catch(() => undefined);
}
await finish(browser);
