/**
 * The line under a table - "Showing 1-6 of 6 connections" - starts where the
 * table's first heading starts.
 *
 * It sat ten pixels to the left of NAME and of the search box above, because
 * the pager carried a smaller side padding than the table around it. Measured
 * on the lists the pager is drawn under, against the first column heading.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1500, height: 1000 } });

for (const [where, path, settle] of [
  ['integrations', `/workspace/${WORKSPACE}/integrations`, 'Connections'],
  ['objects', `/workspace/${WORKSPACE}/objects`, 'Objects'],
  ['models', `/workspace/${WORKSPACE}/models`, 'Providers'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, settle);
  const measured = await page.evaluate(() => {
    const pager = [...document.querySelectorAll('span, div, p')].find((one) => /^Showing /.test(one.textContent ?? '') && one.children.length <= 4);
    if (pager === undefined) return null;
    const card = pager.closest('section') ?? pager.parentElement;
    const heading = card?.querySelector('[aria-sort], th, [class*="tableHeader"] > *');
    const left = (element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Math.round(range.getBoundingClientRect().left);
    };
    return heading === null || heading === undefined ? { pager: left(pager), heading: null } : { pager: left(pager), heading: left(heading) };
  });
  if (measured === null || measured.heading === null) {
    console.log(`${where}: no pager under a headed table to measure`);
    continue;
  }
  record(Math.abs(measured.pager - measured.heading) <= 2, `${where}: the pager starts where the first heading does (${measured.pager} / ${measured.heading})`);
}

await finish(browser);
