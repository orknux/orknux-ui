/**
 * Double-clicking a box in the wireframe editor opens its words for typing.
 *
 * It did not: the press before a double-click captures the pointer on the
 * canvas, so the browser sent the double-click to the canvas rather than the
 * box, and the editor found no box under it. Double-clicks a button and then a
 * rectangle drawn on top of a frame, through the mouse as a person would, types
 * new words into each and presses Enter, and reads them back off the canvas
 * and off the saved drawing - the rectangle's words going to the rectangle,
 * the topmost box under the point, and not to the frame under it.
 *
 * Makes its own wireframe and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

let id = null;
try {
  const drawing = {
    elements: [
      { id: 'screen', type: 'frame', x: 0, y: 0, w: 600, h: 400, text: 'Screen' },
      { id: 'cta', type: 'button', x: 40, y: 40, w: 200, h: 48, text: 'Old label' },
      { id: 'card', type: 'rect', x: 40, y: 160, w: 260, h: 120, text: 'Old card' },
    ],
  };
  id = (
    await graphql('mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }', {
      w: WORKSPACE,
      n: `Text edit check ${Date.now()}`,
      d: JSON.stringify(drawing),
    })
  ).createWireframe.id;

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-element-id="card"]').waitFor({ timeout: 20_000 });

  /** Double-clicks the element at its middle, types [words] and presses Enter; whether a text box opened. */
  async function retype(element, words) {
    const box = await page.locator(`[data-element-id="${element}"]`).first().boundingBox();
    if (box === null) return false;
    await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
    const typing = page.getByTestId('wireframe-text-input');
    const opened = await typing.waitFor({ timeout: 3_000 }).then(() => true).catch(() => false);
    if (!opened) return false;
    await typing.fill(words);
    await typing.press('Enter');
    return true;
  }

  const button = await retype('cta', 'New label');
  record(button, 'double-clicking a button opens its words for typing');
  record(((await page.locator('[data-element-id="cta"]').textContent()) ?? '').includes('New label'), 'and the words typed are drawn on it');

  const card = await retype('card', 'New card');
  record(card, 'double-clicking a box drawn on a frame opens the box, the topmost under the point');

  await page.waitForFunction(() => document.querySelector('[data-testid="wireframe-unsaved"]') === null, null, { timeout: 15_000 }).catch(() => undefined);
  const saved = JSON.parse((await graphql('query ($id: ID!) { wireframe(id: $id) { document } }', { id })).wireframe.document).elements;
  const text = (which) => saved.find((one) => one.id === which)?.text;
  record(text('cta') === 'New label' && text('card') === 'New card' && text('screen') === 'Screen',
    `the words are saved on the elements double-clicked and nowhere else (${JSON.stringify({ cta: text('cta'), card: text('card'), screen: text('screen') })})`);
} finally {
  if (id !== null) await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
