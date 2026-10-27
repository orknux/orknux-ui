/**
 * A sticky note in a wireframe is at least as tall as its words.
 *
 * A note drawn shorter than what is written in it - by a model writing a
 * mockup, or by somebody dragging it smaller - showed the start of a sentence
 * and hid the rest. The server reads a note at least as tall as its words, and
 * the editor draws it the same way while it is typed in.
 *
 * Measured: a note saved 40px tall with four lines' worth of words comes back
 * from the server taller; in the editor its box is at least as tall as its
 * words are drawn (the text's own height inside it); and a note given more
 * room than it needs keeps it. Makes a wireframe and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const words = 'Select offers only workspaces not listed and not this one. Add puts it in the list.';
const elements = [
  { id: 'short', type: 'note', x: 40, y: 40, w: 120, h: 40, text: words, props: {} },
  { id: 'roomy', type: 'note', x: 260, y: 40, w: 300, h: 300, text: 'Short.', props: {} },
];
const made = (await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id document } }',
  { w: WORKSPACE, n: `zzNote fits ${Date.now()}`, d: JSON.stringify({ elements }) },
)).createWireframe;

try {
  const held = JSON.parse(made.document).elements;
  const short = held.find((one) => one.id === 'short');
  const roomy = held.find((one) => one.id === 'roomy');
  record(short.h > 40, `the server reads the short note taller than it was sent (${short.h}px)`);
  record(roomy.h === 300, `and leaves a roomy note its height (${roomy.h}px)`);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/wireframes/${made.id}`, { waitUntil: 'domcontentloaded' });
  const box = page.locator('[class*="_note_"]').first();
  await box.waitFor({ timeout: 20_000 });
  const fits = await page.evaluate(() => {
    const rect = document.querySelector('[class*="_note_"]');
    const words = rect?.parentElement?.querySelector('[class*="_noteText_"]');
    if (rect === null || words === null || words === undefined) return null;
    return { box: rect.getBoundingClientRect().height, words: words.scrollHeight, shown: words.getBoundingClientRect().height };
  });
  console.log(JSON.stringify(fits));
  record(fits !== null && fits.box + 1 >= fits.words, `in the editor its box holds all its words (box ${Math.round(fits?.box ?? 0)}, words ${Math.round(fits?.words ?? 0)})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id: made.id }).catch(() => undefined);
}
await finish(browser);
