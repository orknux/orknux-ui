/**
 * A model's page links to its provider.
 *
 * Reported: the model page named its provider in a select and offered no way
 * there, so somebody chasing a rate limit had to go back to the list to find
 * the provider's endpoint, key and limits. What is asserted is what is drawn -
 * the link on screen beside the Provider label - and where it goes.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open();

const models = await graphql(`query { models(workspaceId: ${WORKSPACE}) { id providerId } }`)
  .then((d) => d.models ?? [])
  .catch(() => []);
const model = models[0];
record(model !== undefined, 'there is a model to open');

if (model) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
  const link = page.getByTestId('model-provider-link');
  const shown = await link.waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
  record(shown, 'an Open provider link is drawn beside the Provider label');
  if (shown) {
    const box = await link.boundingBox();
    const label = await page.locator('label[for="model-provider"]').boundingBox();
    record(
      box !== null && label !== null && Math.abs(box.y - label.y) < label.height * 2,
      'and it sits on the label\'s line',
    );
    record(
      (await link.getAttribute('href')) === `/workspace/${WORKSPACE}/models/providers/${model.providerId}`,
      `and it points at the model's own provider (${await link.getAttribute('href')})`,
    );
    await link.click();
    await page.waitForURL(`**/models/providers/${model.providerId}`, { timeout: 15_000 }).catch(() => undefined);
    record(page.url().endsWith(`/models/providers/${model.providerId}`), 'clicking it opens the provider');
  }
}

await finish(browser);
