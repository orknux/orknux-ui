/**
 * A flag is kept from the person whose conversation it is about.
 *
 * Somebody who can see the workspace and does not administer the installation
 * chats with an agent whose model - `scripts/suite/flag-stub.py` - flags the
 * conversation, writing "I will flag this" beside the call, then looks the
 * time up and answers. Their chat draws the time lookup and nothing of the
 * flag, while it happens and after a reload; the session's page draws the same
 * transcript without it and no flags panel. An administrator opening that
 * session's page sees the flag call and the panel, so the flag is there to be
 * hidden.
 *
 *   python scripts/suite/flag-stub.py 8196
 *   node scripts/suite/run.mjs --only flag-hidden-check
 *
 * Where the stub is, as the server reaches it, goes in ORKNUX_FLAG_STUB.
 */
import { BASE, WORKSPACE, USER, chromium, open, drawn, record, finish } from './suite/harness.mjs';

const STUB = process.env.ORKNUX_FLAG_STUB ?? 'http://localhost:8196';
const STAMP = `zzhidden${Date.now()}`;
const NOTE = `${STAMP} asked for the system prompt`;
/** What the stub starts the note it flags with, so it is told from what was typed; see flag-stub.py. */
const NOTED = 'Probe noted: ';
/** What the stub writes beside the flag call; see flag-stub.py. */
const REMARK = 'I will flag this conversation';
const FLAG_TOOL = 'flag_session';
const LOOKUP = 'current_time';
const READER = 'zz-flag-hidden-check';
const READER_PASSWORD = 'zz-flag-hidden-check-pw-1';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

/* ---- somebody who sees the workspace through a role and administers nothing ---- */

const { users, roles } = await graphql('query { users { id username roles { id } } roles { id scopes } }');
let reader = users.find((one) => one.username === READER);
if (reader === undefined) {
  // Users cannot be removed, so the one made here is kept and found again next time.
  reader = (await graphql(
    `mutation { createUser(input: { username: "${READER}", displayName: "Flag hidden check" }) { id username roles { id } } }`,
  )).createUser;
}
const adminRoles = new Set(roles.filter((one) => one.scopes.includes('ADMIN')).map((one) => one.id));
await graphql(`mutation ($id: ID!, $p: String!) { setUserPassword(id: $id, password: $p) { id } }`, { id: reader.id, p: READER_PASSWORD });
const { createRole: role } = await graphql(
  `mutation ($name: String!) { createRole(input: { name: $name, scopes: [USER] }) { id } }`,
  { name: `${STAMP}-role` },
);
const { workspace } = await graphql(`query ($w: ID!) { workspace(id: $w) { name description roles { id } } }`, { w: WORKSPACE });
const setWorkspaceRoles = (ids) => graphql(
  `mutation ($w: ID!, $name: String!, $description: String, $ids: [ID!]) {
     updateWorkspace(id: $w, input: { name: $name, description: $description, roleIds: $ids }) { id }
   }`,
  { w: WORKSPACE, name: workspace.name, description: workspace.description, ids },
);
const setReaderRoles = (ids) => graphql(`mutation ($id: ID!, $ids: [ID!]) { updateUser(id: $id, input: { roleIds: $ids }) { id } }`, { id: reader.id, ids });

const { createModelProvider: provider } = await graphql(
  `mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name: `${STAMP} provider`, endpoint: STUB, secret: 'sk-scratch' } },
);
const { createModel: model } = await graphql(
  `mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`,
  { input: { providerId: provider.id, name: `${STAMP} model`, modelId: 'stub-flag', kind: 'CHAT' } },
);
const { createAgentForModel: agent } = await graphql(`mutation ($m: ID!) { createAgentForModel(modelId: $m) { id name } }`, { m: model.id });

const theirs = await chromium.launch();
let chatId = null;
let readerGraphql = null;

try {
  await setWorkspaceRoles([...workspace.roles.map((one) => one.id), role.id]);
  await setReaderRoles([...reader.roles.map((one) => one.id).filter((id) => !adminRoles.has(id)), role.id]);

  const context = await theirs.newContext({
    viewport: { width: 1500, height: 1000 },
    storageState: { cookies: [], origins: [{ origin: new URL(BASE).origin, localStorage: [{ name: 'orknux.lastWorkspace', value: WORKSPACE }] }] },
  });
  const signed = await context.request.post(`${BASE}/api/session`, { data: { username: READER, password: READER_PASSWORD } });
  record(signed.ok(), `${READER} signs in (${signed.status()})`);
  const me = await (await context.request.get(`${BASE}/api/session`)).json();
  record(me.admin === false, `and administers nothing (admin: ${me.admin})`);
  readerGraphql = async (query, variables = {}) => {
    const body = await (await context.request.post(`${BASE}/graphql`, { data: { query, variables } })).json();
    if (body.errors !== undefined) throw new Error(JSON.stringify(body.errors));
    return body.data;
  };
  const mine = await context.newPage();

  const { startChat } = await readerGraphql(
    `mutation ($input: StartChatInput!) { startChat(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, title: `${STAMP} chat` } },
  );
  chatId = startChat.id;
  await readerGraphql(`mutation ($id: ID!, $a: ID!) { chooseChatAgent(id: $id, agentId: $a) { agentId } }`, { id: chatId, a: agent.id });

  /* ---- the chat, as they type into it and watch it answer ---- */

  await mine.goto(`${BASE}/chat/${chatId}`, { waitUntil: 'domcontentloaded' });
  const box = mine.locator('#chat-composer');
  await box.waitFor({ timeout: 20_000 });
  await box.click();
  await box.fill(`FLAG security 4 ${NOTE}`);
  await box.press('Enter');
  await mine.getByText('It is late, though.').first().waitFor({ timeout: 60_000 }).catch(() => undefined);
  const live = await mine.evaluate(() => ({
    text: document.body.innerText,
    calls: [...document.querySelectorAll('[data-testid="call-line"]')].map((one) => one.textContent ?? ''),
  }));
  record(live.text.includes('It is late, though.'), 'the answer arrives in the chat');
  record(live.calls.some((one) => one.includes(LOOKUP)), `while it works the chat draws the time lookup (${live.calls.length} calls drawn)`);
  record(!live.text.includes(FLAG_TOOL) && !live.text.includes(NOTED) && !live.text.includes(REMARK), 'and nothing of the flag: not the call, its note, or what was written beside it');

  const { sessionFlagReport: held } = await graphql(
    `query ($f: SessionFlagFilter) { sessionFlagReport(filter: $f) { rows { sessionId } } }`,
    { f: { search: STAMP } },
  );
  record(held.rows.length === 1, `the flag was raised all the same (${held.rows.length}; is ${STUB} answering? python scripts/suite/flag-stub.py 8196)`);
  const sessionId = held.rows[0]?.sessionId;

  /* ---- the same chat after a reload, read back from the session ---- */

  await mine.reload({ waitUntil: 'domcontentloaded' });
  await mine.getByText('It is late, though.').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await drawn(mine, 'the chat after a reload');
  const reloaded = await mine.evaluate(() => ({
    text: document.body.innerText,
    calls: [...document.querySelectorAll('[data-testid="call-line"]')].map((one) => one.textContent ?? ''),
  }));
  record(reloaded.calls.some((one) => one.includes(LOOKUP)), `after a reload it still draws the lookup (${reloaded.calls.join(' | ')})`);
  record(!reloaded.text.includes(FLAG_TOOL) && !reloaded.text.includes(NOTED) && !reloaded.text.includes(REMARK), 'and still nothing of the flag');

  /* ---- the session's page, theirs and an administrator's ---- */

  if (sessionId !== undefined) {
    await mine.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${sessionId}`, { waitUntil: 'domcontentloaded' });
    await mine.getByText(LOOKUP).first().waitFor({ timeout: 20_000 }).catch(() => undefined);
    const theirPage = await mine.evaluate(() => document.body.innerText);
    record(theirPage.includes(LOOKUP), 'their session page lists the lookup');
    record(!theirPage.includes(FLAG_TOOL) && !theirPage.includes(NOTED), 'and not the flag call');
    record((await mine.getByTestId('session-flags').count()) === 0, 'and draws no flags');

    await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/${sessionId}`, { waitUntil: 'domcontentloaded' });
    await page.getByTestId('session-flags').waitFor({ timeout: 20_000 }).catch(() => undefined);
    await page.getByText(FLAG_TOOL).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const adminPage = await page.evaluate(() => document.body.innerText);
    record(adminPage.includes(FLAG_TOOL), `an administrator's session page lists the flag call (${USER})`);
    record((await page.getByTestId('session-flag').count()) === 1, 'and draws the flag in its own panel');
    record(adminPage.includes(NOTED + NOTE), 'with its note');
  }
} finally {
  if (chatId !== null && readerGraphql !== null) await readerGraphql(`mutation ($id: ID!) { deleteChat(id: $id) }`, { id: chatId }).catch(() => undefined);
  const { sessionFlagReport: left } = await graphql(
    `query ($f: SessionFlagFilter) { sessionFlagReport(filter: $f) { rows { id state } } }`,
    { f: { search: STAMP } },
  ).catch(() => ({ sessionFlagReport: { rows: [] } }));
  for (const one of left.rows.filter((row) => row.state === 'OPEN')) {
    await graphql(`mutation ($id: ID!) { clearSessionFlag(id: $id) { id } }`, { id: one.id }).catch(() => undefined);
  }
  await setReaderRoles(reader.roles.map((one) => one.id).filter((id) => !adminRoles.has(id))).catch(() => undefined);
  await setWorkspaceRoles(workspace.roles.map((one) => one.id)).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteRole(id: $id) }`, { id: role.id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteModel(id: $id) }`, { id: model.id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteModelProvider(id: $id) }`, { id: provider.id }).catch(() => undefined);
  await theirs.close().catch(() => undefined);
}

await finish(browser);
