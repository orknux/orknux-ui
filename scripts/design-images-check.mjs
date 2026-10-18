/**
 * Design is a section of its own, and a picture on Artifacts opens in it.
 *
 * The bar across the top gains Design and is in the alphabet's order - AI,
 * Chat, Design, Flow, Workspace - and Design's menu starts at Images. A picture
 * on the Artifacts page carries "Open in Design", which lands on that image,
 * shown above the gallery.
 *
 * The artifact list is answered here with one picture, so the check does not
 * depend on the installation having drawn anything.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

// A grey square: a picture that is certainly there.
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgGAWjYBSMAggAAAQQAAGFP6pyAAAAAElFTkSuQmCC';
const PICTURE = {
  id: 'IMAGE-424242',
  kind: 'IMAGE',
  source: 'Run #42',
  sourcePath: 'executions/42',
  prompt: 'zz design check: a lighthouse at dusk',
  filename: 'lighthouse.png',
  contentType: 'image/png',
  sizeBytes: 1024,
  url: PNG,
  previewUrl: PNG,
  drawnAt: new Date().toISOString(),
};
const drawnAsked = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifacts(')) {
    drawnAsked.push(body.variables?.drawn === true);
    return route.fulfill({
      json: { data: { workspaceArtifacts: { content: [PICTURE], page: 0, size: 24, totalElements: 1, totalPages: 1 } } },
    });
  }
  if (query.includes('workspaceArtifact(')) return route.fulfill({ json: { data: { workspaceArtifact: PICTURE } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
const link = page.locator('[data-open-in-design]').first();
await link.waitFor({ timeout: 20_000 }).catch(() => undefined);

// The bar, left to right, as drawn - once Chat is in it, which waits for the installation's settings.
await page.locator('nav a', { hasText: /^Chat$/ }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
const bar = await page.evaluate(() => {
  const names = ['AI', 'Chat', 'Design', 'Flow', 'Workspace'];
  return [...document.querySelectorAll('header a, header button')]
    .filter((one) => names.includes(one.textContent?.trim() ?? ''))
    .map((one) => ({ name: one.textContent.trim(), x: one.getBoundingClientRect().left }))
    .sort((a, b) => a.x - b.x)
    .map((one) => one.name);
});
record(JSON.stringify(bar) === JSON.stringify(['AI', 'Chat', 'Design', 'Flow', 'Workspace']), `the top bar is in the alphabet's order (${bar.join(', ')})`);

record((await link.count()) === 1, 'a picture on Artifacts offers Open in Design');
await link.click().catch(() => undefined);
await page.waitForURL(new RegExp(`/workspace/${WORKSPACE}/design/images/${PICTURE.id}$`), { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(`/design/images/${PICTURE.id}`), `which lands on that image in Design (${page.url()})`);

const shown = page.locator(`[data-design-image="${PICTURE.id}"]`);
await shown.waitFor({ timeout: 10_000 }).catch(() => undefined);
const box = await shown.locator('img').boundingBox().catch(() => null);
record(box !== null && box.width > 200, `the image is shown large above the gallery (${JSON.stringify(box)})`);
record(drawnAsked.includes(true), 'and the gallery asks for drawn pictures only');

// Design is the section lit, and its menu holds Images.
const lit = await page.evaluate(() =>
  [...document.querySelectorAll('header a[aria-current="page"], header a[class*="active"]')].map((one) => one.textContent?.trim()),
);
record(lit.includes('Design'), `Design is the section lit (${JSON.stringify(lit)})`);
const menu = page.locator('nav a', { hasText: 'Images' });
record((await menu.count()) >= 1, 'and its menu lists Images');

await finish(browser);
