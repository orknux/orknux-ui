/**
 * The document editor's outline column keeps its width: a long highlight note
 * is cut short inside it rather than widening it until the page went under the
 * chat, and its edge is dragged to make it wider, which is kept.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
await page.evaluate(() => localStorage.removeItem('orknux.document.side-width')).catch(() => {});
const note = 'A note long enough to have pushed the page aside: '.repeat(8);
const content = JSON.stringify({ type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: 'Highlighted words', marks: [{ type: 'note', attrs: { note, id: 'n1' } }] }, { type: 'text', text: ' and the rest.' }] },
] });
const { createDocument: made } = await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d) { id } }', { w: WORKSPACE, n: `zzOutline ${Date.now()}`, d: content });
await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${made.id}`, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.removeItem('orknux.document.side-width'));
await page.reload({ waitUntil: 'domcontentloaded' });
const side = page.getByTestId('document-side');
await side.waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);
const before = Math.round((await side.boundingBox()).width);
record(before <= 242, `a long note leaves the column at its width (${before}px)`);

const handle = page.locator('[role="separator"][aria-controls="document-side"]');
const grip = await handle.boundingBox();
record(grip !== null, 'its edge can be taken hold of');
if (grip !== null) {
  await page.mouse.move(grip.x + grip.width / 2, grip.y + 200);
  await page.mouse.down();
  await page.mouse.move(grip.x + 120, grip.y + 200, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = Math.round((await side.boundingBox()).width);
  record(after >= before + 100, `dragged, it widens (${before} → ${after}px)`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await side.waitFor({ timeout: 20_000 });
  const kept = Math.round((await side.boundingBox()).width);
  record(Math.abs(kept - after) <= 2, `and keeps that width (${kept}px)`);
}
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: made.id }).catch(() => {});
await page.evaluate(() => localStorage.removeItem('orknux.document.side-width')).catch(() => {});
await finish(browser);
