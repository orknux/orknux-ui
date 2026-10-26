/**
 * A checkbox, a radio button and a switch on a wireframe: the tool rail offers
 * them, the checkbox tool draws a real checkbox - a box and its label beside
 * it - a press on the box ticks it and a second press clears it, each a step
 * undo goes back over; the tick is kept by Save, drawn on the list's
 * thumbnail, and a real `<input type="checkbox" checked>` in the HTML export.
 *
 * What is measured is what is drawn: the control's box, the tick's path, the
 * label's place beside the box.
 *
 * Makes its own wireframe and removes it at the end.
 */
import { saveEditor } from './suite/harness.mjs';
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const name = `Checkbox check ${Date.now()}`;
const made = await graphql(
  `mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }`,
  { w: WORKSPACE, n: name, d: JSON.stringify({ elements: [{ id: 'screen', type: 'frame', x: 0, y: 0, w: 390, h: 500, text: 'Settings' }] }) },
);
const id = made.createWireframe.id;

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
const svg = page.getByTestId('wireframe-svg');
await svg.waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.locator('[data-element-type="frame"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(300);

const offered = await Promise.all(['checkbox', 'radio', 'toggle'].map((tool) => page.getByTestId(`wireframe-tool-${tool}`).count()));
record(offered.every((one) => one === 1), `the rail offers a checkbox, a radio button and a switch (${offered})`);

// The checkbox tool, clicked inside the frame: one checkbox at its usual size, unticked.
const frame = (await page.locator('[data-element-type="frame"] rect').first().boundingBox({ timeout: 5_000 }).catch(() => null)) ?? { x: 0, y: 0, width: 0, height: 0 };
await page.getByTestId('wireframe-tool-checkbox').click({ timeout: 5_000 }).catch(() => undefined);
await page.mouse.click(frame.x + 40, frame.y + 60);
const checkbox = page.locator('[data-element-type="checkbox"]');
await checkbox.first().waitFor({ timeout: 5_000 }).catch(() => undefined);
const drawn = await checkbox.first().evaluate((one) => {
  const control = one.querySelector('[data-toggle] rect')?.getBoundingClientRect();
  const label = one.querySelector('foreignObject div');
  const words = label?.getBoundingClientRect();
  return {
    count: document.querySelectorAll('[data-testid="wireframe-svg"] [data-element-type="checkbox"]').length,
    control: control === undefined ? null : { w: Math.round(control.width), h: Math.round(control.height), right: Math.round(control.right), middle: Math.round(control.top + control.height / 2) },
    label: label === null ? null : { text: label.textContent, left: Math.round(words.left), middle: Math.round(words.top + words.height / 2) },
    ticks: one.querySelectorAll('[data-toggle] path').length,
  };
}).catch(() => null);
const zoom = Number(((await page.getByTestId('wireframe-zoom').textContent()) ?? '100%').replace('%', '')) / 100;
record(drawn !== null && drawn.count === 1 && drawn.control !== null && Math.abs(drawn.control.w - 16 * zoom) <= 1.5 && Math.abs(drawn.control.h - 16 * zoom) <= 1.5,
  `the checkbox tool draws one checkbox, its box 16 pixels square at ${zoom * 100}% (${JSON.stringify(drawn)})`);
record(drawn?.label !== null && drawn?.label?.text === 'Option' && drawn.label.left >= drawn.control.right && Math.abs(drawn.label.middle - drawn.control.middle) <= 3,
  `with its label beside the box, level with it (${JSON.stringify(drawn)})`);
record(drawn?.ticks === 0, 'and starts unticked');

// A press on the box ticks it; the panel says so; undo takes the tick back and redo returns it.
const ticks = () => checkbox.first().locator('[data-toggle] path').count();
const control = (await checkbox.first().locator('[data-toggle] rect').boundingBox({ timeout: 5_000 }).catch(() => null)) ?? { x: 0, y: 0, width: 0, height: 0 };
await page.mouse.click(control.x + control.width / 2, control.y + control.height / 2);
await page.waitForTimeout(150);
const ticked = await ticks();
const fill = await checkbox.first().locator('[data-toggle] rect').evaluate((one) => getComputedStyle(one).fill).catch(() => null);
const panelSays = await page.getByTestId('wireframe-style-checked').isChecked().catch(() => null);
record(ticked === 1 && panelSays === true, `a press on its box ticks it, and the panel says Checked (${JSON.stringify({ ticked, panelSays, fill })})`);
await page.getByTestId('wireframe-undo').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(150);
const undone = await ticks();
await page.getByTestId('wireframe-redo').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForTimeout(150);
const redone = await ticks();
record(undone === 0 && redone === 1, `undo takes the tick back and redo returns it (${undone}, ${redone})`);
// A press on the words selects, and does not tick.
const label = (await checkbox.first().locator('foreignObject').boundingBox({ timeout: 5_000 }).catch(() => null)) ?? { x: 0, y: 0, width: 0, height: 0 };
await page.mouse.click(label.x + 20, label.y + label.height / 2);
await page.waitForTimeout(150);
record((await ticks()) === 1, 'a press on its words leaves the tick as it is');
// The panel's own switch clears it.
await page.getByTestId('wireframe-style-checked').uncheck().catch(() => undefined);
await page.waitForTimeout(150);
record((await ticks()) === 0, 'the panel clears it');
await page.getByTestId('wireframe-style-checked').check().catch(() => undefined);

// A radio button and a switch, drawn as what they are.
await page.getByTestId('wireframe-tool-radio').click({ timeout: 5_000 }).catch(() => undefined);
await page.mouse.click(frame.x + 40, frame.y + 120);
await page.getByTestId('wireframe-tool-toggle').click({ timeout: 5_000 }).catch(() => undefined);
await page.mouse.click(frame.x + 40, frame.y + 180);
await page.waitForTimeout(150);
const radio = await page.locator('[data-element-type="radio"] [data-toggle] circle').count();
const track = await page.locator('[data-element-type="toggle"] [data-toggle] rect').boundingBox().catch(() => null);
record(radio === 1 && track !== null && Math.abs(track.width - 32 * zoom) <= 1.5 && Math.abs(track.height - 18 * zoom) <= 1.5,
  `a radio button is a ring and a switch a track (${JSON.stringify({ radio, track })})`);
await page.screenshot({ path: shot('wireframe-checkbox.png'), clip: frame });

// Saved: the stored drawing holds it ticked, and the HTML is a real checkbox, checked.
await saveEditor(page, 'wireframe-save');
await page.waitForTimeout(800);
const stored = await graphql(`query ($id: ID!) { wireframe(id: $id) { document } }`, { id });
const elements = JSON.parse(stored.wireframe.document).elements;
const kept = elements.find((one) => one.type === 'checkbox');
record(kept?.props?.checked === true && elements.some((one) => one.type === 'radio') && elements.some((one) => one.type === 'toggle'),
  `Save keeps the checkbox ticked, and the radio button and the switch (${JSON.stringify(elements.map((one) => [one.type, one.props ?? null]))})`);
const html = (await graphql(`mutation ($id: ID!) { exportWireframeHtml(id: $id) }`, { id })).exportWireframeHtml;
record(html.includes('<input type="checkbox" checked><span>Option</span>') && html.includes('<input type="radio">') && html.includes('role="switch"'),
  'the HTML export is real inputs, the checkbox checked');

// After a reload it is still ticked, and so is the list's thumbnail.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-element-type="checkbox"]').first().waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await ticks()) === 1, 'after a reload it is still ticked');
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes`, { waitUntil: 'domcontentloaded' });
const card = page.locator(`[data-testid="wireframe-card"][data-wireframe-id="${id}"]`);
await card.waitFor({ timeout: 15_000 }).catch(() => undefined);
const thumb = await card.evaluate((one) => {
  const box = one.querySelector('svg [data-element-type="checkbox"]');
  return box === null ? null : { ticks: box.querySelectorAll('[data-toggle] path').length, width: Math.round(box.getBoundingClientRect().width) };
}).catch(() => null);
record(thumb !== null && thumb.ticks === 1 && thumb.width > 0, `the list's thumbnail draws it ticked (${JSON.stringify(thumb)})`);

await graphql(`mutation ($id: ID!) { deleteWireframe(id: $id) }`, { id });
await finish(browser);
