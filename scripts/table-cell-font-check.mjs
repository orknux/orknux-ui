/**
 * The cells of a table row are drawn in one font size.
 *
 * Headings were made one font earlier (table-heading-font-check). The cells
 * under them were not: a cell whose column class set a size drew at it, and a
 * cell whose class set nothing inherited the page's 16px. So the Models
 * providers row drew its type - "OpenAI" - at 16px between a 14px name and a
 * 14px status, and other lists did the same with whatever column nobody had
 * styled.
 *
 * Read off what is drawn, on every list page: each table's body rows - the
 * rows after a header row, under the same parent - and in each, the first run
 * of text in every cell, by computed font size. Ordinary text shares the row's
 * size. Monospace is the one declared exception, and the family is the
 * declaration: an endpoint, a key, a cron line may be set in the mono face, at
 * the row's size or one step smaller (its x-height is larger), never larger.
 * A chip - a status or type badge, drawn with a background or border of its
 * own - is a shape in the row rather than its text, and may be smaller, never
 * larger. Weight and colour may differ - a name is bold, a hint is muted - and
 * are not compared.
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

/** Every table's body rows on the page, and the first text of each cell with its drawn size and family. */
const readRows = () => page.evaluate(() => {
  const headers = new Set();
  document.querySelectorAll('thead tr').forEach((row) => headers.add(row));
  document.querySelectorAll('[aria-sort]').forEach((heading) => heading.parentElement && headers.add(heading.parentElement));
  document.querySelectorAll('[class*="tableHeader"], [class*="tableHead_"], [class*="_tableHead"]').forEach((row) => headers.add(row));

  /** The element drawing the first words in [cell], or null where it holds none - icons, buttons only. */
  const firstText = (cell) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      if (node.textContent.trim() === '') continue;
      const holder = node.parentElement;
      if (holder === null || holder.closest('button, select, [role="button"], [aria-hidden="true"]')) continue;
      if (holder.getBoundingClientRect().width === 0) continue;
      return holder;
    }
    return null;
  };

  const tables = [];
  for (const header of headers) {
    if (header.getBoundingClientRect().height === 0) continue;
    const body = header.tagName === 'TR'
      ? [...(header.closest('table')?.querySelectorAll('tbody tr') ?? [])]
      // Only what follows the header: a card's title row above it is not one of its rows.
      : [...(header.parentElement?.children ?? [])]
        .slice([...(header.parentElement?.children ?? [])].indexOf(header) + 1)
        .filter((row) => !headers.has(row));
    const rows = [];
    for (const row of body) {
      if (row.getBoundingClientRect().height === 0) continue;
      const cells = [...row.children]
        .map((cell) => ({ cell, text: firstText(cell) }))
        .filter((one) => one.text !== null);
      if (cells.length < 2) continue;
      rows.push(cells.map(({ cell, text }) => {
        const style = getComputedStyle(text);
        return {
          column: (cell.className.split(' ')[0] || cell.tagName).replace(/^_|_[0-9a-z]+_\d+$/gi, ''),
          words: text.textContent.trim().slice(0, 24),
          // Which class drew it, for the message: where to look to fix it.
          drawnBy: (text.className && typeof text.className === 'string' ? text.className.split(' ')[0] : text.tagName).replace(/^_|_[0-9a-z]+_\d+$/gi, ''),
          size: parseFloat(style.fontSize),
          mono: /mono/i.test(style.fontFamily),
          // A chip - a badge drawn with a background or a border of its own - is a shape in the row, not its text.
          chip: !/rgba\(0, 0, 0, 0\)|transparent/.test(style.backgroundColor) || parseFloat(style.borderTopWidth) > 0,
        };
      }));
    }
    if (rows.length > 0) tables.push(rows);
  }
  return tables;
});

const visit = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (path.endsWith('#finished')) {
    await page.getByRole('tab', { name: /Finished/ }).click({ timeout: 10_000 }).catch(() => undefined);
  }
  await page.waitForTimeout(2500);
};

/** The size most of a row's ordinary text is drawn at. */
const dominant = (cells) => {
  const counts = new Map();
  for (const one of cells.filter((cell) => !cell.mono && !cell.chip)) counts.set(one.size, (counts.get(one.size) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
};

let rowsRead = 0;
for (const path of PAGES) {
  await visit(path);
  const tables = await readRows();
  const odd = new Map();
  for (const rows of tables) {
    for (const cells of rows) {
      rowsRead += 1;
      const size = dominant(cells);
      if (size === null) continue;
      for (const cell of cells) {
        const fits = cell.chip
          ? cell.size <= size
          : cell.mono
            ? cell.size <= size && cell.size >= size - 1.5
            : cell.size === size;
        if (!fits) odd.set(cell.column, `${cell.column}/${cell.drawnBy} "${cell.words}" at ${cell.size}px${cell.mono ? ' mono' : ''} in a ${size}px row`);
      }
    }
  }
  record(odd.size === 0, `${path}: one cell size per row${odd.size ? ` - ${[...odd.values()].join('; ')}` : ''}`);
}
record(rowsRead >= 30, `table rows were read on the list pages (${rowsRead})`);

await finish(browser);
