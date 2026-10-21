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
  'query($w: ID!) { models(workspaceId: $w) { id name kind inputCostPerMillion outputCostPerMillion cachedInputCostPerMillion cacheWriteCostPerMillion } }',
  { w: WORKSPACE },
).catch(() => ({ models: [] }));
const model = (models ?? []).find((one) => one.kind === 'CHAT');
record(model !== undefined, `a chat model to open (${model?.name})`);

if (model !== undefined) {
  const read = async () =>
    (await graphql('query($id: ID!) { model(id: $id) { inputCostPerMillion outputCostPerMillion cachedInputCostPerMillion cacheWriteCostPerMillion } }', { id: model.id })).model;
  const saveWith = async (input, output, cached, written) => {
    await page.locator('#model-input-cost').fill(input);
    await page.locator('#model-output-cost').fill(output);
    await page.locator('#model-cached-cost').fill(cached);
    await page.locator('#model-write-cost').fill(written);
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

    record((await page.locator('#model-cached-cost').count()) === 1, 'and a cached-input price');

    // The four sit level in a card of their own, each label one line: they were
    // squeezed into the window's row of nine, two-line labels pushing boxes down.
    const boxes = await page.evaluate(() =>
      ['model-input-cost', 'model-cached-cost', 'model-write-cost', 'model-output-cost'].map((id) => {
        const input = document.getElementById(id);
        const box = input?.parentElement?.getBoundingClientRect();
        const label = document.querySelector(`label[for="${id}"]`);
        const line = label ? parseFloat(getComputedStyle(label).lineHeight) || 20 : 0;
        return { top: Math.round(box?.top ?? -1), width: Math.round(box?.width ?? 0), labelLines: label ? Math.round(label.getBoundingClientRect().height / line) : 0 };
      }),
    );
    record(boxes.every((one) => one.top === boxes[0].top), `the price boxes sit level (${boxes.map((one) => one.top).join(', ')})`);
    record(boxes.every((one) => one.labelLines === 1), `and each label is one line (${boxes.map((one) => one.labelLines).join(', ')})`);
    record(boxes.every((one) => one.width >= 200), `and wide enough to read a price in (${boxes.map((one) => one.width).join(', ')}px)`);
    const card = await page.evaluate(() => document.getElementById('model-input-cost')?.closest('form')?.querySelector('h2')?.textContent);
    record(card === 'Prices', `in a card of their own (${card})`);
    await saveWith('1.25', '10.5', '0.125', '1.5625');
    const after = await read();
    record(
      after.inputCostPerMillion === 1.25 && after.outputCostPerMillion === 10.5 && after.cachedInputCostPerMillion === 0.125
        && after.cacheWriteCostPerMillion === 1.5625,
      `a save stores them (${JSON.stringify(after)})`,
    );
  } finally {
    await page.locator('#model-input-cost').waitFor({ timeout: 5_000 }).catch(() => undefined);
    if ((await page.locator('#model-input-cost').count()) === 1) {
      await saveWith(
        model.inputCostPerMillion === null ? '' : String(model.inputCostPerMillion),
        model.outputCostPerMillion === null ? '' : String(model.outputCostPerMillion),
        model.cachedInputCostPerMillion === null || model.cachedInputCostPerMillion === undefined ? '' : String(model.cachedInputCostPerMillion),
        model.cacheWriteCostPerMillion === null || model.cacheWriteCostPerMillion === undefined ? '' : String(model.cacheWriteCostPerMillion),
      );
    }
  }
}

await finish(browser);
