/**
 * A chat model's page draws only the sampling settings its provider reads, and
 * Save stores them; the reasoning effort is the agent's, on the agent's page.
 *
 * The effort moved in V653: on the model, every agent sharing a deployment
 * shared it. The model page no longer draws it; an agent whose model's
 * provider takes one offers exactly the words it takes, and stores the one
 * chosen.
 *
 * Asked for as provider-specific settings, like the image parameters: the
 * server declares what each provider reads (`chatModelParameters`) and the page
 * draws that and nothing else. An Azure OpenAI or an Ollama model gets
 * Temperature, Top P and Reasoning effort; a llama.cpp server behind the OpenAI
 * shape gets the three llama.cpp additions as well, and all of them read a
 * reasoning effort - ModelChatParametersTest holds the server's half of that,
 * and a provider that reads none is why the box can be absent at all. Measured
 * on which boxes are in the
 * DOM, and on what the server holds after Save. Makes its own providers on
 * `.invalid` hosts and removes them, with their models.
 */
import { BASE, WORKSPACE, open, record, drawn, finish, chooseOption, chosenOption, optionsOffered } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const stamp = Date.now();
const provider = async (name, type, endpoint) => (await graphql(
  `mutation($w: ID!, $n: String!, $t: ProviderType!, $e: String!) {
     createModelProvider(input: { workspaceId: $w, name: $n, type: $t, endpoint: $e }) { id }
   }`,
  { w: WORKSPACE, n: name, t: type, e: endpoint },
)).createModelProvider;
const model = async (providerId, name) => (await graphql(
  `mutation($p: ID!, $n: String!) { createModel(input: { providerId: $p, name: $n, modelId: "o4-mini", kind: CHAT }) { id } }`,
  { p: providerId, n: name },
)).createModel;

const SAMPLING = ['temperature', 'top-p', 'top-k', 'min-p', 'repeat-penalty', 'reasoning-effort'];
const agentMade = async (name, modelId) => (await graphql(
  `mutation($i: CreateAgentInput!) { createAgent(input: $i) { id name } }`,
  { i: { workspaceId: WORKSPACE, name, type: 'LLM' } },
)).createAgent;
let thinkerAgent = null;

/** Which of the sampling and reasoning boxes the page draws, once the provider's list has had time to arrive. */
async function drawnSettings(label) {
  record(await drawn(page, label), `${label} is on screen`);
  await page.locator('#temperature').waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1000);
  const present = [];
  for (const id of SAMPLING) if ((await page.locator(`#${id}`).count()) > 0) present.push(id);
  return present;
}

const azure = await provider(`zz sampling azure ${stamp}`, 'AZURE_OPENAI', 'https://example.invalid/v1');
const ollama = await provider(`zz sampling ollama ${stamp}`, 'OLLAMA', 'http://ollama.example.invalid:11434');
const local = await provider(`zz sampling llama ${stamp}`, 'OPENAI', 'http://llama.example.invalid:8080/v1');
const thinker = await model(azure.id, 'zz sampling azure model');
const gemma = await model(ollama.id, 'zz sampling ollama model');
const llama = await model(local.id, 'zz sampling llama model');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${thinker.id}`, { waitUntil: 'domcontentloaded' });
  const onAzure = await drawnSettings('the Azure model page');
  record(
    JSON.stringify(onAzure) === JSON.stringify(['temperature', 'top-p']),
    `the Azure model draws Temperature and Top P, and no Reasoning effort (${onAzure.join(',')})`,
  );

  // The effort is the agent's: an agent on that model offers exactly what its provider takes.
  thinkerAgent = await agentMade(`zz sampling agent ${stamp}`);
  await graphql(
    `mutation($id: ID!, $n: String!, $m: ID) { updateAgent(id: $id, input: { name: $n, modelId: $m }) { id } }`,
    { id: thinkerAgent.id, n: thinkerAgent.name, m: thinker.id },
  );
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${thinkerAgent.id}/settings`, { waitUntil: 'domcontentloaded' });
  const select = page.locator('[data-select]#agent-reasoning-effort');
  const there = await select.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, "the agent's page has a Reasoning effort for its model");
  if (there) {
    const offered = (await optionsOffered(page, select)).map((one) => one.value);
    record(
      JSON.stringify(offered) === JSON.stringify(['', 'minimal', 'low', 'medium', 'high']),
      `it offers default and the four efforts (${offered.join(',')})`,
    );
    record((await chosenOption(page, select)) === '', 'it opens on the default');
    await chooseOption(page, select, 'high');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.waitForTimeout(2000);
    const held = (await graphql(`query($id: ID!) { agent(id: $id) { reasoningEffort } }`, { id: thinkerAgent.id })).agent;
    record(held?.reasoningEffort === 'high', `the server holds high on the agent (${held?.reasoningEffort})`);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await select.waitFor({ timeout: 20_000 }).catch(() => undefined);
    record((await chosenOption(page, select).catch(() => '')) === 'high', 'and a reload draws it back');
  }

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${gemma.id}`, { waitUntil: 'domcontentloaded' });
  const onOllama = await drawnSettings('the Ollama model page');
  record(
    JSON.stringify(onOllama) === JSON.stringify(['temperature', 'top-p']),
    `the Ollama model draws Temperature and Top P only (${onOllama.join(',')})`,
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${llama.id}`, { waitUntil: 'domcontentloaded' });
  const onLlama = await drawnSettings('the llama.cpp model page');
  record(
    JSON.stringify(onLlama) === JSON.stringify(['temperature', 'top-p', 'top-k', 'min-p', 'repeat-penalty']),
    `a llama.cpp server behind the OpenAI shape draws all five sampling settings (${onLlama.join(',')})`,
  );
  if (onLlama.includes('top-k')) {
    await page.locator('#top-k').fill('40');
    await page.getByRole('button', { name: /^Save/ }).first().click();
    await page.getByText('Saved.', { exact: true }).waitFor({ timeout: 10_000 }).catch(() => undefined);
    const held = (await graphql(`query($id: ID!) { model(id: $id) { topK } }`, { id: llama.id })).model;
    record(held?.topK === 40, `its top-k is stored (${held?.topK})`);
  }
} finally {
  if (thinkerAgent !== null) await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: thinkerAgent.id }).catch(() => undefined);
  for (const one of [azure, ollama, local]) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
}
await finish(browser);
