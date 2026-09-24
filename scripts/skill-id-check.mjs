/**
 * Every skill has an id, on its card and in its editor. Issue #381.
 *
 * What a workflow graph or a Slack command names a skill by. Derived from the
 * name when the skill is made, shown beside the name on the list, and edited
 * on the skill's page under the same rule the server holds: letters,
 * underscores and hyphens, and no two alike in a workspace. What the rule
 * refuses is pinned in SkillIdTest; this is the screen - that the id is drawn,
 * that a bad one is refused in words where it was typed, and that a good one
 * saves.
 *
 * Makes one skill and removes it.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const STAMP = Date.now();
const NAME = `zzSkillId ${STAMP}!`;
const DERIVED = `zzSkillId`;

const sweep = async () => {
  const { workspaceSkills } = await graphql(
    `query($w: ID!) { workspaceSkills(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const held of workspaceSkills.content.filter((one) => one.name.startsWith('zzSkillId'))) {
    await graphql(`mutation($id: ID!) { deleteSkill(id: $id) }`, { id: held.id }).catch(() => undefined);
  }
};
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

/* ------------------------------------------------------ made, and named --- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/skills`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the skills page'), 'the skills page is on screen');

await page.getByRole('button', { name: '+ Add Skill' }).first().click();
await page.locator('#new-name').fill(NAME);
await page.getByRole('button', { name: 'Create Skill' }).click();
await page.waitForURL(/\/skills\/\d+$/, { timeout: 20_000 }).catch(() => undefined);
record(/\/skills\/\d+$/.test(page.url()), `a new skill opens in its editor (${page.url()})`);
if (!/\/skills\/\d+$/.test(page.url())) await clean();

const box = page.locator('#skill-key');
await box.waitFor({ timeout: 20_000 });
record(
  (await box.inputValue()) === DERIVED,
  `it has an id derived from its name, with the digits and the punctuation gone (${JSON.stringify(await box.inputValue())})`,
);

/* ------------------------------------------------------- the rule, typed --- */

await box.fill('bad id 2');
await page.getByRole('button', { name: 'Save Changes' }).click();
await page.waitForTimeout(1500);
const refused = await page.locator('[role="alert"]').allInnerTexts();
record(
  refused.some((said) => said.includes('cannot be a skill id')),
  `an id with a space or a digit is refused in words (${JSON.stringify(refused)})`,
);

const WANTED = `zz-skill-id-${'x'.repeat(3)}`;
await box.fill(WANTED);
await page.getByRole('button', { name: 'Save Changes' }).click();
await page.waitForTimeout(1500);
const { workspaceSkills } = await graphql(
  `query($w: ID!) { workspaceSkills(workspaceId: $w, page: 0, size: 200) { content { name key } } }`,
  { w: WORKSPACE },
);
const held = workspaceSkills.content.find((one) => one.name === NAME) ?? null;
record(held !== null && held.key === WANTED, `a typed id saves and the server holds it (${held?.key ?? 'none'})`);

/* --------------------------------------------------------- on the card --- */

await page.goto(`${BASE}/workspace/${WORKSPACE}/skills`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the skills page');
const shown = await page.locator('[data-skill-key]').allInnerTexts();
record(shown.includes(WANTED), `the card shows the id beside the name (${shown.length} cards carry one)`);

await clean();
