/**
 * A model's name, model ID and type can be changed on its page.
 *
 * Reported: they were drawn as fixed text, so a duplicated model was stuck being
 * called "(copy)" and pointed at the same model ID. The server always took all
 * three; the page sent back what it had loaded. Measured on what the server
 * holds after Save.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });

const provider = (await graphql(
  `mutation($w: ID!) { createModelProvider(input: { workspaceId: $w, name: "zz details provider ${Date.now()}", endpoint: "https://example.invalid/v1" }) { id } }`,
  { w: WORKSPACE },
)).createModelProvider;
const model = (await graphql(
  `mutation($p: ID!) { createModel(input: { providerId: $p, name: "zz details model", modelId: "old-id", kind: CHAT }) { id } }`,
  { p: provider.id },
)).createModel;

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the model page'), 'the model page is on screen');

const nameBox = page.locator('#model-name');
record(await nameBox.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'the name is a box');
await nameBox.fill('zz details renamed');
await page.locator('#model-id').fill('new-id');
await page.locator('#model-kind').selectOption('TRANSCRIPTION');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);

const held = (await graphql(`query($id: ID!) { model(id: $id) { name modelId kind } }`, { id: model.id })).model;
record(held.name === 'zz details renamed', `the new name is stored (${held.name})`);
record(held.modelId === 'new-id', `the new model ID is stored (${held.modelId})`);
record(held.kind === 'TRANSCRIPTION', `the new type is stored (${held.kind})`);

await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: provider.id }).catch(() => undefined);
await finish(browser);
