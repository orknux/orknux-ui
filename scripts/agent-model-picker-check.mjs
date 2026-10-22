/**
 * The agent's Model field says whose model each row is.
 *
 * It was a native select, and an `<option>` is one line of plain text holding
 * the model's name - so two providers serving a model of the same name drew two
 * identical rows, and which one an agent was pointed at was a guess. The field
 * is the application's own list now, and every row carries its provider's name.
 *
 * What is measured is what is drawn: both rows in the open list, each with its
 * own provider's name beside the shared model name, the second one picked by a
 * click, and the agent as the server then holds it pointing at that model's id
 * rather than the first's. The trigger has to name the provider as well, or the
 * closed field is the same guess the list used to be.
 *
 * Everything lives in a scratch workspace of its own, deleted at the end.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const SCRATCH = 'zzModelPickerScratch';
const MODEL_NAME = 'twin-model';
const FIRST = 'zzPicker Alpha';
const SECOND = 'zzPicker Beta';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/** A workspace an earlier killed run left behind, by name. */
async function sweep() {
  const { workspaces } = await graphql(`query { workspaces(page: 0, size: 500) { content { id name } } }`);
  for (const old of workspaces.content.filter((one) => one.name === SCRATCH)) {
    await graphql(`mutation ($id: ID!) { deleteWorkspace(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`NOTE: swept workspace ${old.name} (#${old.id}) from an earlier run`);
  }
}

let workspace = null;
try {
  await sweep();
  workspace = String(
    (
      await graphql(`mutation ($input: CreateWorkspaceInput!) { createWorkspace(input: $input) { id } }`, {
        input: { name: SCRATCH },
      })
    ).createWorkspace.id,
  );

  /** One provider, and a chat model under it called what the other's is called. */
  async function providerWithTwin(name) {
    const provider = (
      await graphql(`mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
        input: { workspaceId: workspace, name, type: 'OPENAI', endpoint: 'https://picker.invalid', secret: 'sk-check' },
      })
    ).createModelProvider;
    const model = (
      await graphql(`mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
        input: { providerId: provider.id, name: MODEL_NAME, modelId: MODEL_NAME, kind: 'CHAT' },
      })
    ).createModel;
    return String(model.id);
  }
  const firstModel = await providerWithTwin(FIRST);
  const secondModel = await providerWithTwin(SECOND);

  const agent = (
    await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`, {
      w: workspace,
      n: 'zz picker agent',
    })
  ).createAgent;

  await page.goto(`${BASE}/workspace/${workspace}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
  const trigger = page.locator('#agent-model');
  await trigger.waitFor({ state: 'visible', timeout: 20_000 });
  record(
    (await page.locator('label[for="agent-model"]').count()) === 1 &&
      (await trigger.evaluate((node) => node.tagName)) === 'BUTTON',
    'the Model label names the picker, and the picker is the application’s own button',
  );

  await trigger.click();
  const menu = page.locator('[data-model-menu="agent-model"]');
  await menu.locator(`[role="option"][data-value="${secondModel}"]`).waitFor({ timeout: 20_000 }).catch(() => undefined);

  const rows = await menu.locator('[role="option"]').evaluateAll((all) =>
    all.map((one) => {
      const box = one.getBoundingClientRect();
      return {
        value: one.getAttribute('data-value'),
        name: one.querySelector('[data-model-name]')?.textContent ?? one.textContent,
        provider: one.querySelector('[data-model-provider]')?.textContent ?? null,
        drawn: box.width > 0 && box.height > 0,
      };
    }),
  );
  const twins = rows.filter((one) => one.name === MODEL_NAME);
  record(twins.length === 2 && twins.every((one) => one.drawn), `both ${MODEL_NAME} rows are drawn (${JSON.stringify(rows)})`);
  const first = twins.find((one) => one.value === firstModel);
  const second = twins.find((one) => one.value === secondModel);
  record(first?.provider === FIRST, `the first carries its own provider's name (${first?.provider})`);
  record(second?.provider === SECOND, `the second carries its own provider's name (${second?.provider})`);
  record(rows[0]?.value === '' && rows[0]?.provider === null, `and the list still starts with None (${rows[0]?.name})`);

  await menu.locator(`[role="option"][data-value="${secondModel}"]`).click();
  record((await menu.count()) === 0, 'picking a row closes the list');
  const said = await trigger.locator('[data-model-provider]').textContent().catch(() => null);
  record(said === SECOND, `the closed field names the chosen model's provider (${said})`);

  await page.locator('button[type="submit"]').click();
  await page.waitForTimeout(2500);
  const stored = await graphql(`query ($id: ID!) { agent(id: $id) { modelId } }`, { id: agent.id });
  record(String(stored.agent.modelId) === secondModel, `the saved agent points at the second model (${stored.agent.modelId}, wanted ${secondModel})`);

  // The keyboard: Escape closes without changing anything.
  await trigger.focus();
  await page.keyboard.press('ArrowDown');
  await menu.waitFor({ timeout: 5_000 }).catch(() => undefined);
  const openedByKey = (await menu.count()) === 1;
  await page.keyboard.press('Escape');
  record(openedByKey && (await menu.count()) === 0, 'an arrow opens the list and Escape closes it');
  record((await trigger.getAttribute('data-value')) === secondModel, 'and leaves the choice as it was');
} catch (cause) {
  record(false, `the check could not run to the end: ${cause?.message ?? cause}`);
} finally {
  if (workspace !== null) {
    await graphql(`mutation ($id: ID!) { deleteWorkspace(id: $id) }`, { id: workspace }).catch(() => undefined);
  }
}

await finish(browser);
