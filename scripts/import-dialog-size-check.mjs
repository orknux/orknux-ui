/**
 * The import dialog opens wide enough for its plan, and is dragged to a size
 * from any edge or corner.
 *
 * At 420px every filter tab wrapped its label onto two or three lines ("Not /
 * here / (6)") and a row's Rename and Leave out dropped under its name. It
 * opens at about 860px now, the tabs never wrap, and each edge and corner can
 * be taken hold of: the edge held is the one that moves, the opposite one
 * stays, nothing goes past the window, and the size chosen is the size it opens
 * at next time.
 *
 * The plan is answered here, so the check needs no file of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const VIEW = { width: 1440, height: 1000 };
const KEY = 'orknux.dialog.import-plan.size';
const { browser, page } = await open({ viewport: VIEW });

const entry = (kind, name, disposition) => ({
  kind, external: null, carried: disposition !== 'MISSING', droppable: true, name,
  targetName: disposition === 'RENAME' ? `${name} (2)` : name, disposition,
  detail: disposition === 'MISSING'
    ? `${name} is not here.`
    : disposition === 'RENAME'
      ? `This workspace already has one called ${name}. It arrives as ${name} (2).`
      : disposition === 'REUSE' ? `${name} is already here and is used as it is.` : `${name} is created.`,
});
const ENTRIES = [
  entry('AGENT', 'zz slack periodic hello', 'RENAME'),
  entry('WORKFLOW', 'zz nightly report digest', 'RENAME'),
  ...['TOOL', 'MCP_SERVER', 'CONNECTION', 'TOOL', 'MODEL', 'TOOL'].map((kind, i) => entry(kind, `zz missing thing ${i}`, 'MISSING')),
  ...['FUNCTION', 'ACTION', 'CONDITION', 'TRIGGER', 'SKILL', 'TOOL', 'FUNCTION'].map((kind, i) => entry(kind, `zz new component ${i}`, 'CREATE')),
  ...['FUNCTION', 'TOOL', 'ACTION', 'SKILL', 'TOOL', 'CONDITION', 'FUNCTION', 'TOOL'].map((kind, i) => entry(kind, `zz present ${i}`, 'REUSE')),
];

await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('componentImportPlan')) {
    return route.fulfill({ json: { data: { componentImportPlan: {
      formatVersion: 1, producedBy: 'Orknux 1.1.4', depth: 'DEEP', importable: false, entries: ENTRIES, problems: [],
    } } } });
  }
  return route.continue();
});

const dialog = page.locator('dialog[open]').filter({ has: page.getByTestId('import-plan') });
const plan = page.getByTestId('import-plan');
const box = async () => {
  const r = await dialog.evaluate((element) => element.getBoundingClientRect().toJSON()).catch(() => null);
  return r === null ? null : { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
};

async function openDialog() {
  await page.waitForSelector('text=Showing', { timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'zz-size.orkx.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ formatVersion: 1, components: [] })),
  });
  await plan.waitFor({ timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(300);
}

async function drag(edge, dx, dy) {
  const handle = dialog.locator(`[data-edge="${edge}"]`);
  const at = await handle.boundingBox({ timeout: 2_000 }).catch(() => null);
  if (at === null) return false;
  const x = at.x + at.width / 2;
  const y = at.y + at.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 });
  await page.mouse.move(x + dx, y + dy, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(150);
  return true;
}

await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
await page.evaluate((key) => { try { localStorage.removeItem(key); } catch { /* nothing kept */ } }, KEY);
await openDialog();

const first = await box();
const width = first === null ? 0 : first.right - first.left;
record(width >= 800 && width <= VIEW.width - 32, `the import dialog opens at least 800px wide at a 1440 window (${width})`);

// Every tab's label on one line: the text's line boxes all share one top.
const tabLines = await page.getByTestId('plan-filter').locator('button').evaluateAll((buttons) =>
  buttons.map((button) => {
    const range = document.createRange();
    range.selectNodeContents(button);
    const tops = new Set([...range.getClientRects()].map((rect) => Math.round(rect.top)));
    return { label: button.textContent, lines: tops.size };
  }),
).catch(() => []);
record(tabLines.length >= 5 && tabLines.every((one) => one.lines === 1),
  `every filter tab's label is on one line (${JSON.stringify(tabLines)})`);

// A row's buttons sit on the line of its kind and name, not under them.
const rowLines = await plan.locator('li').evaluateAll((rows) =>
  rows.map((row) => {
    const head = row.firstElementChild;
    const kind = head.firstElementChild.getBoundingClientRect();
    const middle = (rect) => rect.top + rect.height / 2;
    const buttons = [...head.querySelectorAll('button')].map((button) => Math.round(middle(button.getBoundingClientRect()) - middle(kind)));
    return { name: head.children[1]?.textContent, buttons };
  }),
).catch(() => []);
record(rowLines.length === ENTRIES.length && rowLines.every((row) => row.buttons.every((off) => Math.abs(off) <= 6)),
  `every row's buttons are on the row's line (${JSON.stringify(rowLines.filter((row) => row.buttons.some((off) => Math.abs(off) > 6)).slice(0, 4))})`);

const near = (a, b) => Math.abs(a - b) <= 2;

const planBefore = await plan.evaluate((list) => list.clientHeight).catch(() => 0);
const b0 = await box();
const draggedRight = await drag('e', 150, 0);
const b1 = await box();
record(draggedRight && b0 !== null && b1 !== null && near(b1.right, b0.right + 150) && near(b1.left, b0.left) && near(b1.top, b0.top),
  `dragging the right edge 150px moves the right edge and leaves the left and top (${JSON.stringify({ b0, b1 })})`);

const draggedDown = await drag('s', 0, 100);
const b2 = await box();
record(draggedDown && b2 !== null && near(b2.bottom, b1.bottom + 100) && near(b2.top, b1.top) && near(b2.left, b1.left) && near(b2.right, b1.right),
  `dragging the bottom edge 100px moves the bottom and leaves the rest (${JSON.stringify({ b1, b2 })})`);
const planAfter = await plan.evaluate((list) => list.clientHeight).catch(() => 0);
record(planAfter >= planBefore + 90, `the plan's list grows with the dialog (${planBefore} -> ${planAfter})`);

const draggedCorner = await drag('nw', -60, -40);
const b3 = await box();
record(draggedCorner && b3 !== null && near(b3.left, b2.left - 60) && near(b3.top, b2.top - 40) && near(b3.right, b2.right) && near(b3.bottom, b2.bottom),
  `dragging the top-left corner moves the left and top edges and leaves the right and bottom (${JSON.stringify({ b2, b3 })})`);

await drag('se', 3000, 3000);
const b4 = await box();
record(b4 !== null && b4.right <= VIEW.width - 15 && b4.bottom <= VIEW.height - 15 && b4.left >= 0 && b4.top >= 0,
  `a drag past the window stops at its edge (${JSON.stringify(b4)})`);
await drag('nw', -3000, -3000);
const b5 = await box();
record(b5 !== null && b5.left >= 15 && b5.top >= 15, `and so does one past its top-left (${JSON.stringify(b5)})`);
await drag('se', -3000, -3000);
const b6 = await box();
record(b6 !== null && b6.right - b6.left >= 400 && b6.bottom - b6.top >= 200, `nor can it be dragged to nothing (${JSON.stringify(b6)})`);

// A size somebody will want back: wide, and a little taller than it opened.
await drag('se', 500, 150);
const chosen = await box();
const chosenSize = chosen === null ? null : { width: chosen.right - chosen.left, height: chosen.bottom - chosen.top };

await page.getByRole('button', { name: 'Cancel' }).click().catch(() => undefined);
await page.waitForTimeout(300);
await openDialog();
const reopened = await box();
const reopenedSize = reopened === null ? null : { width: reopened.right - reopened.left, height: reopened.bottom - reopened.top };
record(chosenSize !== null && reopenedSize !== null && near(reopenedSize.width, chosenSize.width) && near(reopenedSize.height, chosenSize.height),
  `reopened, it keeps the size it was dragged to (${JSON.stringify({ chosenSize, reopenedSize })})`);
record(reopened !== null && Math.abs((reopened.left + reopened.right) / 2 - VIEW.width / 2) <= 2,
  `and is centred again rather than left where it was (${JSON.stringify(reopened)})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await openDialog();
const reloaded = await box();
const reloadedSize = reloaded === null ? null : { width: reloaded.right - reloaded.left, height: reloaded.bottom - reloaded.top };
record(chosenSize !== null && reloadedSize !== null && near(reloadedSize.width, chosenSize.width) && near(reloadedSize.height, chosenSize.height),
  `and after a reload too (${JSON.stringify(reloadedSize)})`);

await page.evaluate((key) => { try { localStorage.removeItem(key); } catch { /* nothing kept */ } }, KEY);
await finish(browser);
