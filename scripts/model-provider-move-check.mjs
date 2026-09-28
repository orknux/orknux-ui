/**
 * A model's provider is a select on its page, and Save moves the model there.
 *
 * Asked for: the provider was drawn as fixed text, so a model made on the wrong
 * provider could only be deleted and made again, losing its settings and every
 * agent pointed at it. Measured on what the server holds after Save - the same
 * model id, on the other provider - and on what the select draws once the page
 * has the answer back.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const stamp = Date.now();
const make = async (name) => (await graphql(
  `mutation($w: ID!, $n: String!) { createModelProvider(input: { workspaceId: $w, name: $n, endpoint: "https://example.invalid/v1" }) { id } }`,
  { w: WORKSPACE, n: name },
)).createModelProvider;

const from = await make(`zz move from ${stamp}`);
const to = await make(`zz move to ${stamp}`);
const model = (await graphql(
  `mutation($p: ID!) { createModel(input: { providerId: $p, name: "zz moving model", modelId: "stub", kind: CHAT }) { id } }`,
  { p: from.id },
)).createModel;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the model page'), 'the model page is on screen');

  const select = page.locator('select#model-provider');
  const there = await select.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, 'the provider is a select');
  if (there) {
    // The list arrives on its own request; wait until the other provider is a choice.
    const offered = await page.locator(`select#model-provider option[value="${to.id}"]`).waitFor({ state: 'attached', timeout: 10_000 })
      .then(() => true).catch(() => false);
    record(offered, "the workspace's other provider is offered");
    record((await select.inputValue()) === String(from.id), 'it opens on the provider the model is on');
    if (offered) {
      await select.selectOption(String(to.id));
      await page.getByRole('button', { name: /^Save/ }).first().click();
      await page.waitForTimeout(2000);

      const held = (await graphql(`query($id: ID!) { model(id: $id) { id providerId } }`, { id: model.id })).model;
      record(held?.providerId === String(to.id), `the model is stored on the other provider (${held?.providerId})`);
      record(await page.getByText('Saved.', { exact: true }).isVisible().catch(() => false), 'the page says Saved.');
      record((await select.inputValue()) === String(to.id), 'and the select draws the provider it moved to');
    }
  }
} finally {
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: from.id }).catch(() => undefined);
  await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: to.id }).catch(() => undefined);
}
await finish(browser);
