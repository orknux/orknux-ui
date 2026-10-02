/**
 * The field picker from the keyboard, which used to be mouse-only.
 *
 * Issue #582: on a plugin's `token` parameter set to Reference, typing `jira`
 * narrowed the list to `jira_token` - and then ArrowDown, ArrowUp and Enter did
 * nothing at all, because `FieldPicker` had no keyboard handling. It is the one
 * picker behind a plugin's parameters, header rows and a node's parameters in
 * the editor, so this drives it where the fixture always has one: a node in the
 * workflow editor.
 *
 * What it asserts is what is drawn and what is stored, not that a handler ran:
 * the row marked active after each key, the descendant the search box hands a
 * screen reader, the value the closed control holds after Enter, and that
 * Escape takes the list away without taking the side panel with it.
 *
 * Writes nothing. It picks a field in the side panel and leaves without saving.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
const drew = await page
  .waitForSelector('.react-flow__node', { timeout: 30_000 })
  .then(() => true)
  .catch(() => false);
record(drew, 'the editor drew the graph');
if (!drew) await finish(browser);

await page.waitForTimeout(1000);

/* A node with a reference to point, found the way field-search-check finds one. */
const nodes = page.locator('.react-flow__node');
const pickerAt = 'button[aria-label$=" reference"]';
let found = false;
for (let at = 0; at < (await nodes.count()); at += 1) {
  await nodes.nth(at).click();
  await page.waitForTimeout(700);
  if ((await page.locator(pickerAt).count()) === 0 && (await page.getByRole('button', { name: 'Reference' }).count()) > 0) {
    await page.getByRole('button', { name: 'Reference' }).first().click();
    await page.waitForTimeout(700);
  }
  if ((await page.locator(pickerAt).count()) > 0) {
    found = true;
    break;
  }
}
record(found, 'a node with a parameter pointed at a reference is open');
if (!found) await finish(browser);

const picker = page.locator(pickerAt).first();
const menu = page.locator('[data-field-menu]');
const search = page.locator('[data-field-menu] input');

const openMenu = async () => {
  await picker.click();
  return page
    .waitForSelector('[data-field-menu]', { timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
};

/* The options on screen, in drawn order, and which of them is marked active. */
const read = () =>
  menu.evaluate((box) => {
    const rows = [...box.querySelectorAll('[data-field-option]')];
    const input = box.querySelector('input');
    return {
      options: rows.map((one) => ({ field: one.getAttribute('data-field-option'), expression: one.getAttribute('data-field-expression') })),
      active: rows.findIndex((one) => one.hasAttribute('data-field-active')),
      activeId: rows.find((one) => one.hasAttribute('data-field-active'))?.id ?? null,
      descendant: input?.getAttribute('aria-activedescendant') ?? null,
      role: input?.getAttribute('role') ?? null,
    };
  });

const before = await picker.getAttribute('data-field-value');

const listed = await openMenu();
record(listed, 'the field picker opens a list');
if (!listed) await finish(browser);
const whole = await read();
record(whole.options.length > 0, `the list offers ${whole.options.length} fields`);
if (whole.options.length === 0) await finish(browser);
record(whole.role === 'combobox', `the search box says it is a combobox (role ${JSON.stringify(whole.role)})`);

/*
 * Something to type. A prefix that keeps at least two fields, one of which is
 * not the value already held, so that ArrowDown has somewhere to go and Enter
 * visibly changes something; picked off the page so the fixture can change.
 */
const keeps = (bit) =>
  whole.options.filter((one) => one.field.toLowerCase().includes(bit) || one.expression.toLowerCase().includes(bit));
const needle = (() => {
  for (const option of whole.options) {
    const name = option.field.toLowerCase();
    for (let size = Math.min(3, name.length); size >= 1; size -= 1) {
      const bit = name.slice(0, size);
      const kept = keeps(bit);
      if (kept.length >= 2 && kept.slice(1).some((one) => one.expression !== before)) return bit;
    }
  }
  return null;
})();
record(needle !== null, `a few letters keep two fields or more: ${JSON.stringify(needle)}`);
if (needle === null) await finish(browser);

await search.pressSequentially(needle, { delay: 40 });
await page.waitForTimeout(300);

const typed = await read();
record(typed.options.length >= 2, `typing ${JSON.stringify(needle)} leaves ${typed.options.length} fields`);
record(typed.active === 0, `and the first of them is active (row ${typed.active})`);
record(
  typed.activeId !== null && typed.descendant === typed.activeId,
  `the search box points a screen reader at it (aria-activedescendant ${JSON.stringify(typed.descendant)})`,
);

const last = typed.options.length - 1;
const step = async (key, expected, what) => {
  await search.press(key);
  await page.waitForTimeout(150);
  const now = await read();
  record(now.active === expected && now.descendant === now.activeId, `${key} ${what}: row ${now.active}, expected ${expected}`);
};

await step('ArrowUp', last, 'wraps from the first row to the last');
await step('ArrowDown', 0, 'wraps from the last row back to the first');
await step('End', last, 'jumps to the last row');
await step('Home', 0, 'jumps to the first row');

/* Down to a row that is not the value already held, then Enter. */
let target = 1;
while (target <= last && typed.options[target].expression === before) target += 1;
for (let at = 0; at < target; at += 1) await search.press('ArrowDown');
await page.waitForTimeout(150);
const moved = await read();
record(moved.active === target, `ArrowDown moves the active row to ${target} (${moved.active})`);

const expected = typed.options[target];
await search.press('Enter');
await page.waitForTimeout(400);

record((await menu.count()) === 0, 'Enter closes the list');
const after = await picker.getAttribute('data-field-value');
record(
  after === expected.expression,
  `and picks ${JSON.stringify(expected.expression)} (the control holds ${JSON.stringify(after)}, was ${JSON.stringify(before)})`,
);
const drawn = (await picker.textContent()) ?? '';
record(drawn.includes(expected.field), `the closed control draws ${JSON.stringify(expected.field)} (${JSON.stringify(drawn.trim())})`);

/* Escape gives up: the list goes, focus goes back, and nothing else closes. */
const reopened = await openMenu();
record(reopened, 'the picker opens again');
if (!reopened) await finish(browser);
await search.pressSequentially(needle, { delay: 40 });
await search.press('ArrowDown');
await search.press('Escape');
await page.waitForTimeout(400);

record((await menu.count()) === 0, 'Escape closes the list');
const focused = await picker.evaluate((button) => document.activeElement === button);
record(focused, 'and hands focus back to the field');
record((await page.locator(pickerAt).count()) > 0, 'without closing the side panel around it');
record(
  (await picker.getAttribute('data-field-value')) === expected.expression,
  'and without changing what was picked',
);

await finish(browser);
