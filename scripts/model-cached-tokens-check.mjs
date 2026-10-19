/**
 * A model's page says how much of its input the provider served from cache.
 *
 * Azure caches a repeated prompt prefix, and Orknux booked none of it: the
 * Responses API's cached count was never read. The model's Token Breakdown now
 * has Cached Tokens beside Input, with the share - the number worth watching
 * on a model an agent loop calls over and over.
 *
 * Takes any model of the workspace and answers its usage here.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { models: workspaceModels } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE })
  .catch(() => ({ models: [] }));
const model = (workspaceModels ?? []).find((one) => one.kind === 'CHAT');
if (model === undefined) {
  record(false, 'the workspace has a chat model to look at');
} else {
  await page.route('**/graphql', async (route) => {
    const query = route.request().postDataJSON()?.query ?? '';
    if (!query.includes('modelUsage(')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const usage = json?.data?.modelUsage;
    if (usage) Object.assign(usage, { empty: false, requests: 10, inputTokens: 11000, cachedInputTokens: 9216, outputTokens: 50, totalTokens: 11050 });
    return route.fulfill({ response: answered, json });
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
  const figure = page.getByText('Cached Tokens', { exact: true }).locator('..');
  await figure.waitFor({ timeout: 20_000 }).catch(() => undefined);
  const said = (await figure.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
  record(said.includes('9,216') && said.includes('(84%)'), `the breakdown shows the cached input and its share (${said})`);
}

await finish(browser);
