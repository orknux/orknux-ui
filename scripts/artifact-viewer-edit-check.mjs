/**
 * A picture opened from Artifacts can be taken straight to the editor: the
 * viewer offers Open in editor beside Save, and it lands on that picture's
 * editor.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

// A 2x2 PNG of its own, imported as a design picture and removed at the end.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANBAEBmAz2YQAAAABJRU5ErkJggg==';
const made = await graphql(
  'mutation($input: ImportDesignImageInput!) { importDesignImage(input: $input) { id contentType } }',
  { input: { workspaceId: WORKSPACE, image: PNG, name: `zz viewer ${Date.now()}` } },
).catch((error) => { record(false, `a picture to open could be imported (${String(error).slice(0, 200)})`); return null; });
const picture = made?.importDesignImage;

if (picture !== undefined && picture !== null) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/${picture.id}`, { waitUntil: 'domcontentloaded' });
  const edit = page.locator('dialog[open] [data-picture-edit]');
  await edit.waitFor({ timeout: 30_000 }).catch(() => undefined);
  const placed = await edit.evaluate((link) => {
    const save = document.querySelector('dialog[open] [data-picture-save]');
    const a = link.getBoundingClientRect();
    const b = save?.getBoundingClientRect();
    return { href: link.getAttribute('href'), level: b ? Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) : null, before: b ? a.right <= b.left : false };
  }).catch(() => null);
  record(placed !== null && placed.href === `/workspace/${WORKSPACE}/design/images/${picture.id}/edit` && placed.level !== null && placed.level < 2 && placed.before,
    `the viewer offers Open in editor beside Save (${JSON.stringify(placed)})`);
  await edit.click().catch(() => undefined);
  await page.waitForURL(/\/design\/images\/\d+\/edit$/, { timeout: 20_000 }).catch(() => undefined);
  record(page.url().endsWith(`/design/images/${picture.id}/edit`), `and it opens that picture's editor (${page.url().replace(BASE, '')})`);
}

if (picture) await graphql('mutation($id: ID!) { deleteArtifact(id: $id) }', { id: picture.id }).catch(() => undefined);
await finish(browser);
