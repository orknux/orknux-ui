/**
 * A picture with a draft is shown as its draft in Design's gallery.
 *
 * Edited and left unsaved, a picture is marked Draft on its card - and the
 * card went on showing the picture as it was before the edit, because it drew
 * the picture's own address and the server named the draft only by its id.
 * The draft's address is answered beside it now, and the card and the
 * picture opened from it show that. Read off the pixels drawn, not the
 * address: what the reader saw was the colour of the old picture.
 *
 * The gallery is answered here - a grey picture whose draft is red - so the
 * check needs no picture of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const fill = (colour) => page.evaluate((c) => {
  const canvas = document.createElement('canvas');
  canvas.width = 40;
  canvas.height = 40;
  const pen = canvas.getContext('2d');
  pen.fillStyle = c;
  pen.fillRect(0, 0, 40, 40);
  return canvas.toDataURL('image/png');
}, colour);

const PICTURE = {
  id: 'DESIGN-891', kind: 'DESIGN', source: 'Design', sourcePath: 'design/images/DESIGN-891', prompt: 'zz draft card: a field',
  filename: 'field.png', contentType: 'image/png', sizeBytes: 1, url: await fill('#808080'), previewUrl: null,
  drawnAt: new Date().toISOString(), name: 'Field', versionOf: null, draft: 'DESIGN-892', draftUrl: await fill('#ff0000'),
  drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
};

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifacts(')) {
    return route.fulfill({ json: { data: { workspaceArtifacts: { content: [PICTURE], page: 0, size: 24, totalElements: 1, totalPages: 1 } } } });
  }
  if (query.includes('workspaceArtifact(')) return route.fulfill({ json: { data: { workspaceArtifact: PICTURE } } });
  if (query.includes('designImageQueue')) return route.fulfill({ json: { data: { designImageQueue: [] } } });
  return route.continue();
});

/** The colour drawn at an image's middle, as "r,g,b". */
const colourOf = (selector) => page.evaluate(async (wanted) => {
  const image = document.querySelector(wanted);
  if (!image) return null;
  if (!image.complete) await new Promise((done) => image.addEventListener('load', done, { once: true }));
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const pen = canvas.getContext('2d');
  pen.drawImage(image, 0, 0);
  const [r, g, b] = pen.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data;
  return `${r},${g},${b}`;
}, selector);

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-testid="design-gallery"] img[alt="zz draft card: a field"]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const badge = await page.locator('[data-testid="design-gallery"]').getByText('Draft', { exact: true }).isVisible().catch(() => false);
const card = await colourOf('[data-testid="design-gallery"] img[alt="zz draft card: a field"]');
record(badge && card === '255,0,0', `a card marked Draft shows the draft, not the picture before it (${JSON.stringify({ badge, card })})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${PICTURE.id}`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('design-image-focus').waitFor({ timeout: 20_000 }).catch(() => undefined);
const opened = await colourOf('[data-testid="design-image-focus"]');
record(opened === '255,0,0', `the picture opened from it shows the draft too (${opened})`);

await finish(browser);
