/**
 * An Azure OpenAI chat model's page offers a reasoning effort, and Save stores
 * it; a model on a provider type that declares none draws nothing new.
 *
 * Asked for as a provider-specific setting, like the image parameters: the
 * server declares which provider types take it (`chatModelParameters`), and the
 * page draws only what the model's provider declares. Measured on what the
 * server holds after Save, and on whether the select is in the DOM at all for
 * the other model. Makes its own two providers on `.invalid` hosts and removes
 * them, with their models.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const stamp = Date.now();
const provider = async (name, type) => (await graphql(
  `mutation($w: ID!, $n: String!, $t: ProviderType!) {
     createModelProvider(input: { workspaceId: $w, name: $n, type: $t, endpoint: "https://example.invalid/v1" }) { id }
   }`,
  { w: WORKSPACE, n: name, t: type },
)).createModelProvider;
const model = async (providerId, name) => (await graphql(
  `mutation($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "o4-mini", kind: CHAT }) { id } }`,
  { p: providerId, n: name },
)).createModel;

const azure = await provider(`zz effort azure ${stamp}`, 'AZURE_OPENAI');
const plain = await provider(`zz effort openai ${stamp}`, 'OPENAI');
const thinker = await model(azure.id, 'zz effort azure model');
const other = await model(plain.id, 'zz effort openai model');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${thinker.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the Azure model page'), 'the Azure model page is on screen');

  const select = page.locator('select#reasoning-effort');
  const there = await select.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, 'the Azure model offers a Reasoning effort select');
  if (there) {
    record(await page.getByText('Reasoning effort', { exact: true }).isVisible(), 'labelled Reasoning effort');
    const offered = await select.locator('option').evaluateAll((all) => all.map((one) => one.value));
    record(
      JSON.stringify(offered) === JSON.stringify(['', 'minimal', 'low', 'medium', 'high']),
      `it offers default and the four efforts (${offered.join(',')})`,
    );
    record((await select.inputValue()) === '', 'it opens on the default');
    await select.selectOption('high');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);

    const held = (await graphql(`query($id: ID!) { model(id: $id) { reasoningEffort } }`, { id: thinker.id })).model;
    record(held?.reasoningEffort === 'high', `the server holds high (${held?.reasoningEffort})`);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await select.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record((await select.inputValue().catch(() => '')) === 'high', 'and a reload draws it back');
  }

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${other.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the OpenAI model page'), 'the OpenAI model page is on screen');
  // The providers and their declarations arrive on requests of their own; give them the time the Azure page needed.
  await page.locator('select#model-provider option').nth(1).waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  record((await page.locator('select#reasoning-effort').count()) === 0, 'a model on a provider that declares none draws no select');
} finally {
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: azure.id }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: plain.id }).catch(() => undefined);
}
await finish(browser);
