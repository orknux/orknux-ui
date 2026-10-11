/**
 * Whether a provider hands an agent every tool up front, and how many one
 * request carries.
 *
 * A local server reuses the prompt a request begins with, and the tools sit
 * near its top: a tool loaded part way through a turn changed that beginning,
 * and llama.cpp read a long session again after every tool_load. So a provider
 * can offer every tool from the first round - on by default for Ollama and
 * OpenAI, whose type also covers llama.cpp - and
 * says how many one request may carry.
 *
 * The server half is `ProviderOfferAllToolsTest` (what reaches the wire, the
 * defaults, the cap). What is here is that somebody can reach it: the switch
 * following the type's default until pressed, a press and a cap saved and read
 * back **off the server** and after a reload, and Use the default putting the
 * switch back under the type.
 *
 * Its own providers under a scratch name, pointed at a port nothing listens
 * on, removed at both ends of the run.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const SCRATCH = 'providerAllToolsCheck';
const NOWHERE = 'http://127.0.0.1:9/v1';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listProviders = async () =>
  (
    await graphql(`query ($w: ID!) { modelProviders(workspaceId: $w) { id name offerAllTools offersAllTools maxTools toolCap } }`, {
      w: WORKSPACE,
    })
  ).modelProviders;

async function sweep() {
  for (const one of (await listProviders()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id });
  }
}

await sweep();

const toggle = page.locator('[data-testid="provider-all-tools-toggle"]');
const cap = page.locator('#provider-max-tools');

const drawnAs = async () => {
  await toggle.waitFor({ state: 'visible', timeout: 20_000 });
  return {
    on: (await toggle.getAttribute('aria-checked')) === 'true',
    said: (await toggle.evaluate((el) => el.parentElement.textContent))?.trim() ?? '',
    cap: await cap.inputValue(),
    placeholder: (await cap.getAttribute('placeholder')) ?? '',
  };
};

const make = async (type) =>
  (
    await graphql(
      `mutation ($w: ID!, $name: String!, $endpoint: String!, $type: ProviderType) {
         createModelProvider(input: { workspaceId: $w, name: $name, endpoint: $endpoint, secret: "sk-scratch", type: $type }) {
           id offersAllTools toolCap
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

/* ------------------------------------------------- the type's default */

const ollama = await make('OLLAMA');
const openai = await make('OPENAI');
const anthropic = await make('ANTHROPIC');
record(ollama.offersAllTools === true, `an Ollama provider made without an opinion offers every tool (${ollama.offersAllTools})`);
record(openai.offersAllTools === true, `so does an OpenAI one, the type llama.cpp is reached through (${openai.offersAllTools})`);
record(anthropic.offersAllTools === false, `an Anthropic one does not (${anthropic.offersAllTools})`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${ollama.id}`, { waitUntil: 'domcontentloaded' });
const fresh = await drawnAs();
record(fresh.on, `the Ollama provider's page opens with the switch on (aria-checked ${fresh.on})`);
record(/default/i.test(fresh.said), `and says it is the type's default ("${fresh.said}")`);
record(fresh.cap === '' && fresh.placeholder === '128', `its cap is empty, showing the type's 128 (${fresh.cap} / ${fresh.placeholder})`);

/* --------------------------------------------- pressed, and a cap typed */

await toggle.click();
await cap.fill('40');
await saveIt();
const off = await stored(ollama.id);
record(
  off !== null && off.offerAllTools === false && off.offersAllTools === false && off.maxTools === 40 && off.toolCap === 40,
  `pressing it and typing 40 saves both on the server (${JSON.stringify(off)})`,
);

await page.reload({ waitUntil: 'domcontentloaded' });
const reloaded = await drawnAs();
record(!reloaded.on && reloaded.cap === '40', `and the page comes back that way (on ${reloaded.on}, cap ${reloaded.cap})`);

/* ------------------------------------------------- back to the default */

await page.locator('[data-testid="provider-all-tools-default"]').click();
await cap.fill('');
await saveIt();
const back = await stored(ollama.id);
record(
  back !== null && back.offerAllTools === null && back.offersAllTools === true && back.maxTools === null,
  `Use the default and an empty cap put it back under the type (${JSON.stringify(back)})`,
);

await sweep();
record((await listProviders()).every((one) => !one.name.startsWith(SCRATCH)), 'the scratch providers are cleared up');

await finish(browser);
