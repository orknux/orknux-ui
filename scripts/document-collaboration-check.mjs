/**
 * Two people in one document's editor. Issue #683, as workflows have had since #645.
 *
 * Each tab sees the other is there and where it points on the paper. Words
 * typed in one are saved without pressing Save and appear in the other without
 * a reload. Two paragraphs written in the two tabs at the same moment both
 * stay: the second save is refused over the first's revision, merged block by
 * block and sent again, rather than writing over it.
 */
import { WORKSPACE, record, finish } from './suite/harness.mjs';
import { eachSeesTheOther, openBoth, pointerReaches, reachesTheServer, reachesTheTab, staleSaveRefused, twoTabs } from './suite/live-room.mjs';

const { browser, first, second, graphql, closeSecond } = await twoTabs();

const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const written = JSON.stringify({ type: 'doc', content: [paragraph('First line.'), paragraph('Second line.')] });
const { createDocument } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `zzTogether ${Date.now()}`, d: written },
);
const id = createDocument.id;
const stored = async () => {
  const { document } = await graphql('query ($id: ID!) { document(id: $id) { revision content } }', { id });
  return { revision: document.revision, text: JSON.stringify(JSON.parse(document.content)) };
};
const lines = '[data-testid="document-prose"] > p';

/** Types [words] at the end of the paragraph [nth] in [page]. */
async function typeAt(page, nth, words) {
  await page.locator(lines).nth(nth).click();
  await page.keyboard.press('End');
  await page.keyboard.type(words, { delay: 20 });
}

try {
  await openBoth(first, second, `/workspace/${WORKSPACE}/design/documents/${id}`, lines);
  await eachSeesTheOther(first, second);
  await pointerReaches(first, second, '[data-testid="document-paper"]');

  await typeAt(first, 0, ' Typed here.');
  await reachesTheServer(stored, (held) => held.text.includes('Typed here.'), 'words typed');
  await reachesTheTab(second, `document.querySelector('${lines}')?.textContent.includes('Typed here.') === true`, 'and they appear there too');

  await first.waitForTimeout(1500);
  await Promise.all([typeAt(first, 0, ' One.'), typeAt(second, 1, ' Two.')]);
  await reachesTheServer(
    stored,
    (held) => held.text.includes('One.') && held.text.includes('Two.') && held.text.includes('Typed here.'),
    'two paragraphs written at once in two tabs both stay, and',
  );

  const now = await stored();
  await staleSaveRefused(
    () => graphql('mutation ($id: ID!, $d: String!, $r: Int) { saveDocument(id: $id, content: $d, revision: $r) { revision } }', { id, d: written, r: now.revision - 1 }),
    'DocumentChanged',
  );
  record((await stored()).text === now.text, 'and nothing of it was written');
} finally {
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id }).catch(() => undefined);
  await closeSecond();
}

await finish(browser);
