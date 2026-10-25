/**
 * How many tools one request to a provider carries, and that no provider offers
 * every tool up front unless somebody switched it on.
 *
 * All tools up front is off by default for every type; its switch and the
 * join switch beside it are `provider-tool-loading-check`'s.
 *
 * The server half is `ProviderToolCeilingTest` (what reaches the wire, the cap,
 * the defaults). What is here is that somebody can reach the
 * cap: empty under the type's number, a number typed saved and read back **off
 * the server** and after a reload, and cleared back to the type's.
 *
 * Its own providers under a scratch name, pointed at a port nothing listens
 * on, removed at both ends of the run.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const SCRATCH = 'providerToolCapCheck';
const NOWHERE = 'http://127.0.0.1:9/v1';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listProviders = async () =>
  (
    await graphql(`query ($w: ID!) { modelProviders(workspaceId: $w) { id name offersAllTools maxTools toolCap } }`, {
      w: WORKSPACE,
    })
  ).modelProviders;

async function sweep() {
  for (const one of (await listProviders()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id });
  }
}

await sweep();

const cap = page.locator('#provider-max-tools');

const drawnAs = async () => {
  await cap.waitFor({ state: 'visible', timeout: 20_000 });
  return {
    cap: await cap.inputValue(),
    placeholder: (await cap.getAttribute('placeholder')) ?? '',
    allTools: (await page.locator('[data-testid="provider-all-tools-toggle"]').getAttribute('aria-checked')) === 'true',
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

/* ------------------------------------- no provider offers them all by default */

const ollama = await make('OLLAMA');
const openai = await make('OPENAI');
const anthropic = await make('ANTHROPIC');
record(
  [ollama, openai, anthropic].every((one) => one.offersAllTools === false),
  `no type offers every tool up front by default (${[ollama, openai, anthropic].map((one) => one.offersAllTools).join(', ')})`,
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${openai.id}`, { waitUntil: 'domcontentloaded' });
const fresh = await drawnAs();
record(!fresh.allTools, `the provider's page draws All tools up front off (${fresh.allTools})`);
record(
  fresh.cap === '' && fresh.placeholder === String(openai.toolCap),
  `its cap is empty, showing the type's ${openai.toolCap} (${fresh.cap} / ${fresh.placeholder})`,
);

/* ----------------------------------------------------------- a cap typed */

await cap.fill('40');
await saveIt();
const set = await stored(openai.id);
record(
  set !== null && set.maxTools === 40 && set.toolCap === 40 && set.offersAllTools === false,
  `typing 40 saves it on the server (${JSON.stringify(set)})`,
);

await page.reload({ waitUntil: 'domcontentloaded' });
const reloaded = await drawnAs();
record(reloaded.cap === '40', `and the page comes back that way (cap ${reloaded.cap})`);

/* ------------------------------------------------- back to the default */

await cap.fill('');
await saveIt();
const back = await stored(openai.id);
record(
  back !== null && back.maxTools === null && back.toolCap === openai.toolCap,
  `an empty cap puts it back under the type (${JSON.stringify(back)})`,
);

await sweep();
record((await listProviders()).every((one) => !one.name.startsWith(SCRATCH)), 'the scratch providers are cleared up');

await finish(browser);
