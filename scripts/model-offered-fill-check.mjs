/**
 * Picking a model a llama.cpp server offers fills what the server said about it.
 *
 * The Add Model form asked for a context window and two prices for a model on
 * the person's own llama.cpp server, which knows the first and charges nothing.
 * The provider's listing now says both - `meta.n_ctx` and `owned_by: llamacpp` -
 * and choosing that model fills Context Window and puts 0 in both prices.
 * A field somebody has already typed is left as they typed it.
 *
 * Canned: the provider's listing is answered here, so any provider the
 * workspace has will do and nothing is added.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('discoveredModels')) return route.continue();
  return route.fulfill({
    json: {
      data: {
        discoveredModels: [
          { modelId: '/models/gemma-4-31B-it-Q4_K_M.gguf', added: false, contextWindow: 262144, selfHosted: true },
          { modelId: 'hosted-model', added: false, contextWindow: null, selfHosted: false },
        ],
      },
    },
  });
});

const openDialog = async () => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '+ Add Model' }).click({ timeout: 20_000 });
  await page.locator('#model-offered').waitFor({ timeout: 15_000 });
};
const value = (id) => page.locator(id).inputValue();

await openDialog();
await page.locator('#model-offered').selectOption('/models/gemma-4-31B-it-Q4_K_M.gguf');
await page.waitForTimeout(200);
record((await value('#model-context')) === '262144', `the context window is the server's (${await value('#model-context')})`);
record(
  (await value('#model-input-cost')) === '0' && (await value('#model-output-cost')) === '0',
  `a model the llama.cpp server is itself costs nothing (${await value('#model-input-cost')} / ${await value('#model-output-cost')})`,
);

// A model the listing says nothing about fills nothing; what was typed stays.
await openDialog();
await page.locator('#model-context').fill('8000');
await page.locator('#model-offered').selectOption('hosted-model');
await page.waitForTimeout(200);
record(
  (await value('#model-context')) === '8000' && (await value('#model-input-cost')) === '',
  `a field somebody typed is left, and a listing that says nothing fills nothing (${await value('#model-context')}, "${await value('#model-input-cost')}")`,
);

await finish(browser);
