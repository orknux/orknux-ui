/**
 * Which API an Azure OpenAI provider's chats go through, chosen on its page.
 *
 * Azure's chat completions refuse a reasoning model its tools, so an Azure
 * provider now speaks the Responses API by default - and keeps chat completions
 * on a select, so an installation can go back to the old road the day the new
 * one misbehaves, without waiting for a release. The server half is
 * `ProviderChatApiTest` and `OpenAiResponsesTest`: what is stored, what is
 * refused, and where each choice sends a chat. What no server test can say is
 * whether anybody can reach the choice, so that is what is here.
 *
 * Three things are asserted. The select is drawn for an Azure provider and for
 * no other type, because every other type has no choice to make and the server
 * refuses one. It opens on what the provider holds. And choosing the old road
 * and saving stores it - read back off the server and after a reload, never off
 * the control just after it was changed, since a select that paints itself and
 * sends nothing looks exactly like one that works until the page is reloaded.
 *
 * Its own providers, under scratch names, pointed at hosts that cannot resolve,
 * removed at both ends of the run in case one was killed halfway.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

/** Nobody's provider is called this. The sweep is by prefix. */
const SCRATCH = 'providerChatApiCheck';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listProviders = async () =>
  (
    await graphql(`query ($w: ID!) { modelProviders(workspaceId: $w) { id name type chatApi } }`, {
      w: WORKSPACE,
    })
  ).modelProviders;

const removeProvider = (id) => graphql(`mutation ($id: ID!) { removeModelProvider(id: $id) }`, { id });

async function sweep() {
  for (const one of (await listProviders()).filter((row) => row.name.startsWith(SCRATCH))) {
    await removeProvider(one.id);
  }
}

const make = async (name, type, endpoint) =>
  (
    await graphql(
      `mutation ($w: ID!, $name: String!, $type: ProviderType!, $endpoint: String!) {
         createModelProvider(input: {
           workspaceId: $w, name: $name, type: $type, endpoint: $endpoint, secret: "sk-scratch", checkEnabled: false
         }) { id chatApi }
       }`,
      { w: WORKSPACE, name, type, endpoint },
    )
  ).createModelProvider;

const stored = async (id) => (await listProviders()).find((one) => one.id === id) ?? null;

await sweep();

const azure = await make(`${SCRATCH} azure`, 'AZURE_OPENAI', 'https://scratch.openai.azure.invalid');
const plain = await make(`${SCRATCH} plain`, 'OPENAI', 'https://scratch.example.invalid/v1');

record(azure.chatApi === 'RESPONSES', `an Azure provider starts on Responses (${azure.chatApi})`);
record(plain.chatApi === null, `any other type holds no chat API (${plain.chatApi})`);

const select = page.locator('#chat-api');

/** The page for a provider, loaded afresh, with its form drawn. */
async function load(id) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#provider-endpoint').waitFor({ state: 'visible', timeout: 20_000 });
}

async function saveIt() {
  const button = page.getByRole('button', { name: 'Save Changes', exact: true });
  await button.waitFor({ state: 'visible', timeout: 20_000 });
  await button.click();
  await page.waitForTimeout(1500);
}

/* ------------------------------------------------ drawn for Azure alone */

await load(plain.id);
record((await select.count()) === 0, 'an OpenAI provider is offered no choice of API');

await load(azure.id);
await select.waitFor({ state: 'visible', timeout: 20_000 });
const box = await select.boundingBox();
record(box !== null && box.width > 0 && box.height > 0, `an Azure provider's page draws the API select (${JSON.stringify(box)})`);
record((await select.inputValue()) === 'RESPONSES', `and it opens on what the provider holds (${await select.inputValue()})`);
const offered = await select.locator('option').evaluateAll((options) => options.map((option) => option.value));
record(
  JSON.stringify(offered) === JSON.stringify(['RESPONSES', 'CHAT_COMPLETIONS']),
  `offering Responses and chat completions (${offered.join(', ')})`,
);

/* ------------------------------------------------ the old road, saved */

await select.selectOption('CHAT_COMPLETIONS');
await saveIt();

const back = await stored(azure.id);
record(
  back !== null && back.chatApi === 'CHAT_COMPLETIONS',
  `choosing chat completions and saving stores it on the server, not only on the screen (${back?.chatApi})`,
);

await load(azure.id);
await select.waitFor({ state: 'visible', timeout: 20_000 });
record(
  (await select.inputValue()) === 'CHAT_COMPLETIONS',
  `and the page comes back with it chosen (${await select.inputValue()})`,
);

await page.screenshot({ path: shot('provider-chat-api.png') });

/* ------------------------------------------------ and forward again */

await select.selectOption('RESPONSES');
await saveIt();
const forward = await stored(azure.id);
record(forward !== null && forward.chatApi === 'RESPONSES', `it goes back to Responses the same way (${forward?.chatApi})`);

/*
 * A save of the other type sends no choice. The server refuses one there, so a
 * form that always sent it would be a form that could not save an OpenAI
 * provider at all.
 */
await load(plain.id);
await saveIt();
const plainAfter = await stored(plain.id);
record(plainAfter !== null && plainAfter.chatApi === null, `an OpenAI provider still saves, and still holds none (${plainAfter?.chatApi})`);

await sweep();
record((await listProviders()).every((one) => !one.name.startsWith(SCRATCH)), 'the scratch providers are cleared up');

await finish(browser);
