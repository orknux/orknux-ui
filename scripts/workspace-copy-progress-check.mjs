/**
 * Duplicating a workspace shows how far the copy has got while it runs.
 * Issue #572: a large copy showed nothing until it ended, which reads as stuck.
 *
 * A scratch workspace of its own with enough skills that the copy takes a few
 * seconds, named to sort first so its row is on the first page. What is
 * measured is what is drawn while the mutation is still waiting: the progress
 * block, a line naming the kind and how many of how many, and a bar that moves.
 * Both workspaces are deleted afterwards.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const NAME = `aaa copy progress ${Date.now()}`;
/*
 * Enough that the copy outlasts a few of the page's half-second polls. Forty
 * was, until SQLite stopped starving the poll behind the copy; then the copy
 * of forty finished before the first poll and the bar had nothing to show.
 */
const SKILLS = 300;

const sweep = async () => {
  const { workspaces } = await graphql(`{ workspaces(page: 0, size: 200) { content { id name } } }`);
  for (const old of workspaces.content.filter((one) => one.name.startsWith('aaa copy progress'))) {
    await graphql(`mutation($id: ID!) { deleteWorkspace(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

const made = (await graphql(`mutation($n: String!) { createWorkspace(input: { name: $n }) { id } }`, { n: NAME }))
  .createWorkspace;
for (let at = 0; at < SKILLS; at += 1) {
  await graphql(`mutation($input: CreateSkillInput!) { createSkill(input: $input) { id } }`, {
    // Letters, not digits: an id keeps only letters, so digits would all be one id.
    input: { workspaceId: made.id, name: `Skill ${String.fromCharCode(97 + Math.floor(at / 26))}${String.fromCharCode(97 + (at % 26))}` },
  });
}

await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the workspaces'), 'the workspaces are on screen');

const duplicate = page.getByRole('button', { name: `Duplicate ${NAME}`, exact: true });
await duplicate.waitFor({ timeout: 20_000 });
await duplicate.click();

const block = page.locator('[data-copy-progress]');
record(await block.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), 'a progress block appears while the copy runs');

/* Read it while it runs: the line and the bar, several times. */
const seen = [];
for (let tries = 0; tries < 60 && (await block.count()) > 0; tries += 1) {
  const now = await block.evaluate((node) => ({
    line: node.querySelector('p')?.textContent ?? '',
    value: Number(node.querySelector('progress')?.value ?? 0),
    max: Number(node.querySelector('progress')?.max ?? 0),
  })).catch(() => null);
  if (now !== null) seen.push(now);
  await page.waitForTimeout(250);
}
console.log(`seen: ${JSON.stringify(seen.slice(0, 3))} ... ${JSON.stringify(seen.slice(-2))}`);

const counted = seen.filter((one) => / of \d+/.test(one.line));
record(counted.length > 0, `it names the kind and how many of how many (${counted[0]?.line ?? 'never'})`);
const values = [...new Set(seen.map((one) => one.value))];
record(values.length > 1 && Math.max(...values) > 0, `and the bar moves as it goes (${values.slice(0, 6).join(', ')})`);

record(
  await page.locator('[role="status"]', { hasText: 'Copied to' }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  'and the answer replaces it when the copy is done',
);
record((await block.count()) === 0, 'the progress block is gone once it is');

/* And the answer can be put away. */
const answer = page.locator('[role="status"]', { hasText: 'Copied to' });
await page.locator('[data-copy-dismiss]').click();
record((await answer.count()) === 0, 'the answer is dismissed with its close button');

/* A second copy is not refused for a name the first one took: it takes "copy 2". */
await duplicate.click();
record(
  await page.locator('[role="status"]', { hasText: `${NAME} copy 2` }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  'a second copy takes the next free name',
);

/*
 * Progress that cannot be read is said, not swallowed. Issue #581: every
 * failed poll was dropped, so a page that could not read a step looked like a
 * copy that had stopped. Every progress question is failed here; the page has
 * to say so while the copy runs, and the copy still has to answer.
 */
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('workspaceCopyProgress')) return route.continue();
  await route.fulfill({ status: 500, contentType: 'text/plain', body: 'unavailable' });
});
await page.locator('[data-copy-dismiss]').click().catch(() => undefined);
await duplicate.click();
record(
  await page.locator('[data-copy-progress-unread]').waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
  'a progress that cannot be read is said under the bar',
);
record(
  await page.locator('[role="status"]', { hasText: `${NAME} copy 3` }).waitFor({ timeout: 60_000 }).then(() => true).catch(() => false),
  'and the copy still answers when it is done',
);
record((await page.locator('[data-copy-progress-unread]').count()) === 0, 'the notice goes with the progress block');
await page.unroute('**/graphql');

await sweep();
await finish(browser);
