/**
 * A table longer than a page breaks between its rows, as a list breaks between
 * its items, rather than running across the gap between two sheets.
 *
 * A table was one block to the page layout, and a block taller than a page is
 * left to run on - so the dark gap between two sheets, drawn behind the
 * document, lay across whichever rows happened to reach it and hid them. Read
 * off the screen: every row has to sit inside some sheet's text area, a row
 * that moved to a new sheet starts at its top, and the stored document holds
 * no trace of where the pages fell.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const cell = (text, header = false) => ({
  type: header ? 'tableHeader' : 'tableCell',
  attrs: { colspan: 1, rowspan: 1, colwidth: null },
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});
const reason = (at) => `Row ${at}: a reason long enough to wrap onto a few lines in the narrow last column, as the excluded tickets in a real report do.`;
const content = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: `Table pages ${stamp}` }] },
    ...Array.from({ length: 6 }, (_, at) => ({ type: 'paragraph', content: [{ type: 'text', text: `Opening paragraph ${at + 1}, before the table starts somewhere down the first sheet.` }] })),
    {
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('Ticket', true), cell('SP', true), cell('Reason', true)] },
        ...Array.from({ length: 45 }, (_, at) => ({ type: 'tableRow', content: [cell(`SNA-${3000 + at}`), cell(String(at % 5)), cell(reason(at + 1))] })),
      ],
    },
    { type: 'paragraph', content: [{ type: 'text', text: 'After the table.' }] },
  ],
};
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Table pages ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-page').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1200);

  const sheets = await page.getByTestId('document-page').evaluateAll((all) => all.map((one) => {
    const box = one.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom };
  }));
  record(sheets.length >= 3, `the table takes the document onto three sheets or more (${sheets.length})`);

  const margin = 25 * 96 / 25.4;
  const rows = await page.locator('[data-testid="document-prose"] table tr:not([data-page-gap])').evaluateAll((all) => all.map((one) => {
    const box = one.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, text: one.textContent.slice(0, 12) };
  }));
  record(rows.length === 46, `every row is drawn (${rows.length})`);
  const inside = (one) => sheets.some((sheet) => one.top >= sheet.top + margin - 2 && one.bottom <= sheet.bottom - margin + 2);
  const astray = rows.filter((one) => !inside(one));
  record(astray.length === 0, `no row lies across the gap between two sheets (${astray.length} astray: ${astray.slice(0, 3).map((one) => one.text).join(' | ')})`);

  // A row moved onto a new sheet starts at the top of that sheet's text.
  const firstOnSheet = sheets.slice(1).map((sheet) => rows.find((one) => one.top >= sheet.top && one.top < sheet.bottom)).filter(Boolean);
  const holding = (one) => sheets.find((sheet) => one.top >= sheet.top && one.top < sheet.bottom);
  record(
    firstOnSheet.length >= 1 && firstOnSheet.every((one) => Math.abs(one.top - (holding(one).top + margin)) < 3),
    `a row carried onto a new sheet starts at the top of it (${firstOnSheet.map((one) => Math.round(one.top - holding(one).top)).join(', ')})`,
  );

  const after = await page.locator('[data-testid="document-prose"] > p', { hasText: 'After the table.' }).evaluate((one) => {
    const box = one.getBoundingClientRect();
    return { top: box.top, bottom: box.bottom, text: 'after' };
  });
  record(inside(after), 'the paragraph after the table is inside a sheet too');

  // The page breaks are drawn, never stored.
  const stored = (await graphql('query ($id: ID!) { document(id: $id) { content } }', { id })).document.content;
  record(!stored.includes('page-gap') && JSON.parse(stored).content.find((one) => one.type === 'table').content.length === 46,
    'the stored table holds its 46 rows and nothing of the pages');
  await page.screenshot({ path: shot('document-table-pages.png') });
} finally {
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
