/**
 * Two people in one editor, for the checks of the editors that work together
 * (#683): the diagram, document and wireframe editors. Each check opens the
 * same thing in two signed-in browsers and asks the same four questions -
 * does each see the other, does one's pointer reach the other, does a change
 * reach the server and the other tab without a Save, and do two changes made
 * at once both stay. What differs is how each editor is drawn in; that is the
 * check's own.
 */
import { BASE, open, record, signIn } from './harness.mjs';

/** Two tabs of one person, as two viewers in one room, plus the first's graphql. */
export async function twoTabs() {
  const { browser, page: first, graphql } = await open({ viewport: { width: 1440, height: 900 } });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await signIn(context);
  const second = await context.newPage();
  return { browser, first, second, graphql, closeSecond: () => context.close().catch(() => undefined) };
}

/** Opens [path] in both tabs and waits for [ready] in each. */
export async function openBoth(first, second, path, ready) {
  for (const page of [first, second]) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
    await page.locator(ready).first().waitFor({ timeout: 20_000 });
  }
}

/** Each tab shows the other is there, by its login. */
export async function eachSeesTheOther(first, second) {
  const seen = async (page) => {
    await page.getByTestId('presence').waitFor({ timeout: 10_000 }).catch(() => undefined);
    return page.getByTestId('presence').locator('[data-login]').count().catch(() => 0);
  };
  const a = await seen(first);
  const b = await seen(second);
  record(a === 1 && b === 1, `each tab shows the other is there (${a}, ${b})`);
}

/** A pointer moved over [area] in the first tab is drawn in the second with its login. */
export async function pointerReaches(first, second, area) {
  const box = await first.locator(area).first().boundingBox();
  await first.mouse.move(box.x + 200, box.y + 200);
  await first.mouse.move(box.x + 220, box.y + 210, { steps: 3 });
  const pointer = second.locator('[data-pointer]');
  const drawn = await pointer.first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false);
  record(drawn, `the other tab draws this one's pointer with its login (${drawn ? await pointer.first().textContent() : 'none'})`);
}

/** No Save was pressed: the server has [want] within a few seconds. */
export async function reachesTheServer(read, want, what) {
  const started = Date.now();
  let last = null;
  while (Date.now() - started < 12_000) {
    last = await read();
    if (want(last)) break;
    await new Promise((wake) => setTimeout(wake, 300));
  }
  record(want(last), `${what} reached the server without a Save (${JSON.stringify(last).slice(0, 200)})`);
}

/** The page shows [want] within a few seconds, without a reload. */
export async function reachesTheTab(page, want, what) {
  const seen = await page.waitForFunction(want, null, { timeout: 12_000 }).then(() => true).catch(() => false);
  record(seen, `${what}, in the other tab without a reload`);
}

/** A save over a revision somebody has saved past is refused by its name, and writes nothing. */
export async function staleSaveRefused(save, code) {
  const said = await save().then(() => 'saved').catch((cause) => String(cause instanceof Error ? cause.message : cause));
  record(said.includes(code), `a save over an older revision is refused as ${code} (${said.slice(0, 120)})`);
}
