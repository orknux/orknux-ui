/**
 * Every heading of a table is drawn in the table's heading font.
 *
 * A heading wears its column's class, for the column's width and alignment, and
 * where that class also set the cells' font - `font-size: var(--text-md)`, a
 * brighter colour - the heading took it too. So Boxes drew TYPE and FREE
 * SESSIONS large and bright beside a small grey HEALTH, Models drew STATUS
 * bold, and the Watchers tabs drew DESCRIPTION larger than the rest: the font a
 * column's cells are in leaking into the one cell that is not a cell.
 *
 * Read off what is drawn, on every list page: each header row - a `thead`
 * row, a row holding a sortable heading, or a row whose class is a table
 * header's - and every heading in it with text, compared by computed font
 * family, size, weight, letter-spacing, case and colour. The column the list
 * is sorted by included: it used to be drawn brighter, and read as a heading
 * of another kind - only its arrow says it is the one ordering the list.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

const W = `/workspace/${WORKSPACE}`;
const PAGES = [
  '/admin', '/admin/audit', '/admin/users', '/admin/integrations', '/admin/plugins', '/admin/libraries',
  '/admin/templates', '/admin/networking', '/admin/boxes', '/admin/roles', '/admin/reports', '/admin/updates',
  `${W}/agents`, `${W}/models`, `${W}/tools`, `${W}/skills`, `${W}/memory`, `${W}/tasks`, `${W}/sessions`,
  `${W}/watchers`, `${W}/watchers#finished`, `${W}/executions`, `${W}/actions`, `${W}/functions`, `${W}/triggers`,
  `${W}/conditions`, `${W}/objects`, `${W}/artifacts`, `${W}/variables`, `${W}/plugins`, `${W}/issues`,
  `${W}/audit`, `${W}/integrations`,
];

/** Every header row on the page, and each heading's drawn font. */
const readHeadings = () => page.evaluate(() => {
  const rows = new Set();
  document.querySelectorAll('thead tr').forEach((row) => rows.add(row));
  document.querySelectorAll('[aria-sort]').forEach((heading) => heading.parentElement && rows.add(heading.parentElement));
  document.querySelectorAll('[class*="tableHeader"], [class*="tableHead_"], [class*="_tableHead"]').forEach((row) => rows.add(row));
  const found = [];
  for (const row of rows) {
    if (row.getBoundingClientRect().height === 0) continue;
    const headings = [...row.children].filter((cell) => cell.innerText.trim() !== '');
    if (headings.length < 2) continue;
    found.push(headings.map((cell) => {
      // What draws the text: the sort button where the heading is pressable, the heading itself otherwise.
      const drawn = cell.querySelector('button') ?? cell;
      const style = getComputedStyle(drawn);
      const sort = cell.getAttribute('aria-sort');
      // How many lines the words take: the distinct tops of the rectangles a range over them draws.
      const range = document.createRange();
      range.selectNodeContents(drawn);
      const lines = new Set([...range.getClientRects()].filter((rect) => rect.width > 0).map((rect) => Math.round(rect.top))).size;
      return {
        lines,
        label: cell.innerText.trim().replace(/\s+/g, ' ').slice(0, 30),
        font: [style.fontFamily, style.fontSize, style.fontWeight, style.letterSpacing, style.textTransform].join(' | '),
        colour: style.color,
        sorted: sort === 'ascending' || sort === 'descending',
      };
    }));
  }
  return found;
});

const visit = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (path.endsWith('#finished')) {
    await page.getByRole('tab', { name: /Finished/ }).click({ timeout: 10_000 }).catch(() => undefined);
  }
  await page.waitForTimeout(2500);
  await page.mouse.move(0, 0);
};

let tables = 0;
/** Headings whose words broke onto a second line: a column too narrow for its own name. */
const wrapped = [];
for (const path of PAGES) {
  await visit(path);
  const rows = await readHeadings();
  for (const headings of rows) {
    tables += 1;
    const [first] = headings;
    const odd = headings.filter((one) => one.font !== first.font);
    const off = headings.filter((one) => one.colour !== first.colour);
    const where = headings.map((one) => one.label).join(', ');
    for (const one of headings) if (one.lines > 1) wrapped.push([path, one.label]);
    record(
      odd.length === 0,
      `${path} [${where}]: one heading font${odd.length ? ` - ${odd.map((one) => `${one.label} is ${one.font}`).join('; ')} vs ${first.label} ${first.font}` : ''}`,
    );
    record(
      off.length === 0,
      `${path} [${where}]: one heading colour, the sorted column's too${off.length ? ` - ${off.map((one) => `${one.label}${one.sorted ? ' (sorted)' : ''} ${one.colour}`).join('; ')} vs ${first.label} ${first.colour}` : ''}`,
    );
  }
}
for (const [path, label] of wrapped) record(false, `${path}: the heading ${label} breaks onto a second line`);
record(wrapped.length === 0, `every heading is one line (${wrapped.length} wrap)`);
record(tables >= 15, `headings were found on the list pages (${tables} header rows)`);

await finish(browser);
