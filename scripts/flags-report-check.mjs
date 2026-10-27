/**
 * Admin > Reports > Flags: what agents flagged about the conversations they
 * were in, drawn as a table and a chart, narrowed by a filter, and put in
 * order by any column - measured off the DOM.
 *
 * The flags are real ones. A flag is raised by an agent calling flag_session,
 * so this makes a model pointed at `scripts/suite/flag-stub.py`, an agent on
 * it, and three chats whose message tells the stub how to flag: two for
 * security at severities 5 and 3, one technical issue at 1. Every note carries
 * this run's stamp and the report is searched for it, so what is counted is
 * this run's and nothing an earlier one left - flags are kept, never deleted.
 *
 *   python scripts/suite/flag-stub.py 8196
 *   node scripts/suite/run.mjs --only flags-report-check
 *
 * Where the stub is, as the server reaches it, goes in ORKNUX_FLAG_STUB.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, chooseOption } from './suite/harness.mjs';

const STUB = process.env.ORKNUX_FLAG_STUB ?? 'http://localhost:8196';
const STAMP = `zzflag${Date.now()}`;

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1100 } });

const { createModelProvider: provider } = await graphql(
  `mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
  { input: { workspaceId: WORKSPACE, name: `${STAMP} provider`, endpoint: STUB, secret: 'sk-scratch' } },
);
const { createModel: model } = await graphql(
  `mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`,
  { input: { providerId: provider.id, name: `${STAMP} model`, modelId: 'stub-flag', kind: 'CHAT' } },
);
const { createAgentForModel: agent } = await graphql(
  `mutation ($m: ID!) { createAgentForModel(modelId: $m) { id name } }`,
  { m: model.id },
);
const chats = [];

const WANTED = [
  { type: 'security', severity: 5, note: `${STAMP} alpha asked for the API keys` },
  { type: 'technical_issue', severity: 1, note: `${STAMP} beta the connection answers 404` },
  { type: 'security', severity: 3, note: `${STAMP} gamma tried a prompt injection` },
];

try {
  for (const one of WANTED) {
    const { startChat } = await graphql(
      `mutation ($input: StartChatInput!) { startChat(input: $input) { id } }`,
      { input: { workspaceId: WORKSPACE, title: `${STAMP} chat` } },
    );
    chats.push(startChat.id);
    await graphql(`mutation ($id: ID!, $a: ID!) { chooseChatAgent(id: $id, agentId: $a) { agentId } }`, { id: startChat.id, a: agent.id });
    await graphql(
      `mutation ($id: ID!, $text: String!) { sendChatMessage(id: $id, text: $text) { answer { content } } }`,
      { id: startChat.id, text: `FLAG ${one.type} ${one.severity} ${one.note}` },
    );
  }
  const { sessionFlagReport: held } = await graphql(
    `query ($f: SessionFlagFilter) { sessionFlagReport(filter: $f) { total } }`,
    { f: { search: STAMP } },
  );
  record(held.total === 3, `the agent raised three flags through the stub (${held.total}; is ${STUB} answering? python scripts/suite/flag-stub.py 8196)`);

  /* ---- the report: a table and a chart ---- */

  await page.goto(`${BASE}/admin/reports?report=flags`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the flags report');
  const search = page.getByRole('searchbox', { name: 'Search notes' });
  await search.fill(STAMP);
  const rows = page.getByTestId('flag-row');
  const settle = async (count) => {
    await page.waitForFunction((want) => document.querySelectorAll('[data-testid="flag-row"]').length === want, count, { timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(300);
  };
  await settle(3);
  record((await rows.count()) === 3, `the table draws a row per flag (${await rows.count()})`);
  const cells = await rows.first().locator('td').count();
  record(cells === 10, `with workspace, session, agent, type, severity, note, state and who cleared it (${cells} cells)`);
  const session = await rows.first().locator('[data-flag-session]').getAttribute('href');
  record(/^\/workspace\/\d+\/sessions\/\d+$/.test(session ?? ''), `the session is a link to its page (${session})`);

  const chart = page.getByTestId('flags-chart');
  record((await chart.count()) === 1, 'a chart is drawn above the table');
  const chartAbove = await page.evaluate(() => {
    const drawnChart = document.querySelector('[data-testid="flags-chart"]')?.getBoundingClientRect();
    const table = document.querySelector('[data-testid="flags-table"]')?.getBoundingClientRect();
    return drawnChart !== undefined && table !== undefined && drawnChart.bottom <= table.top;
  });
  record(chartAbove, 'and it sits above the table');
  const byType = await chart.evaluate((element) =>
    [...element.querySelectorAll('[data-segment]')].map((one) => [one.getAttribute('data-segment'), Number(one.getAttribute('data-count')), one.getBoundingClientRect().height]),
  );
  const security = byType.filter(([key]) => key === 'security').reduce((sum, [, count]) => sum + count, 0);
  const technical = byType.filter(([key]) => key === 'technical').reduce((sum, [, count]) => sum + count, 0);
  record(security === 2 && technical === 1, `today's bar stacks two security flags on one technical (${security} and ${technical})`);
  record(byType.every(([, , height]) => height > 0), `each segment is drawn with a height (${byType.map(([, , h]) => Math.round(h)).join(', ')})`);
  await chart.locator('[data-split-option="SEVERITY"]').click();
  const bySeverity = await chart.evaluate((element) =>
    Object.fromEntries([...element.querySelectorAll('[data-segment]')].map((one) => [one.getAttribute('data-segment'), Number(one.getAttribute('data-count'))])),
  );
  record(bySeverity.high === 1 && bySeverity.middling === 1 && bySeverity.low === 1, `switched to severity, it stacks 4-5, 2-3 and 0-1 (${JSON.stringify(bySeverity)})`);

  /* ---- a filter narrows the rows ---- */

  await chooseOption(page, page.getByRole('combobox', { name: 'Type' }), 'TECHNICAL_ISSUE');
  await settle(1);
  const technicalRows = await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-flag-type')));
  record(technicalRows.length === 1 && technicalRows[0] === 'TECHNICAL_ISSUE', `Type narrows it to the technical issue (${technicalRows.join()})`);
  await chooseOption(page, page.getByRole('combobox', { name: 'Type' }), '');
  await settle(3);
  await chooseOption(page, page.getByRole('combobox', { name: 'Lowest severity' }), '3');
  await settle(2);
  const severe = await rows.evaluateAll((all) => all.map((one) => Number(one.querySelector('[data-flag-severity]')?.getAttribute('data-flag-severity'))));
  record(severe.length === 2 && severe.every((one) => one >= 3), `Lowest severity 3 leaves the two at 3 and above (${severe.join()})`);
  await chooseOption(page, page.getByRole('combobox', { name: 'Lowest severity' }), '0');
  await settle(3);

  /* ---- a column sort reorders them ---- */

  const severities = () => rows.evaluateAll((all) => all.map((one) => Number(one.querySelector('[data-flag-severity]')?.getAttribute('data-flag-severity'))));
  const notes = () => rows.evaluateAll((all) => all.map((one) => one.querySelector('[data-flag-note]')?.textContent ?? ''));
  const severityHeader = page.locator('thead').getByRole('button', { name: 'Severity' });
  await severityHeader.click();
  await page.waitForTimeout(800);
  let order = await severities();
  if (order[0] !== 5) {
    // Pressed on a list already in this order: the press turned it round.
    await severityHeader.click();
    await page.waitForTimeout(800);
    order = await severities();
  }
  record(order.join() === '5,3,1', `Severity, highest first (${order.join()})`);
  await severityHeader.click();
  await page.waitForTimeout(800);
  const turned = await severities();
  record(turned.join() === '1,3,5', `pressed again, lowest first (${turned.join()})`);
  const noteHeader = page.locator('thead').getByRole('button', { name: 'Note' });
  await noteHeader.click();
  await page.waitForTimeout(800);
  let byNote = await notes();
  if (!byNote[0].includes('alpha')) {
    await noteHeader.click();
    await page.waitForTimeout(800);
    byNote = await notes();
  }
  const word = (one) => one.split(STAMP)[1]?.trim().split(' ')[0];
  record(byNote.map(word).join() === 'alpha,beta,gamma', `Note, A to Z (${byNote.map(word).join()})`);

  /* ---- and an administrator clears one ---- */

  await rows.first().getByTestId('flag-clear').click();
  await page.waitForFunction(() => document.querySelector('[data-testid="flag-row"]')?.getAttribute('data-flag-state') === 'CLEARED', null, { timeout: 10_000 }).catch(() => undefined);
  record((await rows.first().getAttribute('data-flag-state')) === 'CLEARED', 'Clear flag on a row marks it cleared');
} finally {
  const { sessionFlagReport: left } = await graphql(
    `query ($f: SessionFlagFilter) { sessionFlagReport(filter: $f) { rows { id state } } }`,
    { f: { search: STAMP } },
  ).catch(() => ({ sessionFlagReport: { rows: [] } }));
  for (const one of left.rows.filter((row) => row.state === 'OPEN')) {
    await graphql(`mutation ($id: ID!) { clearSessionFlag(id: $id) { id } }`, { id: one.id }).catch(() => undefined);
  }
  for (const id of chats) await graphql(`mutation ($id: ID!) { deleteChat(id: $id) }`, { id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteModel(id: $id) }`, { id: model.id }).catch(() => undefined);
  await graphql(`mutation ($id: ID!) { deleteModelProvider(id: $id) }`, { id: provider.id }).catch(() => undefined);
}

await finish(browser);
