/**
 * A table is put in the order of whichever column somebody presses.
 *
 * Issue #358. Two lists had a Sort control and the rest had none, which is the
 * same complaint that produced the per-page-size choice: something people
 * expected on every table existed on two of them.
 *
 * Driven on the actions list, which is the first table to get the shared
 * heading. What is measured is the part that goes wrong quietly: a heading that
 * looks pressable, reorders the twenty rows on screen, and leaves the other two
 * hundred where they were. So the assertion is against the *server's* answer -
 * the first row of page one under each order - and not against a reshuffle of
 * whatever was already drawn.
 *
 * Makes nothing and removes nothing: it reads the workspace's own actions.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/** What the server says the first row is, under one order. */
const firstFrom = async (order, ascending) => {
  const { workspaceActions } = await graphql(
    `query($w: ID!, $o: String, $a: Boolean) {
       workspaceActions(workspaceId: $w, page: 0, size: 1, order: $o, ascending: $a) {
         content { name type }
       }
     }`,
    { w: WORKSPACE, o: order, a: ascending },
  );
  return workspaceActions.content[0] ?? null;
};

/* ---- the server can be asked for an order at all ---- */

const byNameUp = await firstFrom('NAME', true);
const byNameDown = await firstFrom('NAME', false);
console.log(`name up: ${byNameUp?.name}; name down: ${byNameDown?.name}`);
record(
  byNameUp !== null && byNameDown !== null && byNameUp.name !== byNameDown.name,
  'the list can be asked for either direction, and the two disagree',
);

const byType = await firstFrom('TYPE', false);
console.log(`type down: ${JSON.stringify(byType)}`);
record(byType !== null, 'and for a column that is not the name');

/*
 * An order nobody can see falls back rather than failing: a table that refuses
 * to load over a stale stored order is worse than a table in its usual one.
 */
const nonsense = await firstFrom('WHATEVER', null);
record(
  nonsense?.name === byNameUp?.name,
  `an order the list does not have reads as its usual one (${nonsense?.name})`,
);

/* ---- and the heading is what asks ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/actions`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the actions list'), 'the actions list is on screen');

/**
 * The first row's name, as drawn.
 *
 * The name cell is the link to the action's page, which is the one cell that
 * carries the row's identity - the rest are badges and buttons.
 */
const firstDrawn = () => page.locator('a[class*="_nameLink_"]').first().innerText().then((text) => text.trim());

const nameHead = page.locator('button', { hasText: /^Name/ }).first();
await nameHead.waitFor({ timeout: 20_000 });

/*
 * Waited for, not slept past, on both sides of the press.
 *
 * The heading is drawn from the page and the rows from an answer that lands
 * after it, so a press timed by a fixed pause can land on a list that is still
 * arriving - and the reorder it asks for is then overwritten by the load it
 * interrupted. Pressing once the first row exists, and reading once the row has
 * actually changed, is the difference between measuring this and measuring the
 * machine's mood.
 */
const rowsDrawn = async () => {
  await page.locator('a[class*="_nameLink_"]').first().waitFor({ timeout: 20_000 });
  return firstDrawn();
};

/** The first row once it is something other than [was], or after ten seconds. */
const changedFrom = async (was) => {
  const until = Date.now() + 10_000;
  for (;;) {
    const now = await firstDrawn().catch(() => was);
    if (now !== was || Date.now() > until) return now;
    await page.waitForTimeout(250);
  }
};

const started = await rowsDrawn();
console.log(`drawn first, as opened: ${JSON.stringify(started)}`);

// Pressing the column the list is already in turns it round.
await nameHead.click();
const turned = await changedFrom(started);
console.log(`after pressing Name: ${JSON.stringify(turned)}`);

record(turned !== started, 'pressing the column the list is in turns it round');
record(
  turned === byNameDown?.name,
  `and what it shows is the server's answer rather than a reshuffle of the page (${JSON.stringify(turned)})`,
);

/* ---- the order somebody chose is theirs when they come back ---- */

await page.reload({ waitUntil: 'domcontentloaded' });
await drawn(page, 'the actions list again');
await nameHead.waitFor({ timeout: 20_000 });
const remembered = await rowsDrawn();
console.log(`after a reload: ${JSON.stringify(remembered)}`);
record(remembered === turned, 'the order chosen is still theirs after a reload');

/* ---- a column with nothing stored behind it is not offered as one ---- */

record(
  (await page.locator('button', { hasText: /^Input Params/ }).count()) === 0,
  'a heading the database cannot order by is a heading, not a control that lies',
);

/* ---- and the same heading, on every table that has grown one ---- */

/*
 * One press per list, against the server's answer for that order. Table-driven
 * rather than a check per list, so the next list to grow a sortable heading is a
 * row here rather than a file of its own - and a break in the shared heading or
 * the shared hook fails once for every list it broke.
 *
 * `query` is the list's field and `column` a heading it now offers. Each is
 * pressed twice: once to take the column, once to turn it round, which is the
 * state the server is then asked to agree with.
 */
const LISTS = [
  { path: 'conditions', query: 'workspaceConditions', column: 'Type', order: 'TYPE' },
  { path: 'agents', query: 'workspaceAgents', column: 'Description', order: 'DESCRIPTION' },
  { path: 'objects', query: 'workspaceObjects', column: 'Description', order: 'DESCRIPTION' },
  { path: 'functions', query: 'workspaceFunctions', column: 'Return Type', order: 'RETURN_TYPE' },
  { path: 'triggers', query: 'workspaceTriggers', column: 'Type', order: 'TYPE' },
];

/** The first row's first cell, which every one of these lists draws as a link. */
const firstRow = () =>
  page.locator('[class*="_row_"] a').first().innerText().then((text) => text.trim().split(String.fromCharCode(10))[0]);

/** The first row of one of those lists, once it is something other than [was]. */
const changedRow = async (was) => {
  const until = Date.now() + 10_000;
  for (;;) {
    const now = await firstRow().catch(() => was);
    if (now !== was || Date.now() > until) return now;
    await page.waitForTimeout(250);
  }
};

for (const list of LISTS) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${list.path}`, { waitUntil: 'domcontentloaded' });
  if (!(await drawn(page, list.path))) {
    record(false, `${list.path}: the list is on screen`);
    continue;
  }

  const head = page.locator('button', { hasText: new RegExp(`^${list.column}`) }).first();
  const pressable = await head
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(pressable, `${list.path}: ${list.column} is a heading that can be pressed`);
  if (!pressable) continue;

  // Taken, then turned round: two presses leave it descending, which is an
  // order nothing on this page starts in. Each press waits for the rows to move
  // rather than for a fixed pause; see the note on the actions list above.
  const before = await firstRow();
  await head.click();
  const took = await changedRow(before);
  await head.click();
  const drew = await changedRow(took);
  const { [list.query]: answered } = await graphql(
    `query($w: ID!, $o: String, $a: Boolean) {
       ${list.query}(workspaceId: $w, page: 0, size: 1, order: $o, ascending: $a) { content { name } }
     }`,
    { w: WORKSPACE, o: list.order, a: false },
  );
  const wanted = answered.content[0]?.name ?? null;
  console.log(`${list.path}: drew ${JSON.stringify(drew)}, server says ${JSON.stringify(wanted)}`);
  /*
   * Starts with, not equals: some of these lists put a badge inside the name
   * cell - which plugin brought a function, what kind of thing a row is - so the
   * cell's text is the name and then something about it.
   */
  record(
    wanted !== null && drew.startsWith(wanted),
    `${list.path}: ordered by ${list.column} it draws what the server ordered, not a reshuffled page`,
  );

  const sorted = await page
    .locator(`[aria-sort="descending"]`)
    .count()
    .then((held) => held === 1);
  record(sorted, `${list.path}: exactly one heading says which order the list is in`);
}

/* ---- the runs and the tasks, which are lists of events rather than of names ---- */

/*
 * Read off the row, because neither of these draws a link in the cell a heading
 * orders by: a run's first cell is its number and a task's is its title.
 */
const firstCell = async () => {
  const said = await page.locator('[class*="_row_"]').allInnerTexts();
  return said.map((one) => one.trim()).filter((one) => one !== '')[0]?.split(String.fromCharCode(10))[0] ?? '';
};

for (const list of [
  { path: 'executions', column: 'Workflow' },
  { path: 'tasks', column: 'Task' },
]) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/${list.path}`, { waitUntil: 'domcontentloaded' });
  if (!(await drawn(page, list.path))) {
    record(false, `${list.path}: the list is on screen`);
    continue;
  }

  const head = page.locator('button', { hasText: new RegExp(`^${list.column}`) }).first();
  const pressable = await head
    .waitFor({ timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  record(pressable, `${list.path}: ${list.column} is a heading that can be pressed`);
  if (!pressable) continue;

  const was = await firstCell();
  await head.click();
  const until = Date.now() + 10_000;
  let now = was;
  while (now === was && Date.now() < until) {
    await page.waitForTimeout(250);
    now = await firstCell().catch(() => was);
  }
  console.log(`${list.path}: ${JSON.stringify(was)} then ${JSON.stringify(now)}`);
  record(now !== was, `${list.path}: pressing ${list.column} reorders the rows`);
  record(
    (await page.locator('[aria-sort="ascending"], [aria-sort="descending"]').count()) === 1,
    `${list.path}: exactly one heading says which order the list is in`,
  );
}

/* ---- the tools list, which cuts two origins into one page itself ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/tools`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the tools list'), 'the tools list is on screen');

const toolHead = page.locator('button', { hasText: /^Name/ }).first();
await toolHead.waitFor({ timeout: 20_000 });
/*
 * Read off the row rather than out of a link: this table draws two origins, and
 * a plugin's tool is a span with a badge beside it because there is no page of
 * its own to link to. So the row's own first line is the only cell both kinds
 * have.
 */
const toolName = async () => {
  const said = await page.locator('[class*="_row_"]').allInnerTexts();
  return said.map((one) => one.trim()).filter((one) => one !== '')[0]?.split(String.fromCharCode(10))[0] ?? '';
};

const toolsWere = await toolName();
await toolHead.click();
await page.waitForTimeout(1500);
const toolsNow = await toolName();
console.log(`tools: ${JSON.stringify(toolsWere)} then ${JSON.stringify(toolsNow)}`);
/*
 * Asserted by the turn rather than against the server: this page asks for the
 * whole of the workspace's list and merges the plugins' tools into it, so the
 * server's first row is not the list's first row. What is being measured is
 * that the same press orders the rows the page cut for itself.
 */
record(toolsNow !== toolsWere, 'tools: the heading orders the rows this page cut for itself');

await finish(browser);
