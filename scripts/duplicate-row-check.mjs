/**
 * Every list that holds one kind of thing can duplicate a row: agents, model
 * providers, models, actions, triggers, conditions, objects, skills, tools and memories.
 *
 * One scratch thing of each, made here and named to sort first, so its row is
 * on the first page whatever the list's order. Pressing its Duplicate button
 * has to leave a second one in the workspace, under the next free name, and
 * draw it on the list. Everything made is deleted, copies included.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });
const W = WORKSPACE;
const q = (doc, vars = {}) => graphql(doc, { w: W, ...vars });
const listed = (field) => async () =>
  (await q(`query($w: ID!) { ${field}(workspaceId: $w, page: 0, size: 500) { content { id name } } }`))[field].content;

const lists = [
  {
    kind: 'agents', path: 'agents', name: 'aaa dup agent', names: listed('workspaceAgents'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id }),
  },
  {
    kind: 'actions', path: 'actions', name: 'aaa dup action', names: listed('workspaceActions'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createAction(input: { workspaceId: $w, name: $n, type: WAIT, subtype: TIME, durationSeconds: 60 }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteAction(id: $id) }`, { id }),
  },
  {
    kind: 'triggers', path: 'triggers', name: 'aaa dup trigger', names: listed('workspaceTriggers'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createTrigger(input: { workspaceId: $w, name: $n, type: SCHEDULED, cron: "0 2 * * *" }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id }),
  },
  {
    kind: 'conditions', path: 'conditions', name: 'aaa dup condition', names: listed('workspaceConditions'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createCondition(input: { workspaceId: $w, name: $n, type: SLACK, property: MESSAGE_AUTHOR, check: IN_LIST, values: ["a@example.com"] }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteCondition(id: $id) }`, { id }),
  },
  {
    kind: 'objects', path: 'objects', name: 'AaaDupObject', names: listed('workspaceObjects'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createObject(input: { workspaceId: $w, name: $n }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteObject(id: $id) }`, { id }),
  },
  {
    kind: 'tools', path: 'tools', name: 'aaa_dup_tool', names: listed('workspaceTools'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createTool(input: { workspaceId: $w, name: $n }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteTool(id: $id) }`, { id }),
  },
  {
    kind: 'skills', path: 'skills', name: 'aaa dup skill', names: listed('workspaceSkills'),
    make: (n) => q(`mutation($w: ID!, $n: String!) { createSkill(input: { workspaceId: $w, name: $n }) { id } }`, { n }),
    remove: (id) => q(`mutation($id: ID!) { deleteSkill(id: $id) }`, { id }),
  },
];

/** Letters only, so `aaa_dup_tool_2` and `aaa dup agent (2)` both read as the scratch one's family. */
const family = (name) => name.toLowerCase().replace(/[^a-z]/g, '');

async function sweep(list) {
  const held = await list.names().catch(() => []);
  for (const one of held.filter((row) => family(row.name).startsWith(family(list.name)))) {
    await list.remove(one.id).catch(() => undefined);
  }
}

for (const list of lists) {
  await sweep(list);
  const made = await list.make(list.name).then(() => true).catch((cause) => {
    record(false, `${list.kind}: making the scratch one (${String(cause).slice(0, 140)})`);
    return false;
  });
  if (!made) continue;

  await page.goto(`${BASE}/workspace/${W}/${list.path}`, { waitUntil: 'domcontentloaded' });
  await drawn(page, `the ${list.kind} list`);
  const button = page.locator(`[data-duplicate="${list.name}"]`).first();
  const there = await button.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(there, `${list.kind}: its row has a Duplicate button`);
  if (!there) {
    await sweep(list);
    continue;
  }
  await button.click();
  await page.waitForTimeout(1500);
  const after = (await list.names()).map((row) => row.name);
  const copies = after.filter((name) => name !== list.name && family(name).startsWith(family(list.name)));
  record(copies.length === 1, `${list.kind}: a second one exists (${copies.join(', ') || 'none'})`);
  if (copies.length === 1) {
    record(
      await page.locator(`[data-duplicate="${copies[0]}"]`).first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
      `${list.kind}: and it is drawn on the list`,
    );
  }
  await sweep(list);
}

/* ------------------------------------------ a model, and a memory, too */

const provider = (await q(`mutation($w: ID!) { createModelProvider(input: { workspaceId: $w, name: "aaa dup provider", endpoint: "https://example.invalid/v1" }) { id } }`)).createModelProvider;
await graphql(`mutation($p: ID!) { createModel(input: { providerId: $p, name: "aaa dup model", modelId: "stub", kind: CHAT }) { id } }`, { p: provider.id });
await page.goto(`${BASE}/workspace/${W}/models`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the models list');
const modelButton = page.locator('[data-duplicate="aaa dup model"]').first();
if (record(await modelButton.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'models: its row has a Duplicate button')) {
  await modelButton.click();
  record(
    await page.locator('[data-duplicate="aaa dup model (copy)"]').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
    'models: the copy is drawn as "(copy)"',
  );
}
/* A provider's row copies it with its models, so the copy's model is drawn among the models too. */
const providerButton = page.locator('[data-duplicate="aaa dup provider"]').first();
if (record(await providerButton.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'providers: its row has a Duplicate button')) {
  await providerButton.click();
  record(
    await page.locator('[data-duplicate="aaa dup provider (copy)"]').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
    'providers: the copy is drawn as "(copy)"',
  );
  const held = (await q(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`)).modelProviders;
  const copy = held.find((one) => one.name === 'aaa dup provider (copy)');
  const carried = copy === undefined ? [] : (await q(`query($w: ID!) { models(workspaceId: $w) { name providerId } }`)).models
    .filter((one) => one.providerId === copy.id).map((one) => one.name);
  record(carried.includes('aaa dup model'), `providers: the copy carries its models (${carried.join(', ') || 'none'})`);
  if (copy !== undefined) await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: copy.id }).catch(() => undefined);
}
await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: provider.id }).catch(() => undefined);

const catalog = (await q(`mutation($w: ID!) { createMemoryCatalog(workspaceId: $w, name: "aaa dup memories") { id } }`)).createMemoryCatalog;
await graphql(`mutation($c: ID!) { createMemory(input: { catalogId: $c, title: "aaa dup memory", content: "Remember this." }) { id } }`, { c: catalog.id });
// Opened on its own catalog: which one the page shows first depends on what else the workspace holds.
await page.goto(`${BASE}/workspace/${W}/memory?catalog=${catalog.id}`, { waitUntil: 'domcontentloaded' });
await drawn(page, 'the memory page');
const memoryButton = page.locator('[data-duplicate="aaa dup memory"]').first();
if (record(await memoryButton.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'memories: its card has a Duplicate button')) {
  await memoryButton.click();
  record(
    await page.locator('[data-duplicate="aaa dup memory (copy)"]').first().waitFor({ timeout: 10_000 }).then(() => true).catch(() => false),
    'memories: the copy is drawn as "(copy)"',
  );
}
await graphql(`mutation($id: ID!) { deleteMemoryCatalog(id: $id) }`, { id: catalog.id }).catch(() => undefined);

await finish(browser);
