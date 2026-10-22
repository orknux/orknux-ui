/**
 * Models as templates: made from a model's own row on one workspace's Models
 * page, as every other component's template is, and used on another's.
 *
 * Asked for as "add ability to expose model as template". A model is not a
 * component, so the component templates could not carry one; a template of
 * models holds the models file Export writes - providers and models, no key -
 * and Use reads it in the way Import does.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const TEMPLATE = `zz model template ${stamp}`;
const PROVIDER = `zzTplLab ${stamp}`;

const workspace = async (name) =>
  (await graphql('mutation($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }', { input: { name } })).createWorkspace.id;
const from = await workspace(`zz tpl from ${stamp}`);
const into = await workspace(`zz tpl into ${stamp}`);

try {
  const provider = (await graphql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }',
    { input: { workspaceId: from, name: PROVIDER, type: 'OPENAI', endpoint: 'http://lab.invalid/v1', secret: 'sk-secret' } },
  )).createModelProvider.id;
  await graphql('mutation($input: CreateModelInput!) { createModel(input: $input) { id } }', {
    input: { providerId: provider, name: 'Talker', modelId: 'talker-id', kind: 'CHAT' },
  });

  await page.goto(`${BASE}/workspace/${from}/models`, { waitUntil: 'domcontentloaded' });
  // Made from the model's own row, as every other component's template is; there is no page-wide Publish.
  const save = page.getByRole('button', { name: 'Save Talker as a template' });
  await save.waitFor({ timeout: 20_000 });
  record((await page.getByRole('button', { name: 'Publish as template' }).count()) === 0, 'there is no page-wide Publish as template');
  await save.click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill(TEMPLATE);
  record((await dialog.getByText('Everything it uses').count()) === 0, 'the dialog asks for no depth: a model travels with its provider');
  await dialog.getByRole('button', { name: 'Publish template' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  const { modelTemplates: held } = await graphql('query { modelTemplates { id name models } }');
  const made = held.find((one) => one.name === TEMPLATE);
  record(made !== undefined && made.models.length === 1, `the row's template button publishes that model (${JSON.stringify(made)})`);

  // Reported: its page on Admin > Templates said "Nothing this installation can read" over an empty list.
  if (made !== undefined) {
    await page.goto(`${BASE}/admin/templates/${made.id}`, { waitUntil: 'domcontentloaded' });
    const inside = page.locator('[data-template-model]');
    await inside.first().waitFor({ timeout: 15_000 }).catch(() => undefined);
    const listed = (await inside.allTextContents()).map((one) => one.replace(/\s+/g, ' ').trim());
    const page_ = (await page.locator('main').textContent()) ?? '';
    record(
      listed.length === 1 && listed[0].includes(`Talker (${PROVIDER})`) && !page_.includes('Nothing this installation can read') && page_.includes('1 model'),
      `its template page lists the model inside and counts it (${JSON.stringify(listed)})`,
    );
  }

  await page.goto(`${BASE}/workspace/${into}/models`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('models-use-template').waitFor({ timeout: 20_000 });
  await page.getByTestId('models-use-template').click();
  const row = page.getByTestId('model-templates').locator('li', { hasText: TEMPLATE });
  await row.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const shown = (await row.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(shown.includes(`Talker (${PROVIDER})`), `another workspace is offered it, naming what is in it (${shown})`);
  await row.getByRole('button', { name: `Use ${TEMPLATE}` }).click();
  const used = await page.getByTestId('models-transfer-note').innerText({ timeout: 10_000 }).catch(() => '');
  record(used.includes('1 models added') && used.includes(PROVIDER), `Use reads it in, and says the provider needs a key (${used})`);

  const { modelProviders } = await graphql('query($w: ID!) { modelProviders(workspaceId: $w) { name } }', { w: into }).catch(() => ({ modelProviders: [] }));
  record((modelProviders ?? []).some((one) => one.name === PROVIDER), 'the provider is there');
} finally {
  const { modelTemplates } = await graphql('query { modelTemplates { id name } }').catch(() => ({ modelTemplates: [] }));
  for (const one of (modelTemplates ?? []).filter((held) => held.name === TEMPLATE)) {
    await graphql('mutation($id: ID!) { deleteComponentTemplate(id: $id) }', { id: one.id }).catch(() => undefined);
  }
  for (const id of [from, into]) await graphql('mutation($id: ID!) { deleteWorkspace(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
