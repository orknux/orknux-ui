/**
 * Whether a provider is sent the model's own earlier thinking.
 *
 * Echoing a reasoning model's thinking back is what some providers need and
 * others throw away - llama.cpp's Gemma template drops old thoughts, so all the
 * echo did there was change the text of the prompt. So it is a provider's
 * setting, off unless somebody turns it on.
 *
 * The server half is `ProviderSendsReasoningTest` (stored, defaulted, audited)
 * and `AgentToolCallTest` (what reaches the wire). What is here is that
 * somebody can reach it: the switch drawn on a new provider's form and off
 * there, off on a provider made without an opinion, and a press saved and read
 * back **off the server** and after a reload - never off the control the moment
 * after it was clicked, which a toggle that sends nothing would pass.
 *
 * Its own provider under a scratch name, pointed at a port nothing listens on,
 * removed at both ends of the run.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const SCRATCH = 'providerReasoningSwitchCheck';
const NOWHERE = 'http://127.0.0.1:9/v1';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listProviders = async () =>
  (
    await graphql(`query ($w: ID!) { modelProviders(workspaceId: $w) { id name sendsReasoning } }`, {
      w: WORKSPACE,
    })
  ).modelProviders;

async function sweep() {
  for (const one of (await listProviders()).filter((row) => row.name.startsWith(SCRATCH))) {
    await graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id });
  }
}

await sweep();

const toggle = page.locator('[data-testid="provider-reasoning-toggle"]');

/** The switch as the page has drawn it, after whatever load just happened. */
const drawnAs = async () => {
  await toggle.waitFor({ state: 'visible', timeout: 20_000 });
  const box = await toggle.boundingBox();
  return {
    on: (await toggle.getAttribute('aria-checked')) === 'true',
    said: (await toggle.evaluate((el) => el.parentElement.textContent))?.trim() ?? '',
    width: box?.width ?? 0,
  };
};

/* ------------------------------------------------- a new provider's form */

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
const fresh = await drawnAs();
record(fresh.width > 0, `the switch is drawn on a new provider's form (${fresh.width}px wide)`);
record(!fresh.on, `and starts off there (aria-checked ${fresh.on})`);
record(/left out|pomijane/i.test(fresh.said), `saying so in words beside it ("${fresh.said}")`);

/* ---------------------------------------- a provider made without an opinion */

const made = (
  await graphql(
    `mutation ($w: ID!, $name: String!, $endpoint: String!) {
       createModelProvider(input: { workspaceId: $w, name: $name, endpoint: $endpoint, secret: "sk-scratch" }) {
         id sendsReasoning
       }
     }`,
    { w: WORKSPACE, name: `${SCRATCH} gemma`, endpoint: NOWHERE },
  )
).createModelProvider;
record(made.sendsReasoning === false, `a provider made without an opinion is not sent thinking back (${made.sendsReasoning})`);

const stored = async () => (await listProviders()).find((one) => one.id === made.id) ?? null;

async function saveIt() {
  const button = page.getByRole('button', { name: 'Save Changes', exact: true });
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(1500);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${made.id}`, { waitUntil: 'domcontentloaded' });
const found = await drawnAs();
record(!found.on, `its page opens with the switch off, as the provider is (aria-checked ${found.on})`);

/* --------------------------------------------------------------------- on */

await toggle.click();
await saveIt();
const on = await stored();
record(on !== null && on.sendsReasoning === true, `pressing it and saving turns it on on the server (${on?.sendsReasoning})`);

await page.reload({ waitUntil: 'domcontentloaded' });
const reloaded = await drawnAs();
record(reloaded.on, `and the page comes back with it on (aria-checked ${reloaded.on})`);
record(/sent back|odsyłane/i.test(reloaded.said), `saying so in words ("${reloaded.said}")`);

await page.screenshot({ path: shot('provider-reasoning-switch.png') });

/* ------------------------------------------------------------- and back */

await toggle.click();
await saveIt();
const off = await stored();
record(off !== null && off.sendsReasoning === false, `it goes back off the same way (${off?.sendsReasoning})`);

await sweep();
record((await listProviders()).every((one) => !one.name.startsWith(SCRATCH)), 'the scratch provider is cleared up');

await finish(browser);
