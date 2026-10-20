/**
 * The strip of what was asked for in the image editor says its order.
 *
 * The thumbnails stood side by side with nothing to say which came first, so
 * which one was on top of which could only be guessed. Newest is on the left,
 * so each is numbered in the order it was asked for - 1 the first, at the
 * right - under its own thumbnail, and the strip's title says the highest is
 * on top.
 *
 * Three requests are opened one after another, as from the gallery; they are
 * answered here, so the check needs no image server of the installation's.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const job = (id) => ({
  id, status: 'FAILED', prompt: `zz strip order ${id}`, modelId: null, model: 'Drawer', size: null, quality: null, style: null,
  requestedBy: 'alice', requestedAt: new Date().toISOString(), startedAt: null, reason: 'no', ahead: 0, name: null,
  sourceId: null, upscaler: null, scale: null, strength: null, checkpoint: null, image: null,
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: job(String(body.variables?.id)) } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/new?job=881`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('editor-strip').waitFor({ timeout: 20_000 }).catch(() => undefined);
for (const id of ['882', '883']) {
  // As a link inside the application goes: the page stays, and adds what it is asked to open.
  await page.evaluate((to) => {
    window.history.pushState({}, '', to);
    window.dispatchEvent(new PopStateEvent('popstate'));
  }, `/workspace/${WORKSPACE}/design/images/new?job=${id}`);
  await page.waitForTimeout(800);
}

const strip = await page.evaluate(() => {
  const row = document.querySelector('[data-testid="editor-strip"]');
  if (!row) return null;
  const items = [...row.querySelectorAll('button')].map((button) => {
    const at = button.getBoundingClientRect();
    const number = button.parentElement?.querySelector('[data-testid="editor-strip-order"]');
    const under = number?.getBoundingClientRect();
    return {
      prompt: button.title,
      number: number?.textContent ?? null,
      below: under !== undefined && under.top >= at.bottom,
      centred: under !== undefined && Math.abs((under.left + under.right) / 2 - (at.left + at.right) / 2) <= 2,
      left: at.left,
    };
  });
  return { title: row.getAttribute('title'), items: items.sort((a, b) => a.left - b.left) };
});

const numbers = strip?.items.map((one) => one.number) ?? [];
const prompts = strip?.items.map((one) => one.prompt) ?? [];
record(JSON.stringify(numbers) === '["3","2","1"]' && JSON.stringify(prompts) === '["zz strip order 883","zz strip order 882","zz strip order 881"]',
  `each thumbnail is numbered in the order asked for, the first 1 at the right (${JSON.stringify({ numbers, prompts })})`);
record(strip !== null && strip.items.length === 3 && strip.items.every((one) => one.below && one.centred),
  `each number sits under its own thumbnail (${JSON.stringify(strip?.items)})`);
record(typeof strip?.title === 'string' && /on top/.test(strip.title) && /left/.test(strip.title),
  `the strip says which is on top (${strip?.title})`);

await finish(browser);
