/**
 * The Integrations tables line up: each heading over its own column, names
 * left-aligned in a name's weight, and a connection's description in a column
 * of its own.
 *
 * A screenshot of a live installation showed all of it wrong. The MCP Servers
 * heading had no Status, so Auth sat over the status values and the auth values
 * had no heading; a rule added in 1.0.6 between `.serverName,` and
 * `.connectionName` made a server's name a column - centred, in body weight;
 * and the description sat under a connection's name, so one without a
 * description showed nothing at all.
 *
 * Measured on the page: the left edge of every heading against the left edge
 * of the cell under it, the name's own text against its cell, and its weight.
 * The servers and connections are stubbed. Makes nothing and removes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const server = (id, name, address, authType) => ({
  id, workspaceId: WORKSPACE, name, address, authType, headers: [], secretSet: authType !== 'NONE',
  secretVariableId: null, secretVariableName: null, secretVariableCatalog: null, secretVariableMissing: false,
  reachable: true, checkDetail: null, toolCount: 3,
});
const connection = (id, name, type, description) => ({
  id, workspaceId: WORKSPACE, name, type, pluginType: null, url: 'https://example.invalid', description,
  urlOverride: null, effectiveUrl: 'https://example.invalid', authType: 'BEARER_TOKEN', headers: [], inherited: false,
  secretSet: true, secretVariableId: null, secretVariableName: null, secretVariableCatalog: null, secretVariableMissing: false,
  appTokenSet: false, appTokenVariableId: null, appTokenVariableName: null, appTokenVariableCatalog: null, appTokenVariableMissing: false,
  userTokenSet: false, userTokenVariableId: null, userTokenVariableName: null, userTokenVariableCatalog: null, userTokenVariableMissing: false,
  smtpPort: null, smtpUsername: null, smtpFrom: null, smtpSecurity: null, status: 'CONNECTED', lastCheckMessage: null, lastCheckedAt: null,
});

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
  if (body.includes('mcpServers(')) {
    return answer({ mcpServers: [server('1', 'jira', 'https://mcp-atlassian.example.invalid/mcp', 'NONE'), server('2', 'order mcp', 'http://orders.example.invalid/api/mcp', 'API_KEY')] });
  }
  if (body.includes('workspaceConnections(')) {
    return answer({ workspaceConnections: [connection('1', 'Slack', 'SLACK', null), connection('2', 'Jira', 'HTTP', 'production Jira, the support project')] });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-connection-row="Jira"]', { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(500);

/** For one card: its headings and, for the first row, the left edge of each cell. */
const measure = (title) =>
  page.evaluate((title) => {
    const card = [...document.querySelectorAll('section')].find((one) => one.querySelector('h2')?.textContent?.trim() === title);
    if (!card) return null;
    const header = card.querySelector('[class*="_tableHeader_"]');
    const row = card.querySelector('[class*="_rowOpens_"]');
    if (!header || !row) return null;
    const left = (el) => Math.round(el.getBoundingClientRect().left);
    const headings = [...header.children].map((one) => ({ text: one.textContent.replace(/[▲▼↑↓]/g, '').trim(), left: left(one) }));
    const cells = [...row.children].map((one) => left(one));
    const name = row.children[0];
    const range = document.createRange();
    range.selectNodeContents(name);
    const text = [...range.getClientRects()].reduce((low, one) => Math.min(low, one.left), Infinity);
    const nameText = name.querySelector('[class*="_connectionName_"]') ?? name;
    return {
      headings,
      cells,
      nameCellLeft: left(name),
      nameTextLeft: Math.round(text),
      nameWeight: getComputedStyle(nameText).fontWeight,
    };
  }, title);

for (const title of ['MCP Servers', 'Connections']) {
  const seen = await measure(title);
  console.log(`${title}: ${JSON.stringify(seen)}`);
  if (seen === null) {
    record(false, `${title}: the table is drawn`);
    continue;
  }
  record(seen.headings.length === seen.cells.length, `${title}: a heading for every column a row draws (${seen.headings.length} of ${seen.cells.length})`);
  const off = seen.headings.map((one, at) => ({ heading: one.text, by: Math.abs(one.left - (seen.cells[at] ?? -999)) })).filter((one) => one.by > 2);
  record(off.length === 0, `${title}: every heading over its own column (${JSON.stringify(off)})`);
  record(seen.nameTextLeft - seen.nameCellLeft < 30, `${title}: the name starts at its cell's left, not its middle (${seen.nameTextLeft - seen.nameCellLeft}px in)`);
  record(Number(seen.nameWeight) >= 600, `${title}: in a name's weight (${seen.nameWeight})`);
}

const headings = (await measure('Connections'))?.headings.map((one) => one.text) ?? [];
record(headings.includes('Description'), `Connections has a Description column (${headings.join(', ')})`);
const described = await page.locator('[data-connection-description]').allTextContents();
record(described.includes('production Jira, the support project'), 'a connection\'s description is in it');

await finish(browser);
