/**
 * A skill is Hidden, Offered or Always, the way a tool is. Issue #480.
 *
 * Skills were granted a folder at a time and that was the whole of it: every
 * skill in a granted catalog was offered, and there was no way to keep one page
 * from one agent short of splitting the folder, nor any way to say "this page is
 * how you work here" rather than "read this when it applies".
 *
 * The list now draws one row per skill under the catalogs, with the tools list's
 * own three-state control. What this measures is the part that could be wrong
 * without anybody noticing: that a row reads Offer the moment its catalog is
 * ticked, that a press cycles Offer to Always to Hide and back, and that what
 * the form sends is the exception rather than the rule - the hidden ids and the
 * always ids, not a state per skill.
 *
 * It makes its own catalog and skill, drives the form, and removes them. The
 * agent it drives is saved once, to read back what was stored, and put back the
 * way it was found.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

/** Nobody's catalog is called this. The sweep is by prefix. */
const MARK = `zzStates${Date.now()}`;

const { browser, page, graphql } = await open();

const catalogId = (
  await graphql(
    `mutation ($workspaceId: ID!, $name: String!) {
       createSkillCatalog(workspaceId: $workspaceId, name: $name) { id name }
     }`,
    { workspaceId: WORKSPACE, name: MARK },
  )
).createSkillCatalog.id;

const skill = (
  await graphql(
    `mutation ($input: CreateSkillInput!) { createSkill(input: $input) { id key name } }`,
    {
      input: {
        workspaceId: WORKSPACE,
        catalogId,
        name: `${MARK} page`,
        content: [`---`, `name: ${MARK} page`, `description: One line.`, `---`, ``, `Answer in one line.`].join(
          '\n',
        ),
      },
    },
  )
).createSkill;

const agent = (
  await graphql(
    `mutation ($input: CreateAgentInput!) {
       createAgent(input: $input) { id name skillCatalogs hiddenSkills requiredSkills }
     }`,
    { input: { workspaceId: WORKSPACE, name: `${MARK} agent`, type: 'LLM' } },
  )
).createAgent;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'networkidle' });

  const skills = page.locator('[data-grants="skills"]');
  await skills.waitFor({ state: 'visible', timeout: 15000 });

  const row = skills.locator(`[data-grant-name="${MARK} page"]`);
  const state = row.locator('button[aria-label]').first();

  /* Out of scope until its catalog is granted, which is what Hide means here. */
  record((await state.textContent())?.trim() === 'Hide', 'a skill whose catalog is not granted reads Hide');

  /* Granting the catalog offers every skill in it, with nothing else pressed. */
  const catalogs = page.locator('[data-grants="skill catalogs"]');
  await catalogs.locator(`[data-grant-name="${MARK}"] input[type="checkbox"]`).check();
  record((await state.textContent())?.trim() === 'Offer', 'granting the catalog offers its skills');

  /* Offer -> Always -> Hide, on a press each, as the tools list cycles. */
  await state.click();
  record((await state.textContent())?.trim() === 'Always', 'a press puts the page in front of the model');
  await state.click();
  record((await state.textContent())?.trim() === 'Hide', 'a second press takes it out of reach');
  await state.click();
  record((await state.textContent())?.trim() === 'Offer', 'and a third puts it back where it was');

  /* What is stored is the exception: Always here, and nothing hidden. */
  await state.click();
  await page.getByRole('button', { name: /save changes/i }).first().click();
  await page.waitForTimeout(1200);

  const saved = (
    await graphql(`query ($id: ID!) { agent(id: $id) { skillCatalogs hiddenSkills requiredSkills } }`, {
      id: agent.id,
    })
  ).agent;
  record(saved.skillCatalogs.includes(MARK), 'the catalog grant is stored');
  record(saved.requiredSkills.includes(skill.key), 'the Always mark is stored by the skill id');
  record(saved.hiddenSkills.length === 0, 'and nothing is stored for the skills left offered');
} finally {
  await graphql('mutation ($id: ID!) { deleteAgent(id: $id) }', { id: agent.id }).catch(() => {});
  await graphql('mutation ($id: ID!) { deleteSkill(id: $id) }', { id: skill.id }).catch(() => {});
  await graphql('mutation ($id: ID!) { deleteSkillCatalog(id: $id) }', { id: catalogId }).catch(() => {});
}

await finish(browser);
