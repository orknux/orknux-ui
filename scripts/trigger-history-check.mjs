/**
 * What a trigger has done is on the trigger's own page.
 *
 * Issue #357. The firing log existed and was only ever drawn on the triggers
 * list, under a row somebody had to expand. But the page people open when a
 * workflow did not run is the trigger's own - and the entries that answer *why*
 * are exactly the ones no run came of: an event a condition turned down, a
 * definition nothing instances. Those are recorded nowhere else, so finding them
 * meant going back to the list.
 *
 * Driven against a real firing rather than a stubbed one: a webhook trigger with
 * nothing pointed at it is called, which writes a `NO_INSTANCE` entry - the most
 * useful row the log has, and the one this page exists to surface.
 *
 * Makes a webhook trigger and removes it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const PREFIX = 'zzTriggerHistory';
const PATH = 'zz-trigger-history-check';

const sweep = async () => {
  const { workspaceTriggers } = await graphql(
    `query($w: ID!) { workspaceTriggers(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceTriggers.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept trigger ${old.name} (#${old.id})`);
  }

  const { workspaceObjects } = await graphql(
    `query($w: ID!) { workspaceObjects(workspaceId: $w, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceObjects.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteObject(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept object ${old.name} (#${old.id})`);
  }
};

await sweep();

/*
 * A webhook answers a shape, so one is made for it to answer. Its own, prefixed,
 * and swept with the trigger - a shape left behind would be the next run's
 * "name already taken".
 */
const shape = await graphql(`mutation($input: CreateObjectInput!) { createObject(input: $input) { id name } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: `${PREFIX}Shape`,
    properties: [{ name: 'from', kind: 'STRING' }],
  },
});
console.log(`made object ${shape.createObject.name} (#${shape.createObject.id})`);

const made = await graphql(`mutation($input: CreateTriggerInput!) { createTrigger(input: $input) { id name } }`, {
  input: {
    workspaceId: WORKSPACE,
    name: `${PREFIX} hook`,
    type: 'WEBHOOK',
    webhookPath: PATH,
    objectId: shape.createObject.id,
  },
});
const TRIGGER = made.createTrigger.id;
console.log(`made trigger ${made.createTrigger.name} (#${TRIGGER}) answering at /api/webhooks/${PATH}`);

const clean = async () => {
  await sweep();
  await finish(browser);
};

/*
 * Called once, with nothing instancing it. What the log gets is an entry saying
 * nothing instances it - which is the state somebody opens this page to
 * understand, and the one a green "enabled" badge says nothing about.
 */
const called = await page.request.post(`${BASE}/api/webhooks/${PATH}`, {
  data: { from: 'trigger-history-check' },
});
console.log(`called the webhook: ${called.status()}`);

/* -------------------------------------------------------------------- drive */

await page.goto(`${BASE}/workspace/${WORKSPACE}/triggers/${TRIGGER}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the trigger's page"), "the trigger's own page is on screen");

const shown = await page
  .locator('h2', { hasText: 'History' })
  .first()
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(shown, 'it has a History of its own, without going back to the list');
if (!shown) await clean();

/*
 * Waited for rather than slept past: the page is drawn from the trigger and the
 * log is a second answer that lands after it.
 */
const rows = page.locator('[class*="_logRow_"]');
await rows.first().waitFor({ timeout: 20_000 }).catch(() => undefined);

const said = await rows.allInnerTexts();
console.log(`log: ${JSON.stringify(said)}`);

record(said.length >= 1, `the call it was just sent is a row in it (${said.length})`);
record(
  said.some((one) => one.includes('Nothing instances it')),
  'and the row says what became of it, which is the thing recorded nowhere else',
);

/* ---- and it is still the same log the list opens, not a second one ---- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/triggers`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the triggers list'), 'the list still draws');

/* Narrowed to this check's trigger, so the row pressed is its row. */
await page.fill('input[placeholder="Search triggers..."]', PREFIX);
await page.waitForTimeout(1200);
/*
 * The Last fired cell, by its own class. Not `button[aria-expanded]`: a (?)
 * carries that attribute too, and the first one on the page is a hint.
 */
await page.locator('button[class*="_firedButton_"]').first().click();
await page.waitForTimeout(1500);
const onList = await page.locator('[class*="_logRow_"]').allInnerTexts();
console.log(`list log: ${JSON.stringify(onList)}`);
record(
  onList.some((one) => one.includes('Nothing instances it')),
  'the list opens the same rows it always did',
);

/* ------------------------------------------------------------------- tidy up */

await clean();
