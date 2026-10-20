/**
 * A chat model's prices can be changed on its own page.
 *
 * The create dialog asked for the input and output price per million tokens
 * and the model's page did not show them at all - it sent the stored ones back
 * on every save - so a price typed wrong, or a provider's new one, could only
 * be put right by making the model again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const { models } = await graphql(
  'query($w: ID!) { models(workspaceId: $w) { id name kind inputCostPerMillion outputCostPerMillion } }',
  { w: WORKSPACE },
).catch(() => ({ models: [] }));
const model = (models ?? []).find((one) => one.kind === 'CHAT');
record(model !== undefined, `a chat model to open (${model?.name})`);

if (model !== undefined) {
  const read = async () =>
    (await graphql('query($id: ID!) { model(id: $id) { inputCostPerMillion outputCostPerMillion } }', { id: model.id })).model;
  const saveWith = async (input, output) => {
    await page.locator('#model-input-cost').fill(input);
    await page.locator('#model-output-cost').fill(output);
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);
  };

  try {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
    const input = page.locator('#model-input-cost');
    await input.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record((await input.count()) === 1, 'the page has an input price');
    record((await page.locator('#model-output-cost').count()) === 1, 'and an output price');
    const shown = await input.inputValue().catch(() => null);
    record(
      shown === (model.inputCostPerMillion === null ? '' : String(model.inputCostPerMillion)),
      `showing what is stored (${JSON.stringify(shown)})`,
    );

    await saveWith('1.25', '10.5');
    const after = await read();
    record(after.inputCostPerMillion === 1.25 && after.outputCostPerMillion === 10.5, `a save stores them (${JSON.stringify(after)})`);
  } finally {
    await page.locator('#model-input-cost').waitFor({ timeout: 5_000 }).catch(() => undefined);
    if ((await page.locator('#model-input-cost').count()) === 1) {
      await saveWith(
        model.inputCostPerMillion === null ? '' : String(model.inputCostPerMillion),
        model.outputCostPerMillion === null ? '' : String(model.outputCostPerMillion),
      );
    }
  }
}

await finish(browser);
