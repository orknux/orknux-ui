/**
 * A sortable heading starts where its column's cells start.
 *
 * The Roles table drew NAME centred over a column of left-aligned names: the
 * column's class laid its cells out as a flex column - a name above a
 * description - and the heading, which wears the same class, was a flex column
 * too, whose `align-items: center` centres across the width rather than down
 * it. Any table whose first column stacks two lines had the same heading.
 *
 * Measured, not reasoned about: the heading's text and the first row's text in
 * the same column, on the admin tables whose first column stacks.
 */
import { BASE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1600, height: 1000 } });

for (const [where, path, first] of [
  ['Roles', '/admin/roles', 'Administrators'],
  ['Templates', '/admin/templates', null],
  ['Boxes', '/admin/boxes', null],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, where);
  const measured = await page.evaluate(() => {
    const heading = document.querySelector('[aria-sort] button, [aria-sort]');
    if (heading === null) return null;
    const column = heading.closest('[aria-sort]');
    const cls = [...column.classList].find((one) => /col/i.test(one));
    // The same column in the first row: an element wearing the heading's column class that is not the heading.
    const cell = cls === undefined ? null : [...document.querySelectorAll(`.${CSS.escape(cls)}`)].find((one) => one !== column && !column.contains(one));
    const textLeft = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.round(range.getBoundingClientRect().left);
    };
    return cell === undefined || cell === null ? { heading: textLeft(heading), cell: null } : { heading: textLeft(heading), cell: textLeft(cell) };
  });
  if (measured === null || measured.cell === null) {
    console.log(`${where}: no sortable first column with rows to compare`);
    if (first !== null) record(false, `${where}: the table is drawn with a sortable heading and a row under it`);
    continue;
  }
  record(Math.abs(measured.heading - measured.cell) <= 12, `${where}: the first heading starts where its cells do (${measured.heading} / ${measured.cell})`);
}

await finish(browser);
