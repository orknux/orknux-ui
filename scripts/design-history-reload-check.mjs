/**
 * A picture's history in the image editor survives a reload.
 *
 * The strip along the canvas's foot - each version drawn, each change waiting
 * or failed - was the page's own memory of what it had asked for, so a reload
 * emptied it while the versions were still kept by the server. It is read from
 * the server's designImageHistory now. The check opens a picture with two
 * versions and a failed change, reloads, and counts the strip both times.
 *
 * The picture and its history are answered here, so the check needs no image
 * server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const fill = (colour) => page.evaluate((c) => {
  const canvas = document.createElement('canvas');
  canvas.width = 60;
  canvas.height = 40;
  const pen = canvas.getContext('2d');
  pen.fillStyle = c;
  pen.fillRect(0, 0, 60, 40);
  return canvas.toDataURL('image/png');
}, colour);

const picture = (id, url, versionOf, draft) => ({
  id, kind: 'DESIGN', source: 'Design', sourcePath: `design/images/${id}`, prompt: 'zz history: a field', filename: 'field.png',
  contentType: 'image/png', sizeBytes: 1, url, previewUrl: null, drawnAt: new Date().toISOString(), name: 'Field',
  versionOf, draft, draftUrl: null, drawnWith: { modelId: '9191', model: 'Drawer', size: null, quality: null, style: null, drawnBy: 'alice' },
});
const ORIGINAL = picture('DESIGN-901', await fill('#808080'), null, 'DESIGN-903');
const FIRST = picture('DESIGN-902', await fill('#00ff00'), ORIGINAL.id, null);
const SECOND = picture('DESIGN-903', await fill('#ff0000'), ORIGINAL.id, null);
const job = (id, status, image, sourceId) => ({
  id, status, prompt: `zz history ${id}`, modelId: '9191', model: 'Drawer', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: status === 'FAILED' ? 'no' : null, ahead: null,
  name: 'Field', sourceId, upscaler: null, scale: null, strength: null, checkpoint: null, image,
});
const HISTORY = [job('913', 'FAILED', null, SECOND.id), job('912', 'DRAWN', SECOND, FIRST.id), job('911', 'DRAWN', FIRST, ORIGINAL.id)];
const asked = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('workspaceArtifact(')) {
    const id = body.variables?.id;
    return route.fulfill({ json: { data: { workspaceArtifact: [ORIGINAL, FIRST, SECOND].find((one) => one.id === id) ?? null } } });
  }
  if (query.includes('designImageHistory')) {
    asked.push(body.variables?.imageId);
    return route.fulfill({ json: { data: { designImageHistory: HISTORY } } });
  }
  return route.continue();
});

const strip = async () => {
  await page.getByTestId('editor-strip').waitFor({ timeout: 10_000 }).catch(() => undefined);
  return page.evaluate(() =>
    [...document.querySelectorAll('[data-testid="editor-strip"] button')].map((button) => button.getAttribute('data-status')));
};

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${ORIGINAL.id}/edit`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
const before = await strip();
record(JSON.stringify(before) === '["FAILED","DRAWN","DRAWN"]', `the editor opens with the picture's history in its strip (${JSON.stringify(before)})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-picture').waitFor({ timeout: 20_000 }).catch(() => undefined);
const after = await strip();
record(JSON.stringify(after) === '["FAILED","DRAWN","DRAWN"]' && asked.length >= 2 && asked.every((one) => one === ORIGINAL.id),
  `after a reload the history is still there, read again from the server (${JSON.stringify({ after, asked })})`);

await finish(browser);
