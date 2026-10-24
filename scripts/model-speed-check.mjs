/**
 * The speeds a provider reports - how fast it read the prompt and wrote the
 * answer - drawn on a session's page and on a model's page, and nothing drawn
 * where the provider reported none.
 *
 * llama.cpp answers a `timings` object on every completion; OpenAI, vLLM and
 * the rest do not. The server keeps each call's figures and averages them by
 * tokens (ModelSpeedTest). The session page draws the average beside what the
 * session cost and lists each call in a Speeds panel; the model page draws its
 * average over its newest calls under Usage Metrics.
 *
 * The session and the model's speed are stubbed - a speed exists because a
 * llama.cpp server answered, and nothing here can make one answer - and the
 * fields are asked of the running server for their contract. Takes any chat
 * model of the workspace. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const fields = async (type) =>
  ((await graphql(`query { __type(name: "${type}") { fields { name } } }`).catch(() => null))?.__type?.fields ?? []).map((one) => one.name);
record((await fields('LlmSession')).includes('speed'), "the server answers a session's speed");
record((await fields('LlmSession')).includes('modelCalls'), "and its calls");
record((await fields('Model')).includes('speed'), "and a model's speed");

const AT = '2026-10-24T09:00:00Z';
const SPEED = { calls: 2, promptTokensPerSecond: 2666.666, generatedTokensPerSecond: 66.666 };
const CALLS = [
  {
    id: '2', at: AT, inputTokens: 3000, outputTokens: 160, millis: 3200,
    promptTokens: 3000, promptTokensPerSecond: 3000, generatedTokens: 160, generatedTokensPerSecond: 80,
  },
  {
    id: '1', at: AT, inputTokens: 1200, outputTokens: 40, millis: 1600,
    promptTokens: 1000, promptTokensPerSecond: 2000, generatedTokens: 40, generatedTokensPerSecond: 40,
  },
];
const SESSION = {
  id: '9006', key: 'zz-speed-check', keyPrefix: 'zz', workspaceId: WORKSPACE, eventCount: 1, createdAt: AT, lastEventAt: AT,
  active: false, subagentCount: 0, notes: [],
  spent: { inputTokens: 4200, outputTokens: 200, cachedInputTokens: 200, cost: null, partlyUnpriced: true },
  speed: SPEED, modelCalls: CALLS,
};
const EVENTS = [{ id: 1, kind: 'AGENT', actor: 'Builder', content: 'Done.', result: null, millis: null, at: AT }];

async function showSession() {
  await page.unroute('**/graphql').catch(() => undefined);
  await page.route('**/graphql', async (route) => {
    const body = route.request().postData() ?? '';
    const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (body.includes('llmSessionEvents')) return answer({ llmSessionEvents: { totalElements: 1, totalPages: 1, content: EVENTS } });
    if (body.includes('llmSession(')) return answer({ llmSession: SESSION });
    return route.continue();
  });
  await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${SESSION.id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2_500);
}

/* ---- The session page: the average beside the cost, and each call in the panel. */

await showSession();
const meter = page.locator('[data-session-speed]');
record(await meter.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), 'the session page shows its speed');
const figures = await page.evaluate(() =>
  Object.fromEntries(
    [...document.querySelectorAll('[data-session-speed] [data-speed]')].map((one) => [
      one.getAttribute('data-speed'),
      [...one.children].map((part) => part.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean),
    ]),
  ),
);
console.log(JSON.stringify(figures));
record(JSON.stringify(figures.prompt) === JSON.stringify(['Prompt speed', '2,667 tok/s']), `the prompt speed, labelled (${figures.prompt})`);
record(JSON.stringify(figures.generated) === JSON.stringify(['Generation speed', '66.7 tok/s']), `the generation speed, labelled (${figures.generated})`);

/* One row of two figures, as the cost strip is, not the labels and values wrapped apart. */
const strip = await meter.boundingBox().catch(() => null);
record(strip !== null && strip.height > 0 && strip.height < 90, `the speed strip is drawn as one row (${strip?.height}px high)`);

// The summary in the header is the whole of it: no panel listing every call beside the session.
record((await page.locator('[data-session-speeds]').count()) === 0, 'no per-call Speeds panel beside the session, only the summary in its header');

/* ---- A provider that reports nothing: no strip, no panel. */

SESSION.speed = null;
SESSION.modelCalls = [];
await showSession();
await page.locator('[data-session-spend]').waitFor({ timeout: 15_000 }).catch(() => undefined);
record((await page.locator('[data-session-speed]').count()) === 0, 'a session no call reported a speed for draws no speed');

/* ---- The model page. */

const { models: workspaceModels } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE })
  .catch(() => ({ models: [] }));
const model = (workspaceModels ?? []).find((one) => one.kind === 'CHAT');
if (model === undefined) {
  record(false, 'the workspace has a chat model to look at');
} else {
  async function showModel(speed) {
    await page.unroute('**/graphql').catch(() => undefined);
    await page.route('**/graphql', async (route) => {
      const query = route.request().postDataJSON()?.query ?? '';
      if (!query.includes('query ModelSpeed')) return route.continue();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { model: { speed } } }) });
    });
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${model.id}`, { waitUntil: 'domcontentloaded' });
    await page.getByText('Usage Metrics', { exact: true }).waitFor({ timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1_500);
  }

  await showModel(SPEED);
  const block = page.locator('[data-model-speed]');
  record(await block.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false), "the model page shows its speed");
  const said = ((await block.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
  record(said.includes('Speed over the last 2 calls'), `over how many calls (${said})`);
  record(said.includes('Prompt speed') && said.includes('2,667 tok/s'), `the prompt speed (${said})`);
  record(said.includes('Generation speed') && said.includes('66.7 tok/s'), `the generation speed (${said})`);
  const drawn = await block.boundingBox().catch(() => null);
  record(drawn !== null && drawn.height > 0 && drawn.width > 0, `and it is drawn (${drawn?.width}x${drawn?.height})`);

  await showModel(null);
  record((await page.locator('[data-model-speed]').count()) === 0, 'a model no call reported a speed for draws none');
}

await finish(browser);
