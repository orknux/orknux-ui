/**
 * Issue statuses are the workspace's - issue #428.
 *
 * Three pages read one list, and this walks all three against a status the
 * check adds itself: the settings card lists it with its key and colour and
 * offers the controls the rules allow; the tracker's filter bar grows a tab for
 * it in the workspace's order; and the status button on an issue walks the
 * whole list, the new status included, and comes round to the start.
 *
 * Everything it makes it takes away again - the status and the issue it files
 * to walk - so the fixture is as it was. The status's key carries the clock, so
 * two runs at once cannot collide on the unique index.
 */
import { BASE, WORKSPACE, open, record, drawn, shot, finish } from './suite/harness.mjs';

const STAMP = Date.now();
const KEY = `CHECK_${STAMP}`;
const LABEL = `Check ${STAMP}`;
const COLOUR = '#8b5cf6';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const FIELDS = 'id key label color position initial closed inUse';

let added = null;
let filed = null;
try {
  ({ addIssueStatus: added } = await graphql(
    `mutation ($workspaceId: ID!, $key: String!, $label: String!, $color: String) {
       addIssueStatus(workspaceId: $workspaceId, key: $key, label: $label, color: $color) { ${FIELDS} }
     }`,
    { workspaceId: WORKSPACE, key: KEY, label: LABEL, color: COLOUR },
  ));
  record(added.key === KEY && added.color === COLOUR && !added.initial && !added.closed, 'the status is added at the end, open, uncoloured by default but for what was asked');

  ({ createIssue: filed } = await graphql(
    `mutation ($input: IssueInput!) { createIssue(input: $input) { id number status } }`,
    { input: { workspaceId: WORKSPACE, title: `Status walk ${STAMP}` } },
  ));
  record(filed.status === 'OPEN', 'a new issue lands in the initial status');

  // ---- The settings card --------------------------------------------------
  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'workspace settings')) {
    const section = page.locator('[data-testid="issue-statuses"]');
    const text = await section.innerText();
    record(
      ['Open', 'In progress', 'Review', 'Closed', LABEL].every((one) => text.includes(one)),
      'the Issue statuses section lists the four seeded statuses and the added one',
    );
    record(text.includes(KEY), 'with its key');
    const removeOpen = section.locator('button[aria-label="Remove Open"]');
    record(await removeOpen.isDisabled(), 'the initial status cannot be removed');
    record((await removeOpen.getAttribute('title')) === 'Where a new issue starts', 'and the button says why');
    record(await section.locator('button[aria-label="Remove Closed"]').isDisabled(), 'nor can the last closed one');
    record(await section.locator(`button[aria-label="Remove ${LABEL}"]`).isEnabled(), 'the added one can, while nothing holds it');
    record(await section.locator(`button[aria-label="Move ${LABEL} up"]`).isEnabled(), 'and can move up');
    record(await section.locator(`button[aria-label="Move ${LABEL} down"]`).isDisabled(), 'but not down, being last');
    const dot = section.locator('li', { hasText: KEY }).locator('span[aria-hidden="true"]').first();
    const colour = await dot.evaluate((el) => getComputedStyle(el).backgroundColor);
    record(colour === 'rgb(139, 92, 246)', `the colour reaches the dot (${colour})`);
    record((await section.locator('button[data-hint="Issue statuses"]').count()) === 1, 'the explanation is behind the (?)');

    /*
     * The row that adds one. Three boxes with nothing on them was reported as
     * "what are those fields for?" - so each wears its word, and the (?) beside
     * the row's label says what the three are in one sentence.
     */
    record((await page.locator('button[data-hint="Add a status"]').count()) === 1, 'the add row has a (?) of its own');
    for (const [id, word] of [
      ['new-issue-status', 'Label'],
      ['new-issue-status-key', 'Key'],
      ['new-issue-status-colour', 'Colour'],
    ]) {
      const named = page.locator(`label[for="${id}"]`);
      record(
        (await named.count()) === 1 && (await named.isVisible()) && (await named.innerText()).trim() === word,
        `and the ${word.toLowerCase()} box is labelled "${word}" where it can be read`,
      );
    }
    await page.screenshot({ path: shot('issue-statuses-settings.png') });
  }

  // ---- The filter bar -------------------------------------------------------
  await page.goto(`${BASE}/workspace/${WORKSPACE}/issues`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'issues list')) {
    const tabs = await page.locator('[aria-label="Filter by status"] button').allInnerTexts();
    record(tabs[0] === 'Open' && tabs[tabs.length - 1] === 'All', `Open first and All last (${JSON.stringify(tabs)})`);
    record(tabs[tabs.length - 2] === LABEL, 'the added status is the tab before All, being last in the order');
    await page.locator('[aria-label="Filter by status"] button', { hasText: LABEL }).click();
    await page.waitForTimeout(800);
    record(page.url().includes(`status=${KEY}`), `the tab writes the key into the address (${page.url()})`);
    record((await page.locator('a[href*="/issues/"]').filter({ hasText: 'Status walk' }).count()) === 0, 'and nothing is in it yet');
  }

  // ---- The status button ----------------------------------------------------
  await page.goto(`${BASE}/workspace/${WORKSPACE}/issues/${filed.number}`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'issue page')) {
    const button = page.locator('button[title^="Press for"]');
    const walked = [await button.innerText()];
    for (let press = 0; press < 5; press += 1) {
      await button.click();
      await page.waitForTimeout(700);
      walked.push(await button.innerText());
    }
    record(
      JSON.stringify(walked) === JSON.stringify(['Open', 'In progress', 'Review', 'Closed', LABEL, 'Open']),
      `the status button walks the workspace's list, the added status included, and round (${JSON.stringify(walked)})`,
    );
    // Back into the added one, so the server's count and the settings card's refusal can be read.
    for (let press = 0; press < 4; press += 1) {
      await button.click();
      await page.waitForTimeout(700);
    }
    record((await button.innerText()) === LABEL, 'and lands in the added status');
    await page.screenshot({ path: shot('issue-statuses-issue.png') });

    const { issueStatuses } = await graphql(
      `query ($workspaceId: ID!) { issueStatuses(workspaceId: $workspaceId) { key inUse } }`,
      { workspaceId: WORKSPACE },
    );
    record(issueStatuses.find((one) => one.key === KEY)?.inUse === 1, 'the server counts the issue as holding it');

    const refused = await graphql(`mutation ($id: ID!) { removeIssueStatus(id: $id) }`, { id: added.id })
      .then(() => null)
      .catch((cause) => cause.message);
    record(refused !== null && refused.includes('is on 1 issue'), `removing it is refused naming the count (${refused})`);
  }
} finally {
  if (filed !== null) {
    await graphql(`mutation ($id: ID!) { deleteIssue(id: $id) }`, { id: filed.id }).catch(() => {});
  }
  if (added !== null) {
    const gone = await graphql(`mutation ($id: ID!) { removeIssueStatus(id: $id) }`, { id: added.id })
      .then(() => true)
      .catch(() => false);
    record(gone, 'the status comes off once nothing holds it');
  }
}

await finish(browser);
