/**
 * A Slack connection's socket, on its page: one line saying how it stands, and
 * a Reconnect button on that line. Issue #592.
 *
 * A socket that died without the client noticing used to stay "open" and hear
 * nothing until a restart, and the page had nothing to say about it - the
 * connection's own check is about the token, which was fine the whole time. So
 * what is asserted is what is drawn: the state line is there, on one line, with
 * its dot; the button sits on the same row; pressing it asks the server and the
 * line is redrawn from the answer, which is read back off the server and
 * compared.
 *
 * No real Slack. The connection holds tokens nobody issued, so a server that
 * listens to Slack reports it FAILED or CONNECTING and one that does not reports
 * DISABLED - each a state the line has words for, and the check accepts any of
 * them as long as the line says the one the server says. A connection that is
 * not Slack is opened too, and must draw no socket line at all.
 *
 * It writes nothing it does not remove: two connections under a scratch name,
 * swept at both ends.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const SCRATCH = 'slackReconnectCheck';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const integrations = `${BASE}/workspace/${WORKSPACE}/integrations`;

const listConnections = async () =>
  (await graphql(`query ($w: ID!) { workspaceConnections(workspaceId: $w) { id name type } }`, { w: WORKSPACE }))
    .workspaceConnections;

const disconnect = (id) => graphql(`mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id });

async function sweep() {
  for (const one of (await listConnections()).filter((row) => row.name.startsWith(SCRATCH))) {
    await disconnect(one.id).catch(() => {});
  }
}

const socketOf = async (id) =>
  (
    await graphql(`query ($id: ID!) { workspaceConnection(id: $id) { slackSocket { status lastFailure } } }`, {
      id,
    })
  ).workspaceConnection?.slackSocket ?? null;

/** What the line opens with for each state - the words, not the class. */
const OPENS = {
  CONNECTED: 'Connected since',
  CONNECTING: 'Not connected yet',
  FAILED: 'Could not connect',
  NOT_LISTENING: 'Not listening',
  DISABLED: 'This server does not listen to Slack',
};

await sweep();

const stamp = Date.now();
const create = async (input) =>
  (
    await graphql(
      `mutation ($i: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $i) { id name } }`,
      { i: { workspaceId: WORKSPACE, ...input } },
    )
  ).createWorkspaceConnection;

const slack = await create({
  name: `${SCRATCH} slack ${stamp}`,
  type: 'SLACK',
  secret: 'xoxb-not-issued-0001',
  appToken: 'xapp-not-issued-0001',
});
const http = await create({ name: `${SCRATCH} http ${stamp}`, type: 'HTTP', url: 'https://reconnect.invalid' });

async function at(id) {
  await page.goto(`${integrations}/connections/${id}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#connection-name', { timeout: 30_000 });
  await page.waitForTimeout(600);
}

/** The row, its dot, its line and its button, measured. */
async function measure() {
  return page.evaluate(() => {
    const row = document.querySelector('#connection-socket');
    if (row === null) return null;
    const box = (element) => {
      if (element === null) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, height: rect.height, width: rect.width, middle: rect.top + rect.height / 2 };
    };
    const line = document.querySelector('#connection-socket-state');
    const dot = row.querySelector('[aria-hidden="true"]');
    const button = document.querySelector('#connection-reconnect');
    return {
      text: line?.textContent ?? '',
      line: box(line),
      lineHeight: line === null ? 0 : parseFloat(getComputedStyle(line).lineHeight) || 0,
      dot: box(dot),
      button: box(button),
      buttonText: button?.textContent ?? '',
    };
  });
}

// ------------------------------------------------------------ a Slack connection

await at(slack.id);
await page.waitForSelector('#connection-socket', { timeout: 15_000 }).catch(() => {});
const before = await measure();
shot('slack-reconnect-before');

record(before !== null, 'a Slack connection’s page draws a socket line');
if (before !== null) {
  const state = await socketOf(slack.id);
  record(
    state !== null && before.text.startsWith(OPENS[state.status]),
    `the line says what the server says (${state?.status}): ${JSON.stringify(before.text)}`,
  );
  record(
    before.line !== null && before.line.height > 0 && before.line.height <= Math.max(before.lineHeight, 16) * 1.5,
    `the state is one line, not a paragraph (${before.line?.height}px)`,
  );
  record(before.dot !== null && before.dot.width > 0 && before.dot.height > 0, 'with a status dot beside it');
  record(
    before.button !== null && before.button.width > 0 && before.buttonText === 'Reconnect',
    'and a Reconnect button',
  );
  record(
    before.button !== null && before.line !== null && Math.abs(before.button.middle - before.line.middle) < 12,
    'on the same row as the line it acts on',
  );

  // The press: the server is asked, and the line is redrawn from its answer.
  const answered = page.waitForResponse(
    (response) => response.url().includes('/graphql') && (response.request().postData() ?? '').includes('reconnectSlackConnection'),
    { timeout: 30_000 },
  );
  await page.locator('#connection-reconnect').click();
  const response = await answered.catch(() => null);
  const body = response === null ? null : await response.json().catch(() => null);
  const pressed = body?.data?.reconnectSlackConnection ?? null;
  record(pressed !== null, `pressing Reconnect asks the server, and it answers (${pressed?.status ?? 'nothing'})`);

  await page.waitForTimeout(500);
  const after = await measure();
  shot('slack-reconnect-after');
  record(
    after !== null && pressed !== null && after.text.startsWith(OPENS[pressed.status]),
    `and the line is redrawn from the answer: ${JSON.stringify(after?.text)}`,
  );
  record(
    pressed?.status !== 'FAILED' || (after?.text ?? '').includes(pressed.lastFailure ?? 'no reason given'),
    'a failure is shown with the reason the server gave',
  );
  record(after?.buttonText === 'Reconnect', 'and the button is ready to press again');
}

// --------------------------------------------------------- and one that is not

await at(http.id);
record((await page.locator('#connection-socket').count()) === 0, 'a connection that is not Slack draws no socket line');

await sweep();
await finish(browser);
