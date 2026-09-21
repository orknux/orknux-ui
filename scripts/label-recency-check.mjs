/**
 * The labels offered under the label box are the ones lately used, first.
 *
 * Issue #346. The box offers six, and a workspace has more than six labels the
 * moment anybody is using it seriously - so the order is the whole of whether
 * the label somebody is reaching for is on the screen at all. Alphabetical put
 * a milestone everybody was tagging that week behind five labels last touched
 * in March, and the one thing the box exists to save was typing it out.
 *
 * Driven against two labels chosen so the two orders disagree: `aaa` is used
 * first and `zzz` second, so recency says zzz then aaa and the alphabet says
 * the opposite. A check where both orders agree proves nothing.
 *
 * The suggestions are read off a new issue's form rather than an existing
 * one's, because that is the form where the box is empty and offers the top of
 * the list rather than whatever a draft narrows it to.
 *
 * Files two issues and deletes them, and sweeps what an earlier killed run
 * left.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const MARK = 'labelRecencyCheck';

/*
 * Named so the alphabet and the clock disagree. `EARLY` is put on an issue
 * first and sorts first; `LATE` is put on second and sorts last. Both are
 * prefixed so the sweep can find every issue this check has ever left behind.
 */
const EARLY = `${MARK}-aaa`;
const LATE = `${MARK}-zzz`;

const LIST = `query($id: ID!, $q: String) {
  workspaceIssues(workspaceId: $id, page: 0, size: 100, search: $q) { content { id number title } }
}`;

const held = async () => {
  const found = await graphql(LIST, { id: WORKSPACE, q: MARK });
  return found.workspaceIssues.content.filter((one) => one.title.startsWith(MARK));
};

const sweep = async () => {
  for (const old of await held()) {
    await graphql(`mutation($id: ID!) { deleteIssue(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept ${old.title} (#${old.number})`);
  }
};

const file = async (title, label) => {
  const made = await graphql(`mutation($input: IssueInput!) { createIssue(input: $input) { id number title } }`, {
    input: {
      workspaceId: WORKSPACE,
      title: `${MARK} ${title}`,
      description: 'Filed by the check that reads which labels are offered first.',
      labels: [label],
      status: 'OPEN',
    },
  });
  console.log(`made ${made.createIssue.title} (#${made.createIssue.number}) carrying ${label}`);
};

await sweep();

await file('the earlier label', EARLY);
/*
 * A moment between them, because what is being measured is which of the two
 * was used last. Two saves inside one clock tick are two rows the database has
 * no reason to order the way this check means them - the server breaks that tie
 * by the row id, and this makes sure the check is not the only thing relying
 * on it.
 */
await page.waitForTimeout(1200);
await file('the later label', LATE);

/* ------------------------------------------------------------ what is offered */

await page.goto(`${BASE}/workspace/${WORKSPACE}/issues/new`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the new issue form'), 'the form for a new issue is on screen');

const box = page.locator('input[aria-label="Add a label"]');
await box.waitFor({ timeout: 20_000 });

/*
 * Waited for rather than slept past. The box is drawn from the issue, and what
 * goes under it from a second answer that lands a second or so later - a fixed
 * pause landed between the two and read an empty list as an order.
 */
const suggestions = page.locator('button[class*="_labelSuggestion_"]');
await suggestions.first().waitFor({ timeout: 20_000 });

const offered = (await suggestions.allInnerTexts())
  .map((one) => one.replace(/^\+\s*/, '').trim());
console.log(`offered: ${offered.join(', ') || '(nothing)'}`);

const late = offered.indexOf(LATE);
const early = offered.indexOf(EARLY);

record(late === 0, `the label used last is offered first (${LATE} at ${late})`);
record(early > late && early !== -1, `the one before it comes next (${EARLY} at ${early})`);

/*
 * The whole point of the order: the box offers six, and both of these are
 * within them. Under the alphabet neither was - they sort among every label
 * this workspace has ever carried, and a workspace in use has more than six.
 */
record(offered.length <= 6, `no more than six are offered at once (${offered.length})`);

/* ------------------------------------------------ and typing still narrows it */

await box.fill(EARLY.slice(0, MARK.length + 2));
await page.waitForTimeout(600);
const narrowed = (await suggestions.allInnerTexts())
  .map((one) => one.replace(/^\+\s*/, '').trim());
record(
  narrowed.includes(EARLY) && !narrowed.includes(LATE),
  `typing narrows the list to what matches (${narrowed.join(', ') || '(nothing)'})`,
);

/* ------------------------------------------------------------------- tidy up */

await sweep();

await finish(browser);
