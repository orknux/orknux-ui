/**
 * The plumbing every check in this folder had a copy of.
 *
 * Thirty scripts opened a browser, posted to /api/session as alice, kept a
 * `results` array, printed PASS/FAIL and exited 0 or 1 - each in its own
 * slightly different words, and each with its own idea of where a screenshot
 * goes. None of that is the value of a check; the assertions are. So the
 * assertions stayed exactly where they were written and only this moved.
 *
 * What a check now says at the top:
 *
 *   import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';
 *   const { browser, page } = await open();
 *
 * and at the bottom:
 *
 *   await finish(browser);            // pass if everything recorded passed
 *   await finish(browser, a, b);      // ...and if these are true as well
 *
 * `finish` is the only exit. It closes the browser first, so a check that fails
 * does not leave a chromium behind for the runner to wait on, and it prints one
 * summary line the runner reads back.
 *
 * And `drawn(page, name)`, for the other half of the same problem: a check that
 * reads a page which has not arrived is a check that asserts things about an
 * empty screen. See its own note below.
 */
import { mkdirSync } from 'node:fs';
import { basename } from 'node:path';
import { chromium } from 'playwright';

export { chromium };

/**
 * Where the interface is. In development that is the vite server, which proxies
 * /api and /graphql to the server on 8080 so the session cookie stays
 * first-party. In CI it is the all-in-one image, which serves both on one port
 * itself - which is why every check speaks to one origin and never two.
 */
export const BASE = process.env.ORKNUX_UI_URL ?? 'http://localhost:5173';

/**
 * Who signs in. Overridable because the seed can be told to build its fixture
 * under another account, and because CI's administrator is not called alice.
 */
export const USER = process.env.ORKNUX_USER ?? 'alice';
export const PASSWORD = process.env.ORKNUX_PASSWORD ?? 'password';

/**
 * The fixture the checks are written against. These are ids rather than names
 * because that is what a route needs, and they are variables rather than
 * constants because a database built from nothing does not hand out the same
 * ones a developer's has. `scripts/suite/seed-fixture.mjs` prints the values to
 * set; the defaults are the developer database this was all written on.
 */
export const WORKSPACE = process.env.ORKNUX_WORKSPACE ?? '9';
export const WORKFLOW = process.env.ORKNUX_WORKFLOW ?? '9';

/**
 * Where pictures go.
 *
 * They used to land in the working directory, which is the repository root, so
 * running the checks left eight untracked PNGs beside package.json. One folder,
 * ignored by git, and the runner can hand the whole of it to CI as an artifact.
 */
export const SHOT_DIR = process.env.ORKNUX_SHOT_DIR ?? 'scripts/suite/shots';

/** A path under SHOT_DIR, making the folder on the way. */
export function shot(name) {
  mkdirSync(SHOT_DIR, { recursive: true });
  return `${SHOT_DIR}/${basename(name)}`;
}

/**
 * A browser, a page, and a session.
 *
 * Sign-in is a POST rather than the sign-in form on purpose: what these checks
 * are about is what happens after, and driving the form thirty times over would
 * be thirty chances to fail for a reason none of them is testing. The one check
 * that is about signing in should drive the form.
 *
 * The cookie is set on the context, so `context.request` and the page share the
 * session - which is what lets a check set its own fixture up over GraphQL and
 * then look at it in the browser.
 */
export async function signIn(context) {
  const signedIn = await context.request.post(`${BASE}/api/session`, {
    data: { username: USER, password: PASSWORD },
  });
  if (!signedIn.ok()) {
    console.error(`FAIL: could not sign in as ${USER} at ${BASE}: ${signedIn.status()}`);
    await context.browser()?.close().catch(() => {});
    process.exit(1);
  }
  return context;
}

export async function open(options = {}) {
  const { viewport = { width: 1440, height: 900 }, launch = {}, context: contextOptions = {} } = options;
  /*
   * A base that is not localhost is an insecure origin to Chromium, and an
   * insecure origin gets no microphone and no `isSecureContext` - so a voice
   * check pointed at `host.docker.internal` reports the product as offering no
   * microphone. There is no launch flag that mends it headless (the one that
   * exists needs a persistent profile), and a name under `.localhost` is no
   * use either, because Chromium sends those to loopback whatever /etc/hosts
   * says. What works is reaching the server as localhost, through
   * `forward.mjs` when it is on the host - see run.mjs's header.
   */
  const browser = await chromium.launch(launch);
  /*
   * The browser starts out remembering the fixture's workspace.
   *
   * The chat names no workspace in its address: `/chat` opens the one the
   * browser last looked at (`orknux.lastWorkspace`), and a fresh context has
   * none, so it fell through to the first workspace in the list. On the
   * developer's database that happened to be one with chats and agents; on
   * CI's it is the workspace a fresh installation makes for itself since the
   * server's d27a1f84 - no agent, no chat, so no composer - and every check
   * that opened `/chat` waited twenty seconds for one and failed. Set once, as
   * stored state rather than a script run on every load, so a check that
   * switches workspace is remembered switching it like anybody else.
   */
  const context = await browser.newContext({
    viewport,
    storageState: {
      cookies: [],
      origins: [{ origin: new URL(BASE).origin, localStorage: [{ name: 'orknux.lastWorkspace', value: WORKSPACE }] }],
    },
    ...contextOptions,
  });
  const page = await context.newPage();
  await signIn(context);

  /**
   * One GraphQL call as this session. Throws on errors rather than returning
   * them: a check whose fixture half-built is a check that fails for the wrong
   * reason, and the stack says where.
   */
  const graphql = async (query, variables = {}) => {
    /*
     * One retry, and only on a dropped socket.
     *
     * Two workers is enough to make the vite proxy in front of the server reset
     * a connection now and again - `read ECONNRESET`, on a request that never
     * reached anything. It killed a check outright, twice, with nothing wrong
     * in what it was asking.
     *
     * Deliberately narrow: a GraphQL *error* still throws on the first answer,
     * as it always has, because a fixture that half-built must fail loudly. A
     * socket that was never answered is not an answer to retry past - it is a
     * question that was never asked.
     */
    let answer = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        answer = await context.request.post(`${BASE}/graphql`, { data: { query, variables } });
        break;
      } catch (dropped) {
        const why = dropped instanceof Error ? dropped.message : String(dropped);
        if (attempt === 1 || !/ECONNRESET|socket hang up|ECONNREFUSED/.test(why)) throw dropped;
        console.log(`the connection was dropped, asking again: ${why.split(String.fromCharCode(10))[0]}`);
      }
    }
    const body = await answer.json();
    if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
    return body.data;
  };

  return { browser, context, page, graphql };
}

/** Everything recorded so far, in the order it was recorded. */
const results = [];

/**
 * One assertion, in the form most of these checks were already written in.
 * Prints it and remembers it.
 */
export function record(ok, message) {
  results.push(Boolean(ok));
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${message}`);
  return Boolean(ok);
}

/**
 * The same thing in the other form some of them used, where the sentence to
 * print differs between passing and failing.
 */
export function check(ok, pass, fail) {
  return record(ok, ok ? pass : fail);
}

/** How many recorded assertions failed. For a check that prints its own tally. */
export function failures() {
  return results.filter((ok) => !ok).length;
}

/**
 * Wait until a page has actually drawn something, and fail by name if it never
 * does.
 *
 * This is the shape that produced most of this suite's false alarms. A check
 * navigates, sleeps a fixed second and a half, and reads the page - and the
 * loader deliberately draws nothing for its first three seconds, so a page that
 * was merely slow is an *empty* page. Every assertion of the form "X is no
 * longer printed under a field" then passes on a blank screen, and the only
 * thing left to complain about is a missing control, which reads exactly like
 * prose deleted and never replaced. It sent somebody looking for a deletion
 * that was never made, twice.
 *
 * So: wait on the page rather than on the clock, and when nothing arrives, say
 * *that* - with what the page did hold, because a settings page asked for a
 * thing that is not there answers with a short card saying so, and a bare "drew
 * nothing" cannot tell that from a page that failed to render.
 *
 * **And wait for it to stop.** "Has drawn something" was the wrong question and
 * cost a day of chasing findings that were not there. Every page in this
 * product is drawn in two parts - the shell, which is text on screen in a
 * frame, and then the thing the page is about, which arrives when the server
 * answers. Asking only whether there was *any* text meant this returned on the
 * navigation down the side, and eight checks then measured a page that had not
 * loaded yet:
 *
 *   "10 per page draws 10 rows (drew 0)"        the rows had not arrived
 *   "the settings page has a Component history  the section had not arrived
 *    section"
 *   "the button is on Gemma 31B"                the model rows had not arrived
 *   "with chat on, the workspace offers chat's  `main` held 155 characters for
 *    own settings"                              the first three seconds
 *
 * Every one of those reads as the product having lost something. So a page is
 * drawn when its text is the same twice running, [still] apart - which is cheap,
 * needs no check to know what it is waiting for by name, and is exactly the
 * difference between "something is on screen" and "this is the answer".
 *
 * [still]`: 0` waives that for a page that is genuinely never still. Nothing
 * needs it today; it is here so that the one that does can say so out loud
 * rather than going back to the old behaviour for everybody.
 *
 * Returns true when the page drew, false when it did not - having already
 * recorded the failure, so the caller's job is only to stop reading.
 *
 *   if (!(await drawn(page, 'admin settings'))) continue;
 */
/**
 * Waits for the workflow editor to have saved what was just done to it.
 *
 * The editor has no Save button (issue #645): a change is sent a moment after
 * it stops, and the toolbar's `save-state` says `saving`, then `saved` - or
 * `failed`, with the server's reason beside the name. The change is given a
 * moment to be seen first, because straight after a click the editor may not
 * have drawn it yet and still says `saved` about the graph before it.
 *
 * @returns what it settled on: 'saved' or 'failed', or null if it never did.
 */
export async function autosaved(page, { within = 15_000 } = {}) {
  await page
    .waitForFunction(() => document.querySelector('[data-testid="save-state"]')?.getAttribute('data-state') !== 'saved', null, { timeout: 2_000 })
    .catch(() => undefined);
  return page
    .waitForFunction(
      () => {
        const state = document.querySelector('[data-testid="save-state"]')?.getAttribute('data-state');
        return state === 'saved' || state === 'failed' ? state : null;
      },
      null,
      { timeout: within },
    )
    .then((handle) => handle.jsonValue())
    .catch(() => null);
}

export async function drawn(page, name, options = {}) {
  const { within = 20_000, atLeast = 1, where = 'body', still = 400 } = options;
  const upTo = Date.now() + within;
  let held = '';
  let before = null;
  let moved = false;
  for (;;) {
    held = await page.evaluate((selector) => document.querySelector(selector)?.innerText ?? '', where);
    // A [role="status"] is the loading mark; while one is on screen the page is
    // still deciding what it holds, and what it holds now is not an answer.
    const loading = (await page.locator('[role="status"]').count()) > 0;
    const settled = still === 0 || (before !== null && held === before);
    if (held.trim().length >= atLeast && !loading && settled) return true;
    if (before !== null && held !== before) moved = true;
    before = held;
    if (Date.now() >= upTo) break;
    await page.waitForTimeout(still === 0 ? 250 : still);
  }
  return record(
    false,
    moved
      ? `${name}: the page was still changing ${within / 1000}s after it was opened, so nothing read off it is ` +
        `what it will settle on. <${where}> holds: ${JSON.stringify(held.replace(/\s+/g, ' ').slice(0, 200))}`
      : `${name}: the page drew ${held.trim().length} characters in ${within / 1000}s and settled on none of it, ` +
        `so nothing read off it means a thing. <${where}> holds: ${JSON.stringify(held.replace(/\s+/g, ' ').slice(0, 200))}`,
  );
}

/**
 * Click a node on the canvas and be sure it is the selected one.
 *
 * React Flow puts its nodes down and then measures them, and a click that lands
 * in between selects nothing at all. Waiting afterwards cannot mend a press
 * that already missed - the page is settled by then and no node is chosen - so
 * the press itself is what has to be repeated. Two checks lost half an hour to
 * this and reported it as the editor dropping a node's ports and an agent node
 * having no handles.
 *
 * Returns true when something is selected; records the failure and returns
 * false when nothing ever is, so the caller can stop rather than read a canvas
 * with no selection on it.
 */
/** The workspace menu in the top bar: the button that names the workspace one is in. */
export const WORKSPACE_MENU = 'button[aria-label="Selected workspace"]';

/** Moves to another workspace through the top bar's menu, the way a person does. */
export async function pickWorkspace(page, id) {
  await page.locator(WORKSPACE_MENU).click();
  await page.locator(`[role="option"][data-workspace-id="${id}"]`).click();
}

/** Which workspace the top bar says one is in, by id. */
export async function workspaceShown(page) {
  return page.locator(WORKSPACE_MENU).getAttribute('data-workspace-id');
}

/** The names the workspace menu offers, read with it open and closed again after. */
export async function workspacesOffered(page) {
  await page.locator(WORKSPACE_MENU).click();
  const options = page.locator('[role="option"][data-workspace-id]');
  await options.first().waitFor({ timeout: 5000 });
  const names = await options.evaluateAll((all) => all.map((one) => one.querySelector('[data-workspace-name]')?.textContent.trim() ?? ''));
  await page.keyboard.press('Escape');
  await options.first().waitFor({ state: 'detached', timeout: 5000 });
  return names;
}

/**
 * Opens the image editor's AI menu - Upscale, Clean up, Harmonize, Convert to
 * video - unless it is open already, so a check can find those items by their
 * test ids. Waits for the editor's toolbar first, since the button is drawn
 * with the page.
 */
export async function openPictureMenu(page) {
  const menu = page.getByTestId('editor-ai-menu');
  if (await menu.isVisible().catch(() => false)) return true;
  await page.getByTestId('editor-ai').click({ timeout: 10_000 }).catch(() => {});
  return menu.waitFor({ state: 'visible', timeout: 3_000 }).then(() => true).catch(() => false);
}

export async function selectNode(page, node, name = 'the node') {
  await node.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  for (let press = 0; press < 5; press += 1) {
    await node.click({ timeout: 10_000 }).catch(() => {});
    const took = await page
      .locator('.react-flow__node.selected')
      .first()
      .waitFor({ state: 'visible', timeout: 4_000 })
      .then(() => true)
      .catch(() => false);
    if (took) return true;
  }
  return record(false, `${name}: five presses and nothing on the canvas is selected`);
}

/**
 * Close the browser, say what happened, and exit.
 *
 * Extra booleans are for the checks that computed their verdict in local
 * variables rather than through `record`; they are ANDed with everything
 * recorded. A check that recorded nothing and passes nothing here fails, on
 * purpose: a suite whose tests can silently assert nothing is the suite we
 * already had.
 */
export async function finish(browser, ...extras) {
  await browser?.close().catch(() => {});

  const recorded = results.every(Boolean);
  const extra = extras.every(Boolean);
  const asserted = results.length + extras.length;

  if (asserted === 0) {
    console.log('FAIL: this check asserted nothing');
    process.exit(1);
  }

  const passed = recorded && extra;
  const failed = results.filter((ok) => !ok).length + extras.filter((ok) => !ok).length;
  console.log(passed ? `ALL PASS (${asserted} checks)` : `SOME FAILED (${failed} of ${asserted})`);
  process.exit(passed ? 0 : 1);
}

/**
 * What is on the browser's clipboard. Issue #589.
 *
 * Read from a page of its own at http://localhost, which Chromium counts as a
 * secure origin and so lets read the clipboard once the permission is granted -
 * the page under test may well be the plain-http origin that cannot. The page
 * is answered by a route rather than a server, so this needs nothing listening.
 */
export async function clipboardText(context) {
  return onClipboardPage(context, (reader) => reader.evaluate(() => navigator.clipboard.readText()));
}

/** Puts something on the clipboard first, so a copy that did nothing cannot pass on what was left there. */
export async function setClipboardText(context, text) {
  return onClipboardPage(context, (reader) => reader.evaluate((value) => navigator.clipboard.writeText(value), text));
}

async function onClipboardPage(context, act) {
  const origin = 'http://localhost';
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  const reader = await context.newPage();
  try {
    await reader.route(`${origin}/clipboard-reader`, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>clipboard</title><body></body>' }),
    );
    await reader.goto(`${origin}/clipboard-reader`);
    await reader.bringToFront();
    return await act(reader);
  } catch (cause) {
    return `(the clipboard could not be reached: ${cause instanceof Error ? cause.message : String(cause)})`;
  } finally {
    await reader.close();
  }
}

/**
 * Makes one page behave as a plain-http origin does to the clipboard: no
 * `navigator.clipboard`, and `isSecureContext` false. Issue #589.
 *
 * Where the suite already runs against such an origin - `host.docker.internal`
 * - this changes nothing; where it runs against localhost, as CI does, it is
 * what lets a check prove the fallback rather than the API every secure origin
 * has. Before the page's own scripts, so the interface never sees the API.
 */
export async function asPlainHttp(page) {
  await page.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'clipboard', { get: () => undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { get: () => false, configurable: true });
  });
}

/**
 * Picks a model in a model field - `ModelPicker`, the application's own list
 * rather than a native select, so `selectOption` has nothing to act on. `field`
 * is the trigger's selector or a locator for it; `value` is a model id, or ''
 * for the field's None row.
 */
export async function pickModel(page, field, value) {
  const trigger = typeof field === 'string' ? page.locator(field) : field;
  const id = await trigger.getAttribute('id');
  const menu = page.locator(`[data-model-menu="${id}"]`);
  if ((await menu.count()) === 0) await trigger.click();
  await menu.locator(`[role="option"][data-value="${value}"]`).click();
}

/**
 * The rows a model field offers, as `{ value, label }`, the None row included
 * with value ''. Opens the list, waits up to `within` for more than the None
 * row (the models arrive after the field is drawn), and closes it again.
 */
export async function modelsOffered(page, field, within = 15_000) {
  const trigger = typeof field === 'string' ? page.locator(field) : field;
  const id = await trigger.getAttribute('id');
  const menu = page.locator(`[data-model-menu="${id}"]`);
  await trigger.click();
  await menu.locator('[role="option"]').nth(1).waitFor({ timeout: within }).catch(() => undefined);
  const rows = await menu.locator('[role="option"]').evaluateAll((all) =>
    all.map((one) => ({ value: one.getAttribute('data-value') ?? '', label: (one.textContent ?? '').trim() })),
  );
  await page.keyboard.press('Escape');
  return rows;
}

/**
 * The application's own select - `Select`, which replaced every native one, so
 * `selectOption` and `inputValue` have nothing to act on. These are their
 * stand-ins.
 *
 * `field` is a selector or a locator for the control itself (its id,
 * data-testid and aria-label are on the button) or for anything around it, in
 * which case the one control inside is meant.
 */
export async function selectControl(page, field) {
  const located = typeof field === 'string' ? page.locator(field) : field;
  await located.first().waitFor({ state: 'attached', timeout: 10_000 }).catch(() => undefined);
  const isControl = await located
    .first()
    .evaluate((one) => one.matches('[role="combobox"][data-select]'))
    .catch(() => false);
  return isControl ? located.first() : located.locator('[role="combobox"][data-select]').first();
}

/** The open list of a control, opening it first if it is closed. */
async function openedList(page, control) {
  if ((await control.getAttribute('aria-expanded')) !== 'true') await control.click();
  const id = await control.getAttribute('aria-controls');
  const menu = page.locator(`[id="${id}"]`);
  await menu.waitFor({ timeout: 5000 });
  return menu;
}

/**
 * Picks a row, the way `selectOption` did: `wanted` is a value or a label -
 * the value first - or `{ value }` / `{ label }` to say which.
 */
export async function chooseOption(page, field, wanted, within = 10_000) {
  const control = await selectControl(page, field);
  const want = typeof wanted === 'object' && wanted !== null ? wanted : { value: String(wanted), label: String(wanted) };
  const upTo = Date.now() + within;
  // As selectOption did, wait for a row that has not arrived yet: the list is read again until it holds it.
  for (;;) {
    const menu = await openedList(page, control);
    let row = null;
    if (want.value !== undefined) {
      const byValue = menu.locator(`[role="option"][data-value=${JSON.stringify(String(want.value))}]`);
      if ((await byValue.count()) > 0) row = byValue.first();
    }
    if (row === null && want.label !== undefined) {
      const byLabel = menu.getByRole('option', { name: String(want.label), exact: true });
      if ((await byLabel.count()) > 0) row = byLabel.first();
    }
    if (row !== null) {
      await row.click();
      await menu.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
      return;
    }
    await control.focus().catch(() => undefined);
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
    if (Date.now() >= upTo) throw new Error(`no row ${JSON.stringify(wanted)} to choose in ${within / 1000}s`);
    await page.waitForTimeout(300);
  }
}

/** The value a control holds, as `inputValue` read a native select's. */
export async function chosenOption(page, field) {
  const control = await selectControl(page, field);
  return (await control.getAttribute('data-value')) ?? '';
}

/** The label a control shows for what it holds. */
export async function chosenLabel(page, field) {
  const control = await selectControl(page, field);
  return ((await control.locator('[data-select-label]').textContent()) ?? '').trim();
}

/** How many rows a control holds, read off the closed button. */
export async function optionCount(page, field) {
  const control = await selectControl(page, field);
  return Number((await control.getAttribute('data-option-count')) ?? 0);
}

/** Waits, without opening it, until a control holds at least `atLeast` rows; true when it did. */
export async function optionsArrived(page, field, atLeast = 1, within = 20_000) {
  const upTo = Date.now() + within;
  for (;;) {
    if ((await optionCount(page, field).catch(() => 0)) >= atLeast) return true;
    if (Date.now() >= upTo) return false;
    await page.waitForTimeout(200);
  }
}

/** Every row a control offers - `{ value, label, disabled, group }` - read with it open and closed again after. */
export async function optionsOffered(page, field) {
  const control = await selectControl(page, field);
  const menu = await openedList(page, control);
  const rows = await menu.locator('[role="option"]').evaluateAll((all) =>
    all.map((one) => ({
      value: one.getAttribute('data-value') ?? '',
      label: (one.textContent ?? '').trim(),
      disabled: one.getAttribute('aria-disabled') === 'true',
      group: one.getAttribute('data-group'),
    })),
  );
  await control.focus().catch(() => undefined);
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
  return rows;
}
