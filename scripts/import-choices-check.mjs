/**
 * What the person importing may decide: leave out a tool an agent points at,
 * and give a carried component a name of their own. Issue #383.
 *
 * The report was an agent copied between workspaces and refused over tools a
 * plugin brought; what the importer does about those is pinned in
 * ImportChoicesTest. This is the dialog: a "Not here" tool row now offers
 * Leave out, and pressing it lets the import go ahead with the agent arriving
 * without the tool; a carried row offers Rename, and the name typed is the
 * name the thing lands under, with the agent's grant following it.
 *
 * Makes a tool and an agent in the fixture's workspace, imports them into the
 * empty one, and removes all of it.
 */
import { writeFileSync } from 'node:fs';
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';
import { NAMES, workspaceIdOf } from './suite/named.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 980 } });

const STAMP = Date.now();
const TOOL = `zzChoiceTool${STAMP}`;
const RENAMED = `zzChoiceFinder${STAMP}`;
const AGENT = `zzChoice bot ${STAMP}`;
const FROM = WORKSPACE;
const INTO = await workspaceIdOf(graphql, NAMES.BARE_WORKSPACE, process.env.ORKNUX_BARE_WORKSPACE);
if (INTO === null) {
  record(false, 'nothing to run against: the fixture has no empty workspace');
  await finish(browser);
}

/* ---------------------------------------------------------------- fixture */

const sweep = async () => {
  for (const workspaceId of [FROM, INTO]) {
    const { workspaceAgents } = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 200, search: "zzChoice") { content { id name } } }`, { w: workspaceId }).catch(() => ({ workspaceAgents: { content: [] } }));
    for (const one of (workspaceAgents?.content ?? []).filter((a) => a.name.startsWith('zzChoice'))) {
      await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: one.id }).catch(() => undefined);
    }
    const { workspaceTools } = await graphql(`query($w: ID!) { workspaceTools(workspaceId: $w, page: 0, size: 200, search: "zzChoice") { content { id name } } }`, { w: workspaceId }).catch(() => ({ workspaceTools: { content: [] } }));
    for (const one of (workspaceTools?.content ?? []).filter((t) => t.name.startsWith('zzChoice'))) {
      await graphql(`mutation($id: ID!) { deleteTool(id: $id) }`, { id: one.id }).catch(() => undefined);
    }
  }
};
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

const body = 'export default function (input) { return {}; }';
await graphql(
  `mutation($w: ID!, $n: String!, $s: String!) { createTool(input: { workspaceId: $w, name: $n, source: $s, typescript: $s }) { id } }`,
  { w: FROM, n: TOOL, s: body },
);
const { createAgent } = await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
  { w: FROM, n: AGENT },
);
await graphql(`mutation($id: ID!, $n: String!, $t: [String!]!) { updateAgent(id: $id, input: { name: $n, tools: $t }) { id } }`, {
  id: createAgent.id,
  n: AGENT,
  t: [TOOL],
});

const envelope = async (depth, to) => {
  const { exportComponent } = await graphql(
    `query($w: ID!, $id: ID!, $d: ExportDepth!) { exportComponent(workspaceId: $w, kind: AGENT, id: $id, depth: $d) { json } }`,
    { w: FROM, id: createAgent.id, d: depth },
  );
  writeFileSync(to, exportComponent.json);
};
const SHALLOW = `/tmp/choices-shallow-${STAMP}.orkx.json`;
const DEEP = `/tmp/choices-deep-${STAMP}.orkx.json`;
await envelope('SHALLOW', SHALLOW);
await envelope('DEEP', DEEP);

const rows = () =>
  page.locator('dialog[open] li').evaluateAll((items) =>
    items
      .map((item) => {
        const spans = item.querySelectorAll(':scope > span > span');
        if (spans.length < 3) return null;
        return {
          kind: spans[0].textContent.trim(),
          name: spans[1].textContent.trim(),
          badge: spans[2].textContent.trim(),
          offers: [...item.querySelectorAll('button')].map((button) => button.textContent.trim()),
        };
      })
      .filter((row) => row !== null),
  );

const openWith = async (file) => {
  await page.goto(`${BASE}/workspace/${INTO}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Showing', { timeout: 20_000 });
  await page.waitForTimeout(700);
  await page.locator('input[type="file"]').first().setInputFiles(file);
  await page.waitForSelector('dialog[open] h2:has-text("Import")', { timeout: 20_000 });
  await page
    .waitForFunction(() => {
      const dialog = document.querySelector('dialog[open]');
      return dialog !== null && !dialog.innerText.includes('Reading the file');
    }, { timeout: 60_000 })
    .catch(() => undefined);
  await page.waitForTimeout(600);
};
const settled = async () => {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('dialog[open]');
    return dialog !== null && !dialog.innerText.includes('Reading the file');
  }, { timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
};

/* -------------------------------------------- a tool the agent points at */

await openWith(SHALLOW);
let listed = await rows();
let tool = listed.find((row) => row.name === TOOL) ?? null;
record(tool !== null && tool.badge === 'Not here', `a shallow file's tool is a reference this workspace lacks (${tool?.badge ?? 'no row'})`);
record(tool !== null && tool.offers.includes('Leave out'), 'and the row offers Leave out, because an agent can arrive without a tool');
record(
  await page.getByRole('dialog').getByRole('button', { name: 'Import' }).isDisabled().catch(() => true),
  'until it is left out, the import is refused',
);

await page.locator(`button[aria-label="Leave out ${TOOL}"]`).click();
await settled();
listed = await rows();
tool = listed.find((row) => row.name === TOOL) ?? null;
record(tool !== null && tool.badge === 'Left out', `left out, the row says so (${tool?.badge ?? 'no row'})`);
record(
  !(await page.getByRole('dialog').getByRole('button', { name: 'Import' }).isDisabled().catch(() => true)),
  'and the import is offered',
);
await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
await page.waitForTimeout(2500);
// The server's own tools are on every agent since #444, so what an import carries
// is read past them.
const builtIns = new Set((await graphql(`{ builtInTools { name } }`)).builtInTools.map((one) => one.name));
const own = (agent) => agent.tools.filter((name) => !builtIns.has(name));
const arrived = (await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 200, search: "zzChoice") { content { name tools } } }`, { w: INTO })).workspaceAgents.content;
const bot = arrived.find((one) => one.name === AGENT) ?? null;
record(bot !== null && own(bot).length === 0, `the agent arrived without the tool (${JSON.stringify(bot === null ? null : own(bot))})`);
await page.keyboard.press('Escape').catch(() => undefined);

/* -------------------------------------------------------------- a rename */

// The agent is here now, so the deep file's agent would be renamed by the
// rule; what is measured is the tool the person names, and the grant following.
await openWith(DEEP);
listed = await rows();
tool = listed.find((row) => row.name === TOOL) ?? null;
record(tool !== null && tool.offers.includes('Rename'), `a carried row offers Rename (${JSON.stringify(tool?.offers ?? [])})`);

await page.locator(`button[aria-label="Rename ${TOOL}"]`).click();
const box = page.locator(`input[aria-label="New name for ${TOOL}"]`);
await box.waitFor({ timeout: 5_000 });
await box.fill(RENAMED);
await box.press('Enter');
await settled();
listed = await rows();
tool = listed.find((row) => row.name.startsWith(TOOL)) ?? null;
record(tool !== null && tool.name === `${TOOL} → ${RENAMED}` && tool.badge === 'Renamed', `the row shows the name chosen (${tool?.name ?? 'no row'} [${tool?.badge ?? ''}])`);

await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
await page.waitForTimeout(2500);
const landed = (await graphql(`query($w: ID!) { workspaceTools(workspaceId: $w, page: 0, size: 200, search: "zzChoice") { content { name } } }`, { w: INTO })).workspaceTools.content;
record(landed.some((one) => one.name === RENAMED) && !landed.some((one) => one.name === TOOL), 'the tool landed under the name chosen');
const after = (await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 200, search: "zzChoice") { content { name tools } } }`, { w: INTO })).workspaceAgents.content;
const copy = after.find((one) => one.name.startsWith(AGENT) && own(one).length > 0) ?? null;
record(copy !== null && copy.tools.includes(RENAMED), `and the agent's grant followed it (${JSON.stringify(copy === null ? null : own(copy))})`);

await clean();
