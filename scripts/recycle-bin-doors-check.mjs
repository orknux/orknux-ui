/**
 * Every delete a person can press puts the thing in the Recycle Bin.
 *
 * The bin was written kind by kind and tested mutation by mutation, and what a
 * person meets is neither: it is a trash can on a row, a button at the bottom
 * of a settings page, a question in a dialog. A diagram deleted from its list
 * was simply gone while the test of `deleteDiagram` was green, because the
 * door being pressed was not the door being tested. So this presses the doors:
 * for each kind it makes one, deletes it with the control its own page draws,
 * reads the Recycle Bin page for a row of that kind under that name, presses
 * Restore on that row and reads the thing back.
 *
 * Then the three deletes that were refused outright: an empty memory catalog,
 * a skill, and an empty skill catalog. A catalog is a door too: deleted, it is
 * one row in the bin - the folder, not what it held scattered - and Restore
 * puts back the folder with its contents in it.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });
// The memory and skill pages ask through the browser's own question.
page.on('dialog', (dialog) => void dialog.accept());

const tag = `zzdoor${Date.now() % 100000}`;
const at = (path) => `${BASE}/workspace/${WORKSPACE}${path}`;
const go = async (path) => {
  await page.goto(at(path), { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle').catch(() => {});
};
const binned = async () =>
  (await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })).recycleBin.content;
/** The control beside a name: the nearest thing around the name that holds one. */
const beside = (name, control) =>
  page.getByText(name, { exact: true }).first().locator(`xpath=ancestor::*[.//*[${control}]][1]//*[${control}]`).first();
/** The button that agrees, in whichever dialog is open. */
const agree = (label) => page.locator('dialog[open]').getByRole('button', { name: label, exact: true });


/** One kind through its own door, the bin's page, and back. */
async function door(label, kind, name, { make, press, there }) {
  try {
    const id = await make();
    await press(id);
    await page.waitForTimeout(700);

    const entry = (await binned()).find((one) => one.kind === kind && one.name.includes(name));
    const gone = !(await there());
    record(entry !== undefined && gone, `${label}: deleted from its own page, it is in the bin (${entry?.kind ?? 'not there'}; gone from its list: ${gone})`);
    if (entry === undefined) return;

    await go('/recycle-bin');
    const row = page.locator(`[data-recycle-row][data-recycle-name="${entry.name}"]`);
    await row.waitFor({ timeout: 15_000 });
    const words = (await row.innerText()).replace(/\s+/g, ' ');
    record(/\S/.test(words) && !words.includes(kind), `${label}: the Recycle Bin page draws its row, named in words (${words.slice(0, 70)})`);

    await row.locator(`[data-recycle-restore="${entry.id}"]`).click();
    await row.waitFor({ state: 'detached', timeout: 15_000 });
    const back = await there();
    record(Boolean(back), `${label}: Restore on that row puts it back (${back})`);
  } catch (error) {
    record(false, `${label}: ${String(error.message).split('\n')[0]}`);
    await page.screenshot({ path: `/tmp/door-${label}.png` }).catch(() => {});
  }
}

/** A folder already deleted from its own page: its one row in the bin, and Restore on it. */
async function folder(label, kind, name, there) {
  try {
    const entry = (await binned()).find((one) => one.kind === kind && one.name === name);
    record(entry !== undefined, `${label}: deleted from its own page, the folder is in the bin (${entry?.kind ?? 'not there'})`);
    if (entry === undefined) return;
    await go('/recycle-bin');
    const row = page.locator(`[data-recycle-row][data-recycle-name="${entry.name}"]`);
    await row.waitFor({ timeout: 15_000 });
    const words = (await row.innerText()).replace(/\s+/g, ' ');
    record(!words.includes(kind) && /catalog/i.test(words), `${label}: its row says what it is, in words (${words.slice(0, 70)})`);
    // Two words, on one line: wrapped, the kind made this row taller than every other.
    const badge = await row.locator('[class*="badge"]').first().boundingBox().catch(() => null);
    record(badge !== null && badge.height <= 26, `${label}: its kind is drawn on one line (${badge === null ? 'none' : Math.round(badge.height)}px tall)`);
    await row.locator(`[data-recycle-restore="${entry.id}"]`).click();
    await row.waitFor({ state: 'detached', timeout: 15_000 });
    const back = await there();
    record(Boolean(back), `${label}: Restore on that row puts the folder back (${back})`);
  } catch (error) {
    record(false, `${label}: ${String(error.message).split('\n')[0]}`);
  }
}

const png = 'iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFlCsEAGjRAw3mJ3LkAAAAAElFTkSuQmCC';
const listed = async (query, field, name, variables = {}) => {
  const answered = (await graphql(query, { w: WORKSPACE, ...variables }))[field];
  return (answered.content ?? answered).some((one) => (one.name ?? one.title) === name);
};

try {
  await door('diagram', 'DIAGRAM', `${tag} diagram`, {
    make: async () =>
      (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
        w: WORKSPACE, n: `${tag} diagram`, d: JSON.stringify({ nodes: [{ id: 'a', kind: 'box', label: 'kept', x: 0, y: 0 }], edges: [] }),
      })).createDiagram.id,
    press: async () => {
      await go('/explore/diagrams');
      await beside(`${tag} diagram`, '@data-testid="diagram-remove"').click();
      await agree('Remove').click();
    },
    there: () => listed('query ($w: ID!) { diagrams(workspaceId: $w) { id name } }', 'diagrams', `${tag} diagram`),
  });

  await door('wireframe', 'WIREFRAME', `${tag} wireframe`, {
    make: async () =>
      (await graphql('mutation ($w: ID!, $n: String!, $d: String) { createWireframe(workspaceId: $w, name: $n, document: $d) { id } }', {
        w: WORKSPACE, n: `${tag} wireframe`, d: JSON.stringify({ elements: [{ id: 'a', type: 'text', text: 'Welcome back', x: 0, y: 0 }] }),
      })).createWireframe.id,
    press: async () => {
      await go('/design/wireframes');
      await beside(`${tag} wireframe`, '@data-testid="wireframe-remove"').click();
      await agree('Remove').click();
    },
    there: () => listed('query ($w: ID!) { wireframes(workspaceId: $w) { id name } }', 'wireframes', `${tag} wireframe`),
  });

  await door('sheet', 'SHEET', `${tag} sheet`, {
    make: async () =>
      (await graphql('mutation ($w: ID!, $n: String!, $b: String) { createSheet(workspaceId: $w, name: $n, workbook: $b) { id } }', {
        w: WORKSPACE, n: `${tag} sheet`, b: JSON.stringify({ tabs: [{ name: 'Sheet1', cells: { A1: 'Total' } }] }),
      })).createSheet.id,
    press: async () => {
      await go('/design/sheets');
      await page.getByRole('button', { name: `Remove ${tag} sheet`, exact: true }).click();
      await agree('Remove').click();
    },
    there: () => listed('query ($w: ID!) { sheets(workspaceId: $w) { id name } }', 'sheets', `${tag} sheet`),
  });

  await door('picture', 'IMAGE', `${tag} picture`, {
    make: async () =>
      (await graphql('mutation ($in: ImportDesignImageInput!) { importDesignImage(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, image: png, name: `${tag} picture`, prompt: 'a square' },
      })).importDesignImage.id,
    press: async (id) => {
      await go(`/design/images/${id}`);
      await page.getByTestId('design-image-remove').click();
      await agree('Remove').click();
    },
    there: () =>
      listed('query ($w: ID!, $s: String) { workspaceArtifacts(workspaceId: $w, search: $s, drawn: true, size: 50) { content { id name } } }', 'workspaceArtifacts', `${tag} picture`, { s: tag }),
  });

  let skillCatalog;
  await door('skill', 'SKILL', `${tag}Skill`, {
    make: async () => {
      skillCatalog = (await graphql('mutation ($w: ID!, $n: String!) { createSkillCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `${tag}_skills` })).createSkillCatalog.id;
      return (await graphql('mutation ($in: CreateSkillInput!) { createSkill(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, catalogId: skillCatalog, name: `${tag}Skill`, content: `---\nname: ${tag}Skill\ndescription: how to verify\n---\nStep one: look.` },
      })).createSkill.id;
    },
    press: async () => {
      await go('/skills');
      await page.getByText(`${tag}_skills`, { exact: true }).first().click();
      await page.getByRole('button', { name: `Delete ${tag}Skill`, exact: true }).click();
    },
    there: () =>
      listed('query ($w: ID!, $c: ID) { workspaceSkills(workspaceId: $w, catalogId: $c, size: 50) { content { id name } } }', 'workspaceSkills', `${tag}Skill`, { c: skillCatalog }),
  });

  let memoryCatalog;
  await door('memory', 'MEMORY', `${tag} memory`, {
    make: async () => {
      memoryCatalog = (await graphql('mutation ($w: ID!, $n: String!) { createMemoryCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `${tag}_mem` })).createMemoryCatalog.id;
      return (await graphql('mutation ($in: CreateMemoryInput!) { createMemory(input: $in) { id } }', {
        in: { catalogId: memoryCatalog, title: `${tag} memory`, content: 'SQLite is the second engine.' },
      })).createMemory.id;
    },
    press: async () => {
      await go('/memory');
      await page.getByText(`${tag}_mem`, { exact: true }).first().click();
      await page.getByRole('button', { name: `Delete ${tag} memory`, exact: true }).click();
    },
    there: async () =>
      (await graphql('query ($c: ID!) { memories(catalogId: $c) { content { id title } } }', { c: memoryCatalog })).memories.content.some((one) => one.title === `${tag} memory`),
  });

  await door('workflow', 'WORKFLOW', `${tag} workflow`, {
    make: async () =>
      (await graphql('mutation ($in: CreateWorkflowInput!) { createWorkflow(input: $in) { id workflowId } }', { in: { workspaceId: WORKSPACE, name: `${tag} workflow` } })).createWorkflow.id,
    press: async (id) => {
      await go(`/workflows/${id}/settings`);
      await page.getByRole('button', { name: 'Remove Workflow', exact: true }).click();
      await agree('Remove').click();
    },
    there: () =>
      listed('query ($w: ID!, $s: String) { workspaceWorkflows(workspaceId: $w, search: $s, size: 50) { content { name } } }', 'workspaceWorkflows', `${tag} workflow`, { s: tag }),
  });

  await door('action', 'ACTION', `${tag} action`, {
    make: async () =>
      (await graphql('mutation ($in: CreateActionInput!) { createAction(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, name: `${tag} action`, type: 'EXECUTE', subtype: 'HTTP_REQUEST', url: 'https://example.invalid/hook', method: 'POST' },
      })).createAction.id,
    press: async (id) => {
      await go(`/actions/${id}`);
      await page.getByRole('button', { name: 'Delete Action', exact: true }).click();
      await page.getByRole('button', { name: 'Delete Action', exact: true }).click();
    },
    there: () =>
      listed('query ($w: ID!, $s: String) { workspaceActions(workspaceId: $w, search: $s, size: 50) { content { name } } }', 'workspaceActions', `${tag} action`, { s: tag }),
  });

  // The rest of the catalogue an action sits in. Each was simply gone, as the diagram once was.
  await door('condition', 'CONDITION', `${tag} condition`, {
    make: async () =>
      (await graphql('mutation ($in: CreateConditionInput!) { createCondition(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, name: `${tag} condition`, type: 'SLACK', property: 'MESSAGE_TEXT', check: 'CONTAINS', values: ['urgent'] },
      })).createCondition.id,
    press: async (id) => {
      await go(`/conditions/${id}`);
      await page.getByRole('button', { name: 'Delete Condition', exact: true }).click();
      await page.getByRole('button', { name: 'Delete Condition', exact: true }).click();
    },
    there: async () => {
      const found = (await graphql('query ($w: ID!, $s: String) { workspaceConditions(workspaceId: $w, search: $s, size: 50) { content { name values } } }', { w: WORKSPACE, s: tag }))
        .workspaceConditions.content.find((one) => one.name === `${tag} condition`);
      // Back, and asking what it asked - a row with the name and nothing behind it is not a restore.
      return found !== undefined && found.values.join() === 'urgent';
    },
  });

  await door('trigger', 'TRIGGER', `${tag} trigger`, {
    make: async () =>
      (await graphql('mutation ($in: CreateTriggerInput!) { createTrigger(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, name: `${tag} trigger`, type: 'SCHEDULED', cron: '0 3 * * *', enabled: false },
      })).createTrigger.id,
    press: async (id) => {
      await go(`/triggers/${id}`);
      await page.getByRole('button', { name: 'Delete', exact: true }).click();
    },
    there: async () => {
      const found = (await graphql('query ($w: ID!, $s: String) { workspaceTriggers(workspaceId: $w, search: $s, size: 50) { content { name cron enabled } } }', { w: WORKSPACE, s: tag }))
        .workspaceTriggers.content.find((one) => one.name === `${tag} trigger`);
      return found !== undefined && found.cron === '0 3 * * *' && found.enabled === false;
    },
  });

  await door('object', 'OBJECT', `${tag}Shape`, {
    make: async () =>
      (await graphql('mutation ($in: CreateObjectInput!) { createObject(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, name: `${tag}Shape`, properties: [{ name: 'city', kind: 'STRING' }, { name: 'tags', kind: 'ARRAY', elementKind: 'STRING' }] },
      })).createObject.id,
    press: async (id) => {
      await go(`/objects/${id}`);
      await page.getByRole('button', { name: 'Delete Object', exact: true }).click();
    },
    there: async () => {
      const found = (await graphql('query ($w: ID!, $s: String) { workspaceObjects(workspaceId: $w, search: $s, size: 50) { content { name properties { name } } } }', { w: WORKSPACE, s: tag }))
        .workspaceObjects.content.find((one) => one.name === `${tag}Shape`);
      return found !== undefined && found.properties.map((one) => one.name).join() === 'city,tags';
    },
  });

  let variableCatalog;
  await door('variable', 'VARIABLE', `${tag}Var`, {
    make: async () => {
      variableCatalog = (await graphql('mutation ($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `${tag}_vars` })).createVariableCatalog.id;
      return (await graphql('mutation ($in: CreateVariableInput!) { createVariable(input: $in) { id } }', {
        in: { workspaceId: WORKSPACE, catalogId: variableCatalog, name: `${tag}Var`, type: 'STRING', kind: 'SECRET', value: 'kept-in-the-bin' },
      })).createVariable.id;
    },
    press: async () => {
      await go('/variables');
      await page.getByText(`${tag}_vars`, { exact: true }).first().click();
      await page.getByRole('button', { name: `Delete ${tag}Var`, exact: true }).click();
    },
    there: async () => {
      const found = (await graphql('query ($w: ID!, $c: ID) { workspaceVariables(workspaceId: $w, catalogId: $c, size: 50) { content { id name } } }', { w: WORKSPACE, c: variableCatalog }))
        .workspaceVariables.content.find((one) => one.name === `${tag}Var`);
      if (found === undefined) return false;
      // With the secret it held, which the bin kept encrypted and no list shows.
      return (await graphql('mutation ($id: ID!) { revealVariable(id: $id) }', { id: found.id })).revealVariable === 'kept-in-the-bin';
    },
  });

  // What a restored thing used may be in the bin beside it. The bin says which to put back first, in
  // words on its own page, and once that is back the two come back joined - by name, since the
  // function restored is a new row.
  try {
    const fn = (await graphql('mutation ($in: CreateFunctionInput!) { createFunction(input: $in) { id } }', { in: { workspaceId: WORKSPACE, name: `${tag}IsVip`, returnType: 'BOOLEAN' } })).createFunction.id;
    const cond = (await graphql('mutation ($in: CreateConditionInput!) { createCondition(input: $in) { id } }', { in: { workspaceId: WORKSPACE, name: `${tag} vip`, type: 'FUNCTION', functionId: fn } })).createCondition.id;
    await graphql('mutation ($id: ID!) { deleteCondition(id: $id) }', { id: cond });
    await graphql('mutation ($id: ID!) { deleteFunction(id: $id) }', { id: fn });
    await go('/recycle-bin');
    const row = (name) => page.locator(`[data-recycle-row][data-recycle-name="${name}"]`);
    await row(`${tag} vip`).locator('[data-recycle-restore]').click();
    const said = (await page.getByRole('alert').first().innerText({ timeout: 10_000 }).catch(() => '')).replace(/\s+/g, ' ');
    record(said.includes(`${tag}IsVip`) && (await row(`${tag} vip`).count()) === 1,
      `a condition whose function is in the bin too is kept there, and the page says what to restore first (${said.slice(0, 110)})`);
    await row(`${tag}IsVip`).locator('[data-recycle-restore]').click();
    await row(`${tag}IsVip`).waitFor({ state: 'detached', timeout: 15_000 });
    await row(`${tag} vip`).locator('[data-recycle-restore]').click();
    await row(`${tag} vip`).waitFor({ state: 'detached', timeout: 15_000 });
    const back = (await graphql('query ($w: ID!, $s: String) { workspaceConditions(workspaceId: $w, search: $s, size: 50) { content { name functionName } } }', { w: WORKSPACE, s: tag }))
      .workspaceConditions.content.find((one) => one.name === `${tag} vip`);
    record(back?.functionName === `${tag}IsVip`, `with the function back, the condition is restored onto it (${back?.functionName ?? 'not back'})`);
  } catch (error) {
    record(false, `a condition and its function through the bin: ${String(error.message).split('\n')[0]}`);
  }

  let issueNumber;
  await door('issue', 'ISSUE', `${tag} issue`, {
    make: async () => {
      const one = (await graphql('mutation ($in: IssueInput!) { createIssue(input: $in) { id number } }', { in: { workspaceId: WORKSPACE, title: `${tag} issue`, description: 'It never ends.' } })).createIssue;
      issueNumber = one.number;
      return one.id;
    },
    press: async () => {
      await go(`/issues/${issueNumber}`);
      await page.getByRole('button', { name: 'Delete this issue', exact: true }).click();
      await agree('Delete Issue').click();
    },
    there: async () => {
      const found = await graphql('query ($w: ID!, $n: Int!) { workspaceIssue(workspaceId: $w, number: $n) { title } }', { w: WORKSPACE, n: issueNumber }).catch(() => null);
      return found?.workspaceIssue?.title === `${tag} issue`;
    },
  });

  // The three that were refused. Each of the two catalogs holds what the doors above restored into it.
  const catalogs = async (query, field) => (await graphql(query, { w: WORKSPACE }))[field].map((one) => one.name);

  await go('/memory');
  await page.getByText(`${tag}_mem`, { exact: true }).first().click();
  await page.getByRole('button', { name: `Delete ${tag} memory`, exact: true }).click();
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: `Delete ${tag}_mem`, exact: true }).click();
  await page.waitForTimeout(900);
  record(
    !(await catalogs('query ($w: ID!) { memoryCatalogs(workspaceId: $w) { name } }', 'memoryCatalogs')).includes(`${tag}_mem`),
    'an empty memory catalog is deleted from the Memory page',
  );
  // And the folder itself is what the bin holds, and what Restore puts back.
  await folder('memory catalog', 'MEMORY_CATALOG', `${tag}_mem`, async () =>
    (await catalogs('query ($w: ID!) { memoryCatalogs(workspaceId: $w) { name } }', 'memoryCatalogs')).includes(`${tag}_mem`));

  await go('/skills');
  await page.getByText(`${tag}_skills`, { exact: true }).first().click();
  await page.getByRole('button', { name: `Delete ${tag}Skill`, exact: true }).click();
  await page.waitForTimeout(700);
  record(
    !(await listed('query ($w: ID!, $c: ID) { workspaceSkills(workspaceId: $w, catalogId: $c, size: 50) { content { id name } } }', 'workspaceSkills', `${tag}Skill`, { c: skillCatalog })),
    'a skill is deleted from the Skills page',
  );
  await page.getByRole('button', { name: `Delete ${tag}_skills`, exact: true }).click();
  await page.waitForTimeout(900);
  record(
    !(await catalogs('query ($w: ID!) { skillCatalogs(workspaceId: $w) { name } }', 'skillCatalogs')).includes(`${tag}_skills`),
    'an empty skill catalog is deleted from the Skills page',
  );
  await folder('skill catalog', 'SKILL_CATALOG', `${tag}_skills`, async () =>
    (await catalogs('query ($w: ID!) { skillCatalogs(workspaceId: $w) { name } }', 'skillCatalogs')).includes(`${tag}_skills`));

  // A folder deleted with something in it: one row for the folder, and the skill comes back inside it.
  const full = (await graphql('mutation ($w: ID!, $n: String!) { createSkillCatalog(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `${tag}_full` })).createSkillCatalog.id;
  await graphql('mutation ($in: CreateSkillInput!) { createSkill(input: $in) { id } }', { in: { workspaceId: WORKSPACE, name: `${tag}Kept`, catalogId: full } });
  await go('/skills');
  await page.getByText(`${tag}_full`, { exact: true }).first().click();
  await page.getByRole('button', { name: `Delete ${tag}_full`, exact: true }).click();
  await page.waitForTimeout(900);
  const loose = (await binned()).filter((one) => one.name.includes(`${tag}Kept`));
  record(loose.length === 0, `a skill catalog deleted with a skill in it leaves no loose skill in the bin (${loose.length})`);
  await folder('full skill catalog', 'SKILL_CATALOG', `${tag}_full`, async () => {
    const back = (await graphql('query ($w: ID!) { skillCatalogs(workspaceId: $w) { id name } }', { w: WORKSPACE })).skillCatalogs.find((one) => one.name === `${tag}_full`);
    if (back === undefined) return false;
    return listed('query ($w: ID!, $c: ID) { workspaceSkills(workspaceId: $w, catalogId: $c, size: 50) { content { id name } } }', 'workspaceSkills', `${tag}Kept`, { c: back.id });
  });
} finally {
  // What the doors restored, and what the last three left in the bin.
  const sweep = async (query, field, mutation) => {
    const held = (await graphql(query, { w: WORKSPACE, s: tag }).catch(() => null))?.[field];
    for (const one of (held?.content ?? held ?? []).filter((each) => (each.name ?? each.title ?? '').startsWith(tag))) {
      await graphql(mutation, { id: one.id }).catch(() => {});
    }
  };
  await sweep('query ($w: ID!) { diagrams(workspaceId: $w) { id name } }', 'diagrams', 'mutation ($id: ID!) { deleteDiagram(id: $id) }');
  await sweep('query ($w: ID!) { wireframes(workspaceId: $w) { id name } }', 'wireframes', 'mutation ($id: ID!) { deleteWireframe(id: $id) }');
  await sweep('query ($w: ID!) { sheets(workspaceId: $w) { id name } }', 'sheets', 'mutation ($id: ID!) { deleteSheet(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceArtifacts(workspaceId: $w, search: $s, drawn: true, size: 50) { content { id name } } }', 'workspaceArtifacts', 'mutation ($id: ID!) { deleteArtifact(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceWorkflows(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceWorkflows', 'mutation ($id: ID!) { removeWorkflow(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceActions(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceActions', 'mutation ($id: ID!) { deleteAction(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceIssues(workspaceId: $w, search: $s, size: 50) { content { id title } } }', 'workspaceIssues', 'mutation ($id: ID!) { deleteIssue(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceConditions(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceConditions', 'mutation ($id: ID!) { deleteCondition(id: $id) }');
  // After the conditions: a function a condition still calls is refused a delete.
  await sweep('query ($w: ID!, $s: String) { workspaceFunctions(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceFunctions', 'mutation ($id: ID!) { deleteFunction(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceTriggers(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceTriggers', 'mutation ($id: ID!) { deleteTrigger(id: $id) }');
  await sweep('query ($w: ID!, $s: String) { workspaceObjects(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceObjects', 'mutation ($id: ID!) { deleteObject(id: $id) }');
  // The variable first, then the catalog it was in: a catalog is only deleted empty.
  await sweep('query ($w: ID!, $s: String) { workspaceVariables(workspaceId: $w, search: $s, size: 50) { content { id name } } }', 'workspaceVariables', 'mutation ($id: ID!) { deleteVariable(id: $id) }');
  await sweep('query ($w: ID!) { variableCatalogs(workspaceId: $w) { id name } }', 'variableCatalogs', 'mutation ($id: ID!) { deleteVariableCatalog(id: $id) }');
  // The folders Restore put back, which go to the bin again and out of it just below.
  await sweep('query ($w: ID!) { memoryCatalogs(workspaceId: $w) { id name } }', 'memoryCatalogs', 'mutation ($id: ID!) { deleteMemoryCatalog(id: $id) }');
  await sweep('query ($w: ID!) { skillCatalogs(workspaceId: $w) { id name } }', 'skillCatalogs', 'mutation ($id: ID!) { deleteSkillCatalog(id: $id) }');
  for (const entry of (await binned().catch(() => [])).filter((one) => one.name.includes(tag))) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => {});
  }
}

await finish(browser);
