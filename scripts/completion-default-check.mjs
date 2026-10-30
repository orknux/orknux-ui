/**
 * A workspace's Completion Model can be set to Default, and only then does the
 * model chosen under Admin -> Settings apply: the field offers the row and keeps
 * it across a reload, the administrator's field saves, and a workspace on None
 * is told nothing will be suggested whatever the administrator chose.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1280, height: 1000 } });
const stamp = Date.now().toString(36);

const read = async () => (await graphql(
  'query ($w: ID!) { workspace(id: $w) { completionModelId completionModelDefault completionAvailable } }',
  { w: WORKSPACE },
)).workspace;
const had = await read();
const hadDefault = (await graphql('query { installationSettings { chatCompletionModelId } }')).installationSettings.chatCompletionModelId;

const { createModelProvider: provider } = await graphql(
  'mutation ($w: ID!, $n: String!) { createModelProvider(input: { workspaceId: $w, name: $n, endpoint: "http://stub.invalid", secret: "x" }) { id } }',
  { w: WORKSPACE, n: `Default check ${stamp}` },
);
const { createModel: model } = await graphql(
  'mutation ($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "stub", kind: CHAT }) { id } }',
  { p: provider.id, n: `Default model ${stamp}` },
);

const pick = async (field, value) => {
  await page.locator(`#${field}`).click();
  await page.locator(`[data-model-menu="${field}"] li[data-value="${value}"]`).click();
};
const SAVE = 'button:has-text("Save Changes")';

try {
  await page.goto(`${BASE}/admin/settings`);
  await page.waitForLoadState('networkidle');
  // Drawn as the page's fields are, rather than as the browser's bare button.
  const field = await page.locator('#default-completion-model').evaluate((one) => {
    const style = getComputedStyle(one);
    return { width: one.getBoundingClientRect().width, fill: style.backgroundColor, radius: parseFloat(style.borderTopLeftRadius), pad: parseFloat(style.paddingLeft) };
  });
  const channels = field.fill.match(/[\d.]+/g).map(Number);
  record(field.width >= 240 && channels.slice(0, 3).every((one) => one < 40) && field.radius > 0 && field.pad > 4, `the administrator's field is drawn as a field (${JSON.stringify(field)})`);
  await pick('default-completion-model', model.id);
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  record(
    (await page.locator('#default-completion-model').getAttribute('data-value')) === model.id,
    'the administrator\'s choice is drawn again after a reload',
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/settings`);
  await page.waitForLoadState('networkidle');
  await page.locator('#completion-model').scrollIntoViewIfNeeded();
  await pick('completion-model', 'default');
  await page.locator(SAVE).first().click();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  record((await page.locator('#completion-model').getAttribute('data-value')) === 'default', 'Default is still chosen after a reload');
  record((await read()).completionAvailable === true, 'a workspace on Default is told suggestions are available');

  await pick('completion-model', '');
  await page.locator(SAVE).first().click();
  await page.waitForLoadState('networkidle');
  await page.reload();
  await page.waitForLoadState('networkidle');
  record((await page.locator('#completion-model').getAttribute('data-value')) === '', 'None is still chosen after a reload');
  record((await read()).completionAvailable === false, 'a workspace on None is not overridden by the administrator\'s model');
} finally {
  await graphql('mutation ($id: ID) { setChatCompletionModel(modelId: $id) { chatCompletionModelId } }', { id: hadDefault });
  await graphql(
    'mutation ($w: ID!, $id: ID, $d: Boolean) { setWorkspaceCompletionModel(workspaceId: $w, modelId: $id, useDefault: $d) { id } }',
    { w: WORKSPACE, id: had.completionModelId, d: had.completionModelId === null && had.completionModelDefault },
  );
  await graphql('mutation ($id: ID!) { deleteModel(id: $id) }', { id: model.id }).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteModelProvider(id: $id) }', { id: provider.id }).catch(() => undefined);
}

await finish(browser);
