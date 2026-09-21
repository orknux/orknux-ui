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

const started = await firstDrawn();
console.log(`drawn first, as opened: ${JSON.stringify(started)}`);

// Pressing the column the list is already in turns it round.
await nameHead.click();
await page.waitForTimeout(1500);
const turned = await firstDrawn();
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
await page.waitForTimeout(800);
const remembered = await firstDrawn();
console.log(`after a reload: ${JSON.stringify(remembered)}`);
record(remembered === turned, 'the order chosen is still theirs after a reload');

/* ---- a column with nothing stored behind it is not offered as one ---- */

record(
  (await page.locator('button', { hasText: /^Input Params/ }).count()) === 0,
  'a heading the database cannot order by is a heading, not a control that lies',
);

await finish(browser);
