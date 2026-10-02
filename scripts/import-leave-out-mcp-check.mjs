/**
 * An MCP server an agent points at can be left out of an import. Issue #580.
 *
 * The report was an agent export pointing at two servers, one this workspace
 * has and one it has nowhere; the binding question for the second offered
 * only this workspace's servers, so the import could not go ahead at all.
 * What the importer does is pinned in ImportChoicesTest. This is the dialog:
 * the question's select offers leaving the server out, choosing it marks the
 * plan row Left out and lets the import go, and the agent arrives holding the
 * server that was here and not the one left out.
 *
 * Makes two servers and an agent in the fixture's workspace and one server in
 * the empty one, imports the agent across, and removes all of it.
 */
import { writeFileSync } from 'node:fs';
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';
import { NAMES, workspaceIdOf } from './suite/named.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 980 } });

const STAMP = Date.now();
const KEPT = `zzMcpKept${STAMP}`;
const GONE = `zzMcpGone${STAMP}`;
const AGENT = `zzMcpOut bot ${STAMP}`;
const FROM = WORKSPACE;
const INTO = await workspaceIdOf(graphql, NAMES.BARE_WORKSPACE, process.env.ORKNUX_BARE_WORKSPACE);
if (INTO === null) {
  record(false, 'nothing to run against: the fixture has no empty workspace');
  await finish(browser);
}

/* ---------------------------------------------------------------- fixture */

const sweep = async () => {
  for (const workspaceId of [FROM, INTO]) {
    const { workspaceAgents } = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 200, search: "zzMcpOut") { content { id name } } }`, { w: workspaceId }).catch(() => ({ workspaceAgents: { content: [] } }));
    for (const one of (workspaceAgents?.content ?? []).filter((a) => a.name.startsWith('zzMcpOut'))) {
      await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: one.id }).catch(() => undefined);
    }
    const { mcpServers } = await graphql(`query($w: ID!) { mcpServers(workspaceId: $w) { id name } }`, { w: workspaceId }).catch(() => ({ mcpServers: [] }));
    for (const one of (mcpServers ?? []).filter((s) => s.name.startsWith('zzMcp'))) {
      await graphql(`mutation($id: ID!) { removeMcpServer(id: $id) }`, { id: one.id }).catch(() => undefined);
    }
  }
};
await sweep();
const clean = async () => {
  await sweep();
  await finish(browser);
};

const createServer = (workspaceId, name) =>
  graphql(`mutation ($input: CreateMcpServerInput!) { createMcpServer(input: $input) { id } }`, {
    input: { workspaceId, name, address: 'http://localhost:9/mcp' },
  });
await createServer(FROM, KEPT);
await createServer(FROM, GONE);
// The workspace it lands in has the one, so only the other is a question.
await createServer(INTO, KEPT);

const { createAgent } = await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`,
  { w: FROM, n: AGENT },
);
await graphql(`mutation($id: ID!, $n: String!, $m: [String!]!) { updateAgent(id: $id, input: { name: $n, mcpServers: $m }) { id } }`, {
  id: createAgent.id,
  n: AGENT,
  m: [KEPT, GONE],
});

const { exportComponent } = await graphql(
  `query($w: ID!, $id: ID!) { exportComponent(workspaceId: $w, kind: AGENT, id: $id, depth: DEEP) { json } }`,
  { w: FROM, id: createAgent.id },
);
const FILE = `/tmp/mcp-leave-out-${STAMP}.orkx.json`;
writeFileSync(FILE, exportComponent.json);

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
        };
      })
      .filter((row) => row !== null),
  );

const settled = async () => {
  await page.waitForFunction(() => {
    const dialog = document.querySelector('dialog[open]');
    return dialog !== null && !dialog.innerText.includes('Reading the file');
  }, { timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
};

const importDisabled = () =>
  page.getByRole('dialog').getByRole('button', { name: 'Import' }).isDisabled().catch(() => true);

/* ------------------------------------------------ the question, answered */

await page.goto(`${BASE}/workspace/${INTO}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('text=Showing', { timeout: 20_000 });
await page.waitForTimeout(700);
await page.locator('input[type="file"]').first().setInputFiles(FILE);
await page.waitForSelector('dialog[open] h2:has-text("Import")', { timeout: 20_000 });
await settled();

let listed = await rows();
let gone = listed.find((row) => row.name === GONE) ?? null;
record(gone !== null && gone.badge === 'Not here', `the server this workspace lacks is a row of its own (${gone?.badge ?? 'no row'})`);
record(listed.find((row) => row.name === KEPT)?.badge !== 'Not here', 'the one it has is matched by name');
record(await importDisabled(), 'until it is answered, the import is refused');

// The question's select, which waits for this workspace's servers to load.
const question = page.locator(`dialog[open] select[aria-label$="${GONE} means here"]`);
await question.waitFor({ timeout: 10_000 });
await page.waitForFunction(
  (name) => {
    const select = [...document.querySelectorAll('dialog[open] select')].find((one) =>
      (one.getAttribute('aria-label') ?? '').endsWith(`${name} means here`),
    );
    return select !== undefined && !select.disabled;
  },
  GONE,
  { timeout: 20_000 },
).catch(() => undefined);
const offered = await question.locator('option').evaluateAll((options) =>
  options.map((option) => ({ value: option.value, text: option.textContent.trim() })),
);
const leave = offered.find((option) => option.value === 'leave-out') ?? null;
record(leave !== null, `the question offers leaving it out (${JSON.stringify(offered.map((option) => option.text))})`);
record(leave !== null && !leave.text.includes('\n') && leave.text.length <= 60, `in one short line (${leave?.text ?? ''})`);

if (leave === null) await clean();

await question.selectOption('leave-out');
await settled();
listed = await rows();
gone = listed.find((row) => row.name === GONE) ?? null;
record(gone !== null && gone.badge === 'Left out', `left out, the plan row says so (${gone?.badge ?? 'no row'})`);
record((await question.inputValue().catch(() => '')) === 'leave-out', 'and the question stays, showing the answer given');
record(!(await importDisabled()), 'and the import is offered');

/* ------------------------------------------------------------- the import */

await page.getByRole('dialog').getByRole('button', { name: 'Import' }).click();
await page.waitForTimeout(2500);
const arrived = (await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 200, search: "zzMcpOut") { content { name mcpServers } } }`, { w: INTO })).workspaceAgents.content;
const bot = arrived.find((one) => one.name === AGENT) ?? null;
record(
  bot !== null && bot.mcpServers.length === 1 && bot.mcpServers[0] === KEPT,
  `the agent arrived with the server that was here and without the one left out (${JSON.stringify(bot?.mcpServers ?? null)})`,
);
await page.keyboard.press('Escape').catch(() => undefined);

await clean();
