/**
 * The documents list (#663): the page-size picker for new documents stands
 * apart from the buttons beside it, and Import takes several files at once -
 * each a document of its own, named after its file and holding what the file
 * said, while a file that cannot be read leaves nothing behind and is named.
 *
 * Imports its own files and removes the documents they made.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const stamp = Date.now();
const named = (word) => `zzImported ${word} ${stamp}`;
const files = [
  { name: `${named('Alpha')}.md`, mimeType: 'text/markdown', buffer: Buffer.from(`# Alpha heading\n\nThe alpha words ${stamp}.\n`) },
  { name: `${named('Beta')}.txt`, mimeType: 'text/plain', buffer: Buffer.from(`The beta words ${stamp}.\n`) },
  { name: `${named('Gamma')}.html`, mimeType: 'text/html', buffer: Buffer.from(`<h1>Gamma heading</h1><p>The gamma words ${stamp}.</p>`) },
  { name: `${named('Broken')}.pdf`, mimeType: 'application/pdf', buffer: Buffer.from('this is not a PDF at all') },
];
const ours = async () =>
  (await graphql('query ($w: ID!, $s: String) { documents(workspaceId: $w, search: $s) { id name excerpt } }', { w: WORKSPACE, s: `${stamp}` })).documents.filter((one) =>
    one.name.endsWith(`${stamp}`),
  );

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents`, { waitUntil: 'domcontentloaded' });
  const picker = page.getByTestId('document-page-default');
  await picker.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const importing = page.getByTestId('documents-import');
  const there = await importing.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(there, 'the list offers Import');

  // The space between the picker and the button after it, read off what is drawn.
  const left = await picker.boundingBox();
  const right = there ? await importing.boundingBox() : await page.getByTestId('new-document').boundingBox();
  const gap = left === null || right === null ? -1 : Math.round(right.x - (left.x + left.width));
  record(gap >= 16, `the page-size picker stands at least 16px from the button beside it (${gap}px)`);
  const make = await page.getByTestId('new-document').boundingBox();
  const between = right === null || make === null ? -1 : Math.round(make.x - (right.x + right.width));
  record(there && between >= 10 && between <= 16, `Import sits beside New document with room between (${between}px)`);
  // And the two read as a pair: the same height, the same type, the same inset.
  const pair = await page.evaluate(() => {
    const read = (id) => {
      const el = document.querySelector(`[data-testid="${id}"]`);
      if (!el) return null;
      const css = getComputedStyle(el);
      return { height: Math.round(el.getBoundingClientRect().height), size: css.fontSize, left: parseFloat(css.paddingLeft) + parseFloat(css.borderLeftWidth) };
    };
    return { importing: read('documents-import'), making: read('new-document') };
  });
  const matched = pair.importing !== null && pair.making !== null &&
    pair.importing.height === pair.making.height && pair.importing.size === pair.making.size && pair.importing.left === pair.making.left;
  record(matched, `Import and New document stand the same height, in the same type and inset (${JSON.stringify(pair)})`);

  await page.getByTestId('documents-import-file').setInputFiles(files).catch(() => undefined);
  const error = page.getByTestId('documents-error');
  await error.waitFor({ timeout: 30_000 }).catch(() => undefined);
  const said = ((await error.textContent().catch(() => '')) ?? '').trim();
  record(said.includes(`${named('Broken')}.pdf`) && !said.includes('Alpha'), `a file that could not be read is named, and only it (${said})`);

  const made = await ours();
  const names = made.map((one) => one.name).sort();
  record(
    JSON.stringify(names) === JSON.stringify([named('Alpha'), named('Beta'), named('Gamma')]),
    `each readable file is a document named after it, and the broken one left none (${JSON.stringify(names)})`,
  );
  const holds = (word) => made.find((one) => one.name === named(word))?.excerpt ?? '';
  record(
    holds('Alpha').includes(`alpha words ${stamp}`) && holds('Beta').includes(`beta words ${stamp}`) && holds('Gamma').includes(`gamma words ${stamp}`),
    `and each holds what its file said (${JSON.stringify(made.map((one) => one.excerpt))})`,
  );
  const rows = await page.locator('[data-testid="document-row"]').evaluateAll((all) => all.map((row) => row.getAttribute('data-name')));
  record(['Alpha', 'Beta', 'Gamma'].every((word) => rows.includes(named(word))), 'the list shows them without a reload');
} finally {
  for (const one of await ours().catch(() => [])) {
    await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: one.id }).catch(() => undefined);
  }
}

await finish(browser);
