/**
 * Design -> Images makes an image from outside: a PNG picked through Import
 * opens in the image editor as a picture of its own, a picture pasted on the
 * page does the same and is called "Pasted picture", and a file that is not a
 * picture is refused on the page in words rather than sent.
 *
 * Read off the page and the server: the address the editor opens at, and the
 * picture that address names - its size, its name. Makes its own pictures and
 * removes them at the end.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

/** A 3x2 red PNG, so what is kept can be told from anything else by its size. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGM4IScHQQxwFgBBAAYZPEVBlgAAAABJRU5ErkJggg==';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const made = [];

async function picture(id) {
  const held = await graphql(
    'query ($w: ID!, $id: ID!) { workspaceArtifact(workspaceId: $w, id: $id) { id name url } }',
    { w: WORKSPACE, id },
  );
  return held.workspaceArtifact;
}

/** The size of the picture an address serves, read by the page's own image loading. */
async function sizeOf(url) {
  return page.evaluate(
    (src) =>
      new Promise((done) => {
        const image = new Image();
        image.onload = () => done(`${image.naturalWidth}x${image.naturalHeight}`);
        image.onerror = () => done(null);
        image.src = src;
      }),
    url,
  );
}

async function gallery() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('design-images-import').waitFor({ timeout: 20_000 });
}

const editorAddress = /\/design\/images\/(DESIGN-\d+)\/edit$/;

try {
  // Picked through Import.
  await gallery();
  await page.getByTestId('design-images-import-file').setInputFiles({
    name: 'red square.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG, 'base64'),
  });
  await page.waitForURL(editorAddress, { timeout: 20_000 }).catch(() => undefined);
  const picked = editorAddress.exec(page.url())?.[1] ?? null;
  record(picked !== null, `Import opens the picked PNG in the image editor (${page.url()})`);
  if (picked !== null) {
    made.push(picked);
    const kept = await picture(picked);
    record(kept?.name === 'red square', `it is kept under the file's name ("${kept?.name}")`);
    const size = kept === null ? null : await sizeOf(kept.url);
    record(size === '3x2', `and is the picture that was picked: 3x2 (${size})`);
  }

  // Pasted on the page: a paste event carrying a picture, as Ctrl+V with one on the clipboard sends.
  await gallery();
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const carried = new DataTransfer();
    carried.items.add(new File([bytes], 'image.png', { type: 'image/png' }));
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: carried, bubbles: true, cancelable: true }));
  }, PNG);
  await page.waitForURL(editorAddress, { timeout: 20_000 }).catch(() => undefined);
  const pasted = editorAddress.exec(page.url())?.[1] ?? null;
  record(pasted !== null && pasted !== picked, `A picture pasted on the page opens as a new image (${page.url()})`);
  if (pasted !== null && pasted !== picked) {
    made.push(pasted);
    const kept = await picture(pasted);
    record(kept?.name === 'Pasted picture', `called "Pasted picture" ("${kept?.name}")`);
  }

  // A file that is not a picture is refused before anything is sent.
  await gallery();
  await page.getByTestId('design-images-import-file').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not a picture'),
  });
  const refusal = page.getByTestId('design-images-import-error');
  await refusal.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const said = (await refusal.count()) === 0 ? null : (await refusal.innerText()).trim();
  record(said !== null && said.includes('not a picture'), `a text file is refused on the page ("${said}")`);
  record(/\/design\/images$/.test(page.url()), `and the page stays on the gallery (${page.url()})`);
} finally {
  for (const id of made) {
    await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id }).catch(() => undefined);
  }
}

await finish(browser);
