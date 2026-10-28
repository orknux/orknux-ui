/**
 * A picture hosted as an artifact from its preview on Design's Images page,
 * and the address it is hosted at serving the picture as it is saved - after
 * an edit too, with nothing done again.
 *
 * Imports a 3x2 picture, opens its preview, presses Host as artifact, and reads
 * the address the preview then shows. Fetched in the page, the address serves
 * the picture's bytes - compared by SHA-256 against the file that was
 * imported. The picture is then rotated in the image editor and saved, and the
 * same address serves a 2x3 picture whose bytes are no longer the imported
 * ones. Hosting again from the preview shows the same artifact; Stop hosting
 * takes the artifact away, the address answers 404, and the picture stays.
 *
 * Makes its own picture and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

/** A 3x2 red PNG: rotated, it is 2x3, which is how the edit is told apart. */
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEElEQVR4nGM4IScHQQxwFgBBAAYZPEVBlgAAAABJRU5ErkJggg==';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

/** What an address serves, read in the page with the signed-in cookie: its status, SHA-256, and drawn size. */
async function served(address) {
  return page.evaluate(async (url) => {
    const answer = await fetch(url, { cache: 'no-store', credentials: 'include' });
    if (!answer.ok) return { status: answer.status, sha: null, size: null };
    const bytes = await answer.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const sha = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    const bitmap = await createImageBitmap(new Blob([bytes]));
    return { status: answer.status, sha, size: `${bitmap.width}x${bitmap.height}` };
  }, address);
}

const sha = async (base64) =>
  page.evaluate(async (data) => {
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }, base64);

let picture = null;
try {
  picture = (
    await graphql('mutation ($w: ID!, $i: String!) { importDesignImage(input: { workspaceId: $w, image: $i, name: "Hosted check" }) { id } }', {
      w: WORKSPACE,
      i: PNG,
    })
  ).importDesignImage.id;

  const preview = `${BASE}/workspace/${WORKSPACE}/design/images/${picture}`;
  await page.goto(preview, { waitUntil: 'domcontentloaded' });
  const hosting = page.getByTestId('design-image-hosting');
  await hosting.waitFor({ timeout: 20_000 });
  record((await hosting.getAttribute('data-hosted')) === 'false', 'the preview offers to host the picture as an artifact');

  await page.getByTestId('design-image-host').click();
  await page.locator('[data-testid="design-image-hosting"][data-hosted="true"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const artifact = await hosting.getAttribute('data-artifact');
  const address = ((await page.getByTestId('design-image-hosted-link').innerText().catch(() => '')) ?? '').trim();
  record(artifact?.startsWith('SAVED-') === true && address.endsWith(`/api/artifacts/${artifact?.replace('SAVED-', '')}`),
    `hosted, the preview shows the artifact and its address (${artifact}, ${address})`);

  const imported = await sha(PNG);
  const first = await served(address);
  record(first.status === 200 && first.sha === imported && first.size === '3x2', `the address serves the picture as imported (${JSON.stringify(first)})`);

  // Edited in the image editor and saved: the address serves what was saved, with nothing done again.
  await page.goto(`${preview}/edit`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 });
  await page.getByTestId('editor-rotate-right').click();
  await page.getByTestId('editor-unsaved').waitFor({ timeout: 10_000 }).catch(() => undefined);
  await page.getByTestId('editor-save').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="editor-unsaved"]') === null, null, { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
  const after = await served(address);
  record(after.status === 200 && after.size === '2x3' && after.sha !== imported,
    `after the picture is rotated and saved in the editor, the same address serves the rotated picture (${JSON.stringify(after)})`);

  // Hosting again shows the artifact it already has.
  const again = (await graphql('mutation ($w: ID!, $id: ID!) { hostDesignImage(workspaceId: $w, id: $id) { id } }', { w: WORKSPACE, id: picture }))
    .hostDesignImage.id;
  record(again === artifact, `hosting again is the same artifact (${again})`);

  // Stopped from the preview: the artifact goes, its address with it, and the picture stays.
  await page.goto(preview, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('design-image-unhost').click();
  await page.locator('[data-testid="design-image-hosting"][data-hosted="false"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const gone = await served(address);
  const still = (await graphql('query ($w: ID!, $id: ID!) { workspaceArtifact(workspaceId: $w, id: $id) { id url } }', { w: WORKSPACE, id: picture }))
    .workspaceArtifact;
  const picturesBytes = still === null ? null : await served(still.url);
  record(gone.status === 404 && picturesBytes?.size === '2x3',
    `Stop hosting takes the artifact away (${gone.status}) and the picture stays as saved (${JSON.stringify(picturesBytes)})`);
} finally {
  if (picture !== null) await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id: picture }).catch(() => undefined);
}

await finish(browser);
