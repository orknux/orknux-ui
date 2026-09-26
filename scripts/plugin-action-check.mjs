/**
 * An action pointed at a block a plugin declares. Issue #438.
 *
 * A plugin's fourth surface: `actions()` declares blocks a workflow's Action
 * node runs, handed their wired inputs as one object. The action form offers
 * them under one subtype, Plugin Action, as a picker and nothing to fill in -
 * what the block takes and hands on is its declaration, which the server reads
 * off the plugin and the form draws under the picker so somebody choosing can
 * see what a node pointed at it will take.
 *
 * Driven end to end: the subtype chosen, the block picked, the declaration
 * read off the form, the action saved, and read back off both the server and
 * the page. The admin plugin row has to name the block too, and the last leg
 * is the one worth the check: the plugin is unloaded and the action's page has
 * to say so, rather than draw a picker nobody filled in.
 *
 * The plugin is this check's own, shaped exactly as Slack's `respond` is -
 * four inputs of which one is optional, an array among them, two outputs - so
 * it runs on an installation that has never seen Slack. It is unloaded at the
 * end, and a row an earlier killed run left behind is swept at the start, as
 * is the action.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

/** Nobody's plugin is called this. The sweep is by key. */
const KEY = 'zzactionscratch';
const NAME = `zz Plugin Action ${Date.now()}`;

const SOURCE = `export default class Scratch extends OrknuxPlugin {
  id() { return '${KEY}'; }
  apiVersion() { return 1; }
  actions() {
    return [
      {
        name: 'respond',
        label: 'Respond in Scratch',
        description: 'Posts text somewhere, in a thread when one is wired.',
        parameters: [
          { name: 'commands', type: 'array', description: 'The slash commands the trigger heard.' },
          { name: 'channel', type: 'string', description: 'Where to post.' },
          { name: 'threadTs', type: 'string', required: false, description: 'The thread to answer in.' },
          { name: 'text', type: 'string', description: 'What to say.' },
        ],
        outputs: [
          { name: 'ts', type: 'string', description: 'The new message\\'s timestamp.' },
          { name: 'channel', type: 'string', description: 'The channel it landed in.' },
        ],
        run: (input) => ({ ts: '1.0', channel: input.channel }),
      },
    ];
  }
}
`;

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const unloadMine = async () => {
  const { plugins } = await graphql(`query { plugins { id key } }`);
  const mine = plugins.find((one) => one.key === KEY);
  if (mine === undefined) return false;
  await graphql(`mutation ($id: ID!) { unloadPlugin(id: $id) }`, { id: mine.id });
  return true;
};

const actionsNamed = async (prefix) =>
  (
    await graphql(
      `query ($workspaceId: ID!) {
         workspaceActions(workspaceId: $workspaceId, page: 0, size: 200) { content { id name } }
       }`,
      { workspaceId: WORKSPACE },
    )
  ).workspaceActions.content.filter((row) => row.name.startsWith(prefix));

const deleteAction = (id) => graphql(`mutation ($id: ID!) { deleteAction(id: $id) }`, { id }).catch(() => undefined);

if (await unloadMine()) console.log('NOTE: swept a scratch plugin from an earlier run');
for (const old of await actionsNamed('zz Plugin Action')) {
  await deleteAction(old.id);
  console.log(`NOTE: swept action ${old.name} (#${old.id}) from an earlier run`);
}

// Loaded through the endpoint the screen uses, no acceptance needed: it asks
// for nothing.
const loaded = await page.request.post(`${BASE}/api/plugins`, {
  multipart: {
    file: { name: `${KEY}.js`, mimeType: 'text/javascript', buffer: Buffer.from(SOURCE, 'utf8') },
  },
});
record(loaded.ok(), `the scratch plugin loads (${loaded.status()})`);

const { pluginActions } = await graphql(
  `query ($workspaceId: ID!) { pluginActions(workspaceId: $workspaceId) { pluginKey name label } }`,
  { workspaceId: WORKSPACE },
);
record(
  pluginActions.some((one) => one.pluginKey === KEY && one.name === 'respond'),
  `the server offers ${KEY}/respond among the plugin actions`,
);

// --- picked on the action's page ------------------------------------------

await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/new`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#action-name', { timeout: 20_000 });
await page.locator('#action-name').fill(NAME);

const offered = await page.locator('#action-subtype option').evaluateAll((all) =>
  all.map((one) => ({ value: one.value, label: one.textContent?.trim() })),
);
record(
  offered.some((one) => one.value === 'PLUGIN_ACTION' && one.label === 'Plugin Action'),
  `Execute Type offers Plugin Action (${offered.map((one) => one.label).join(', ')})`,
);
await page.locator('#action-subtype').selectOption('PLUGIN_ACTION');

const picker = page.locator('#action-plugin-action');
await picker.waitFor({ state: 'visible', timeout: 10_000 });
await picker.click();
const row = page.locator('[role="option"]', { hasText: `${KEY} — Respond in Scratch` });
const rowThere = await row
  .first()
  .waitFor({ state: 'visible', timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(rowThere, 'the picker lists the block as "plugin — label"');
if (!rowThere) {
  await unloadMine();
  await finish(browser);
}
// Found by what it does as well as by its name.
await page.locator('[role="listbox"] input[type="search"]').fill('thread when one');
record(
  (await page.locator('[role="option"]').count()) === 1,
  'the search finds it by its description',
);
await page.locator('[role="option"]').first().click();
await page.waitForTimeout(300);

record(
  (await picker.innerText()).includes('Respond in Scratch'),
  `the closed box names the pick ("${(await picker.innerText()).trim()}")`,
);
record(
  ((await page.locator('[data-plugin-action-description]').textContent()) ?? '').startsWith('Posts text somewhere'),
  "the block's description is drawn under the picker",
);

/** The rows of one declared list, as drawn. */
const listed = (which) =>
  page.locator(`[data-param-list="${which}"] li`).evaluateAll((all) => all.map((one) => one.textContent?.trim()));

const parameters = await listed('plugin-action-parameters');
record(
  JSON.stringify(parameters) === JSON.stringify(['commands: array', 'channel: string', 'threadTs?: string', 'text: string']),
  `its four parameters are drawn with their types, the optional one marked (${parameters.join(' · ')})`,
);
const outputs = await listed('plugin-action-outputs');
record(
  JSON.stringify(outputs) === JSON.stringify(['ts: string', 'channel: string']),
  `and its two outputs (${outputs.join(' · ')})`,
);
record(
  (await page.locator('[data-param-list="plugin-action-parameters"] li[title="What to say."]').count()) === 1,
  "a row carries the plugin's own words for the parameter",
);

await page.locator('button[type="submit"]', { hasText: 'Create Action' }).click();
await page.waitForURL(new RegExp(`/workspace/${WORKSPACE}/actions$`), { timeout: 30_000 });

// --- what was stored ------------------------------------------------------

const mine = (await actionsNamed(NAME))[0] ?? null;
record(mine !== null, 'saving created the action');
if (mine === null) {
  await unloadMine();
  await finish(browser);
}

const readBack = async () =>
  (
    await graphql(
      `query ($id: ID!) {
         action(id: $id) {
           subtype subtypeLabel pluginKey pluginAction pluginActionLabel
           inputParams { name type } outputParams { name type }
         }
       }`,
      { id: mine.id },
    )
  ).action;

let stored = await readBack();
record(
  stored.subtype === 'PLUGIN_ACTION' && stored.pluginKey === KEY && stored.pluginAction === 'respond',
  `the server holds the address: ${stored.subtype} ${stored.pluginKey}/${stored.pluginAction}`,
);
record(stored.pluginActionLabel === 'Respond in Scratch', `and labels it "${stored.pluginActionLabel}"`);
record(
  stored.inputParams.map((one) => one.name).join(',') === 'commands,channel,threadTs,text' &&
    stored.inputParams[0].type === 'ARRAY',
  `its inputs are the declaration (${stored.inputParams.map((one) => `${one.name}: ${one.type}`).join(', ')})`,
);
record(
  stored.outputParams.map((one) => one.name).join(',') === 'ts,channel',
  `and so are its outputs (${stored.outputParams.map((one) => one.name).join(', ')})`,
);

// --- reopened, the page says the same -------------------------------------

await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/${mine.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#action-plugin-action', { timeout: 30_000 });
await page
  .locator('[data-param-list="plugin-action-parameters"] li')
  .first()
  .waitFor({ state: 'visible', timeout: 10_000 })
  .catch(() => {});
record(
  (await page.locator('#action-subtype').inputValue()) === 'PLUGIN_ACTION',
  'reopened, the subtype is Plugin Action',
);
record(
  (await page.locator('#action-plugin-action').innerText()).includes('Respond in Scratch'),
  'and the picker is on the block',
);
const again = await listed('plugin-action-parameters');
record(again.length === 4, `with its four parameters under it (${again.join(' · ')})`);
record(
  (await page.locator('[data-param-list="plugin-action-outputs"] li').count()) === 2 &&
    (await page.locator('text=Input Parameters').count()) === 0,
  'its outputs drawn once - the signature block is not repeated under them',
);
record((await page.locator('[role="alert"]').count()) === 0, 'and nothing is said about the plugin, which is loaded');

// --- the admin row names the block ----------------------------------------

await page.goto(`${BASE}/admin/plugins`, { waitUntil: 'domcontentloaded' });
const adminLine = page.locator(`[data-plugin-actions="${KEY}"]`);
const adminThere = await adminLine
  .waitFor({ state: 'visible', timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(adminThere, "the admin plugin row lists what the plugin's actions() declares");
if (adminThere) {
  const said = (await adminLine.innerText()).replace(/\s+/g, ' ').trim();
  record(
    said.includes('Respond in Scratch (respond)'),
    `naming the block by its label and its stored name ("${said}")`,
  );
}

// --- the plugin goes, and the action says so ------------------------------

record(await unloadMine(), 'the scratch plugin is unloaded');
stored = await readBack();
record(
  stored.pluginKey === KEY && stored.pluginActionLabel === null,
  `the action keeps its address and the server reports no label (${stored.pluginKey}/${stored.pluginAction}, ${stored.pluginActionLabel})`,
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/actions/${mine.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#action-plugin-action', { timeout: 30_000 });
const warned = page.locator('[role="alert"]', { hasText: 'No loaded plugin offers this action any more.' });
record(
  await warned
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false),
  'reopened without the plugin, the form says the block is no longer offered',
);
/*
 * Waited for rather than read at once. The warning is drawn from the stored
 * action the moment the page has it; the row the box names comes with the
 * catalogue's answer, a round trip later, and a read between the two sees the
 * placeholder.
 */
const orphanBox = await page
  .waitForFunction(
    (expected) => document.querySelector('#action-plugin-action')?.textContent?.trim() === expected,
    `${KEY} — respond`,
    { timeout: 10_000 },
  )
  .then(() => `${KEY} — respond`)
  .catch(async () => (await page.locator('#action-plugin-action').innerText()).trim());
record(
  orphanBox === `${KEY} — respond`,
  `and the picker still says what the action points at ("${orphanBox}") rather than reading as unfilled`,
);

await deleteAction(mine.id);
record((await actionsNamed(NAME)).length === 0, 'the scratch action is removed again');

await finish(browser);
