/**
 * A long prompt stays inside its box in the image and video editors.
 *
 * The shared tall box is a fixed 96px and the prompt in it is at least 160px,
 * so the text hung out of the border and ran over the Model label below it -
 * seen with a pasted paragraph in the video editor. The box now grows with the
 * text area; measured here as the text area's bottom against the box's, and the
 * box's bottom against the next field's top.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });
const LONG = 'The motorcycles roll slowly forward toward the camera along the street, wheels turning, the camera tracking backward at the same speed so the riders stay framed. '.repeat(3);

for (const [what, path, id] of [
  ['image', `/workspace/${WORKSPACE}/design/images/new`, 'image-prompt'],
  ['video', `/workspace/${WORKSPACE}/design/videos/new`, 'video-prompt'],
]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  const box = page.locator(`#${id}`);
  const found = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  if (!found) {
    record(false, `the ${what} editor draws its prompt (${path})`);
    continue;
  }
  await box.fill(LONG);
  const drawn = await box.evaluate((area) => {
    const wrap = area.parentElement.getBoundingClientRect();
    const own = area.getBoundingClientRect();
    const field = area.closest('[class*="field"]');
    const next = field?.nextElementSibling?.getBoundingClientRect();
    return { inside: Math.round(wrap.bottom - own.bottom), clear: next ? Math.round(next.top - wrap.bottom) : null };
  });
  record(drawn.inside >= 0, `${what}: the prompt ends inside its box (${drawn.inside}px to spare)`);
  record(drawn.clear === null || drawn.clear >= 0, `${what}: the box ends above the next field (${drawn.clear}px)`);
}

await finish(browser);
