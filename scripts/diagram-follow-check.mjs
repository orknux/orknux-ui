/**
 * Going to somebody in a diagram, following them, and seeing them go away.
 *
 * A click on another person's avatar moves this tab's canvas to where their
 * pointer is. A double click follows them: an eye is drawn on their avatar,
 * and their pointer is kept in the middle of this tab as they move it. Moving
 * the canvas by hand stops following. A tab out of sight long enough is shown
 * to the others faded, as away, and solid again once it is looked at; a tab
 * closed is gone from the others' avatars. Away, a tab lets go of its live
 * stream, so many tabs open do not use up the browser's six connections.
 *
 * Measured off where the other person's pointer is drawn in this tab.
 */
import { WORKSPACE, record, finish } from './suite/harness.mjs';
import { openBoth, twoTabs } from './suite/live-room.mjs';

const { browser, first, second, graphql, closeSecond } = await twoTabs();

const drawn = JSON.stringify({
  nodes: [
    { id: 'left', kind: 'box', label: 'Far left', x: 0, y: 0, w: 160, h: 60 },
    { id: 'right', kind: 'box', label: 'Far right', x: 2400, y: 1400, w: 160, h: 60 },
  ],
  edges: [],
});
const { createDiagram } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzFollow ${Date.now()}`, d: drawn },
);
const id = createDiagram.id;

/** How far the other person's pointer is drawn from the middle of this tab's canvas. */
async function offCentre(page) {
  const pane = await page.locator('.react-flow__pane').boundingBox();
  const pointer = page.locator('[data-pointer]').first();
  if ((await pointer.count()) === 0) return Infinity;
  const at = await pointer.boundingBox();
  if (at === null) return Infinity;
  return Math.hypot(at.x - (pane.x + pane.width / 2), at.y - (pane.y + pane.height / 2));
}

/** Waits until [want] of [read]'s answer, or a few seconds; returns the last answer. */
async function until(read, want, ms = 6000) {
  const started = Date.now();
  let last = await read();
  while (!want(last) && Date.now() - started < ms) {
    await new Promise((wake) => setTimeout(wake, 200));
    last = await read();
  }
  return last;
}

/** Points in [page]'s canvas at a fraction of its size. */
async function pointAt(page, fx, fy) {
  const pane = await page.locator('.react-flow__pane').boundingBox();
  await page.mouse.move(pane.x + pane.width * fx, pane.y + pane.height * fy, { steps: 5 });
  await page.mouse.move(pane.x + pane.width * fx + 4, pane.y + pane.height * fy + 3, { steps: 2 });
}

/** Pretends [page] is out of sight, or back in sight: a headless tab is always visible. */
const seen = (page, visible) =>
  page.evaluate((state) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, visible ? 'visible' : 'hidden');

// The other tab's live streams, as the browser sends and drops them.
const streams = { opened: 0, dropped: 0 };
second.on('request', (one) => {
  if (one.headers().accept === 'text/event-stream') streams.opened += 1;
});
// Dropped by the tab, or ended by the server when the tab said it was going away.
for (const ended of ['requestfailed', 'requestfinished']) {
  second.on(ended, (one) => {
    if (one.headers().accept === 'text/event-stream') streams.dropped += 1;
  });
}

try {
  await openBoth(first, second, `/workspace/${WORKSPACE}/explore/diagrams/${id}`, '.react-flow__node[data-id="right"]');
  const avatar = first.getByTestId('presence').locator('[data-login]').first();
  await avatar.waitFor({ timeout: 10_000 });

  // The other tab points into a corner: drawn here far from the middle.
  await pointAt(second, 0.06, 0.08);
  const away = await until(() => offCentre(first), (d) => Number.isFinite(d));
  record(Number.isFinite(away) && away > 200, `the other tab's pointer is drawn here, off the middle (${Math.round(away)} px)`);

  // One click: there - even when their pointer has since left the canvas, as it does whenever they reach for the toolbar.
  await second.mouse.move(5, 5, { steps: 3 });
  await first.waitForTimeout(600);
  const transform = () => first.locator('.react-flow__viewport').evaluate((one) => one.style.transform);
  const before = await transform();
  await avatar.click();
  const moved = await until(transform, (now) => now !== before);
  record(moved !== before, `a click on their avatar moves this canvas to where their pointer last was, off the canvas now (${before} -> ${moved})`);
  await pointAt(second, 0.06, 0.08);
  const jumped = await until(() => offCentre(first), (d) => d < 40);
  record(jumped < 40, `a click on their avatar moves this canvas to their pointer (${Math.round(jumped)} px from the middle)`);
  record((await first.getByTestId('presence-following').count()) === 0, 'and one click does not follow them');

  // A double click: followed, with an eye, wherever they go.
  await avatar.dblclick();
  await first.getByTestId('presence-following').waitFor({ timeout: 3000 }).catch(() => undefined);
  record((await first.getByTestId('presence-following').count()) === 1, 'a double click draws an eye on their avatar');
  record((await avatar.getAttribute('aria-pressed')) === 'true', 'and the avatar says it is following');
  await pointAt(second, 0.92, 0.9);
  const followed = await until(() => offCentre(first), (d) => d < 40);
  record(followed < 40, `as they move, their pointer is kept in the middle here (${Math.round(followed)} px)`);
  await pointAt(second, 0.1, 0.85);
  const again = await until(() => offCentre(first), (d) => d < 40);
  record(again < 40, `and again after they move once more (${Math.round(again)} px)`);

  // Moving the canvas by hand stops it.
  const pane = await first.locator('.react-flow__pane').boundingBox();
  await first.mouse.move(pane.x + pane.width / 2, pane.y + pane.height / 2);
  await first.mouse.wheel(0, 240);
  await first.waitForTimeout(400);
  record((await first.getByTestId('presence-following').count()) === 0, 'moving this canvas by hand stops following, and the eye goes');
  await pointAt(second, 0.9, 0.1);
  await first.waitForTimeout(1200);
  const left = await offCentre(first);
  record(left > 100, `and their pointer is no longer brought to the middle (${Math.round(left)} px)`);

  // Double click to follow, double click to stop.
  await avatar.dblclick();
  await first.getByTestId('presence-following').waitFor({ timeout: 3000 }).catch(() => undefined);
  await avatar.dblclick();
  await first.waitForTimeout(500);
  record((await first.getByTestId('presence-following').count()) === 0, 'a second double click stops following');

  // Out of sight for long enough: shown as away, then back.
  const active = () => first.getByTestId('presence').locator('[data-login]').first().getAttribute('data-active').catch(() => null);
  await seen(second, false);
  const faded = await until(active, (state) => state === 'false', 60_000);
  record(faded === 'false', 'a tab out of sight for long enough is shown to the other as away');
  const whileAway = await until(async () => ({ ...streams }), (now) => now.dropped > 0, 5000);
  record(whileAway.dropped > 0, `and it lets go of its live stream (${JSON.stringify(whileAway)})`);
  await second.waitForTimeout(3000);
  record(streams.opened === whileAway.opened, `and opens no other while it is away (${streams.opened} opened)`);
  await seen(second, true);
  const back = await until(active, (state) => state === 'true', 15_000);
  record(back === 'true', 'and as there again once it is looked at');
  record(streams.opened > whileAway.opened, `having taken its stream up again (${streams.opened} opened)`);

  // Closed: gone.
  await closeSecond();
  const count = () => first.getByTestId('presence').locator('[data-login]').count().catch(() => 0);
  const gone = await until(count, (n) => n === 0, 15_000);
  record(gone === 0, `a closed tab is gone from the avatars (${gone})`);
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  await closeSecond();
}

await finish(browser);
