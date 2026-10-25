/**
 * How an agent on a provider reaches the tools it does not carry from the
 * start: All tools up front, and whether a tool it loads joins the tool list at
 * its next turn.
 *
 * Joining is what lets a model call a loaded tool by its own name - llama.cpp
 * lets it write only the names the list declares - and on llama.cpp it costs a
 * whole conversation read again at the turn after every load, because its chat
 * template writes the tools at the top of the prompt. So it is off there by
 * default and on for every other type, and switched on there it says what it
 * costs, in one line, with the way round it. All tools up front is off for
 * every type.
 *
 * The server half is `ProviderToolCeilingTest` (defaults, the fields round
 * trip) and `StablePromptOnLoadTest` (what reaches the wire, and what the model
 * is told). What is here is what the page draws: each switch's default per
 * type, the warning only on llama.cpp and only with the join on, and both
 * switches saved and read back **off the server** and after a reload.
 *
 * Its own providers under a scratch name, pointed at a port nothing listens
 * on, removed at both ends of the run.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const SCRATCH = 'providerToolLoadingCheck';
const NOWHERE = 'http://127.0.0.1:9/v1';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listProviders = async () =>
  (
    await graphql(
      `query ($w: ID!) { modelProviders(workspaceId: $w) { id name type offerAllTools offersAllTools joinLoadedTools joinsLoadedTools } }`,
      { w: WORKSPACE },
    )
  ).modelProviders;

async function sweep() {
  for (const one of (await listProviders()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id });
  }
}

await sweep();

const allTools = page.locator('[data-testid="provider-all-tools-toggle"]');
const join = page.locator('[data-testid="provider-join-tools-toggle"]');
const warning = page.locator('[data-testid="provider-join-tools-warning"]');

/** Both switches and the warning as the page has drawn them. */
const drawnAs = async () => {
  await join.waitFor({ state: 'visible', timeout: 20_000 });
  await allTools.waitFor({ state: 'visible', timeout: 20_000 });
  const warned = (await warning.count()) > 0 ? await warning.boundingBox() : null;
  return {
    allTools: (await allTools.getAttribute('aria-checked')) === 'true',
    join: (await join.getAttribute('aria-checked')) === 'true',
    warning: warned && warned.height > 0 ? ((await warning.textContent()) ?? '').trim() : null,
    // The lines its text is drawn on: one rectangle per line of a range over it.
    lines: warned
      ? await warning.evaluate((el) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
        })
      : 0,
  };
};

const make = async (type) =>
  (
    await graphql(
      `mutation ($w: ID!, $name: String!, $endpoint: String!, $type: ProviderType) {
         createModelProvider(input: { workspaceId: $w, name: $name, endpoint: $endpoint, secret: "sk-scratch", type: $type }) {
           id offersAllTools joinsLoadedTools joinLoadedTools
         }
       }`,
      { w: WORKSPACE, name: `${SCRATCH} ${type}`, endpoint: NOWHERE, type },
    )
  ).createModelProvider;

const stored = async (id) => (await listProviders()).find((one) => one.id === id) ?? null;

async function saveIt() {
  const button = page.getByRole('button', { name: 'Save Changes', exact: true });
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(1500);
}

const visit = async (id) => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${id}`, { waitUntil: 'domcontentloaded' });
  return drawnAs();
};

/* ------------------------------------------------------- defaults per type */

for (const type of ['OPENAI', 'ANTHROPIC', 'OLLAMA']) {
  const made = await make(type);
  const drawn = await visit(made.id);
  record(
    made.joinsLoadedTools === true && made.joinLoadedTools === null && made.offersAllTools === false,
    `a ${type} provider made without an opinion joins loaded tools and does not offer all of them up front (server: ${JSON.stringify(made)})`,
  );
  record(drawn.join && !drawn.allTools, `its page draws the join on and All tools up front off (${JSON.stringify(drawn)})`);
  record(drawn.warning === null, `with no warning beside the join, ${type} not being llama.cpp ("${drawn.warning}")`);
}

const llama = await make('LLAMA_CPP');
record(
  llama.joinsLoadedTools === false && llama.joinLoadedTools === null && llama.offersAllTools === false,
  `a llama.cpp provider made without an opinion does not join loaded tools (server: ${JSON.stringify(llama)})`,
);
const llamaFresh = await visit(llama.id);
record(!llamaFresh.join && !llamaFresh.allTools, `its page draws both switches off (${JSON.stringify(llamaFresh)})`);
record(llamaFresh.warning === null, `and no warning while the join is off ("${llamaFresh.warning}")`);

/* ------------------------------------------------ the join on, on llama.cpp */

await join.click();
const pressed = await drawnAs();
record(pressed.join, `pressing the join turns it on (aria-checked ${pressed.join})`);
record(
  pressed.warning !== null &&
    /re-reads the whole conversation|czyta całą rozmowę od nowa/i.test(pressed.warning) &&
    /All tools up front|Wszystkie narzędzia od razu/.test(pressed.warning),
  `and the warning says what it costs and the way round it ("${pressed.warning}")`,
);
record(pressed.lines === 1, `on one line (${pressed.lines})`);

await page.screenshot({ path: shot('provider-tool-loading.png') });

await saveIt();
const joined = await stored(llama.id);
record(
  joined !== null && joined.joinLoadedTools === true && joined.joinsLoadedTools === true,
  `saving keeps the join on, on the server (${JSON.stringify(joined)})`,
);
const reloaded = await visit(llama.id);
record(reloaded.join && reloaded.warning !== null, `and the page comes back with it on and the warning shown (${JSON.stringify(reloaded)})`);

/* ----------------------------------------------------- All tools up front */

await allTools.click();
await saveIt();
const offered = await stored(llama.id);
record(
  offered !== null && offered.offerAllTools === true && offered.offersAllTools === true,
  `pressing All tools up front and saving turns it on on the server (${JSON.stringify(offered)})`,
);
const again = await visit(llama.id);
record(again.allTools, `and the page comes back with it on (aria-checked ${again.allTools})`);

/* --------------------------------------------------------------- and back */

await join.click();
await allTools.click();
await saveIt();
const back = await stored(llama.id);
record(
  back !== null && back.joinsLoadedTools === false && back.offersAllTools === false,
  `both go back off the same way (${JSON.stringify(back)})`,
);
const backDrawn = await drawnAs();
record(backDrawn.warning === null, `and the warning goes with the join ("${backDrawn.warning}")`);

await sweep();
record((await listProviders()).every((one) => !one.name.startsWith(SCRATCH)), 'the scratch providers are cleared up');

await finish(browser);
