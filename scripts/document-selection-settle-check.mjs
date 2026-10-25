/**
 * The bar over a selection - Explain, Summarise, Translate, Highlight - waits
 * for the selection to be finished: not drawn while the mouse button is still
 * down and the words are being swept over, drawn once it is let go; and from
 * the keyboard, not drawn while Shift is held and the arrows extend it, drawn
 * once Shift is let go.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const words = 'Check the quarterly figure before sending it to the board.';
const content = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: words }] }] };
const id = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }',
  { w: WORKSPACE, n: `Selection settle ${stamp}`, d: JSON.stringify(content) },
)).createDocument.id;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
  const menu = page.getByTestId('document-selection-menu');
  const selected = () => page.evaluate(() => window.getSelection()?.toString() ?? '');

  /** Where a run of the paragraph's text is drawn: the middle of its first and last letters. */
  const at = (phrase) =>
    page.getByTestId('document-prose').evaluate((prose, phrase) => {
      const text = prose.querySelector('p').firstChild;
      const start = text.textContent.indexOf(phrase);
      const box = (from) => {
        const range = document.createRange();
        range.setStart(text, from);
        range.setEnd(text, from + 1);
        const rect = range.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      };
      return { first: box(start), last: box(start + phrase.length - 1) };
    }, phrase);

  // -- The mouse: pressed, swept, held, let go. ---------------------------------
  const sweep = await at('quarterly figure before');
  await page.mouse.move(sweep.first.x - 3, sweep.first.y);
  await page.mouse.down();
  await page.mouse.move((sweep.first.x + sweep.last.x) / 2, sweep.first.y, { steps: 6 });
  await page.waitForTimeout(400);
  const halfway = await selected();
  record(halfway.trim() !== '', `halfway through the sweep there is a selection (${JSON.stringify(halfway)})`);
  record(await menu.count() === 0, 'and no bar over it while the button is down');
  await page.mouse.move(sweep.last.x + 3, sweep.last.y, { steps: 6 });
  await page.waitForTimeout(400);
  record(await menu.count() === 0, 'nor at the end of the sweep, the button still down');
  await page.screenshot({ path: shot('document-selection-held.png') });
  await page.mouse.up();
  await menu.waitFor({ timeout: 3_000 }).catch(() => undefined);
  const drawn = await menu.boundingBox();
  record(drawn !== null && drawn.width > 0 && drawn.height > 0, `the bar is drawn once the button is let go (${JSON.stringify(drawn)})`);
  record((await selected()).includes('quarterly figure'), 'over the words swept');
  await page.screenshot({ path: shot('document-selection-released.png') });

  // -- The keyboard: Shift held, arrows, Shift let go. -------------------------
  const start = await at('Check');
  await page.mouse.click(start.first.x - 3, start.first.y);
  await page.keyboard.press('Home');
  await page.waitForTimeout(300);
  record(await menu.count() === 0, 'a caret with nothing selected has no bar');
  await page.keyboard.down('Shift');
  for (let step = 0; step < 9; step += 1) await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const shifted = await selected();
  record(shifted === 'Check the', `Shift and the arrows select words (${JSON.stringify(shifted)})`);
  record(await menu.count() === 0, 'and no bar while Shift is held');
  await page.keyboard.up('Shift');
  await menu.waitFor({ timeout: 3_000 }).catch(() => undefined);
  record(await menu.count() === 1, 'the bar is drawn once Shift is let go');
} finally {
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
}
await finish(browser);
