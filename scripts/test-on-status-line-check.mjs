/**
 * A page's Test Connection (or Check) is on the status line under the form -
 * the line that says what the last check found - at its end, beside that
 * status. Not in the save strip at the foot, which is for Save and Discard,
 * and not in the page's header. Before any check the line still stands, with a
 * neutral status, so the button has its place.
 *
 * And on Add Provider, Test leaves what was typed where it was. It saves the
 * provider to have something to check, and then filled the form from the
 * server's answer: an answer never carries a secret, so the API key just typed
 * was emptied, and with the form now "unchanged" Create went off - the
 * provider could not be finished.
 *
 * Every Test press except Add Provider's is captured and answered here, so
 * nothing is saved or checked for real. Add Provider's is real, because the
 * bug is in what the save answers; its row is removed again by Discard, and
 * anything a killed run left is swept by name.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz strip test';

const sweep = async () => {
  const { modelProviders } = await graphql(
    `query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`,
    { w: WORKSPACE },
  ).catch(() => ({ modelProviders: [] }));
  for (const one of modelProviders.filter((provider) => provider.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: one.id }).catch(() => undefined);
  }
};

/** Mutations a Test sends, answered with a refusal so nothing is stored; the names seen are kept. */
const captured = [];
const CAPTURE = /\b(checkModelProviderDraft|testModelProvider|updateModelProvider|testWorkspaceConnection|checkMcpServer|testBoxConnection)\b/;
let capturing = true;
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  const hit = capturing ? query.match(CAPTURE) : null;
  if (hit === null || !/^\s*mutation/.test(query)) return route.continue();
  captured.push(hit[1]);
  return route.fulfill({ json: { data: null, errors: [{ message: 'captured by the check' }] } });
});

const TEST = /^(Test Connection|Test connection|Check|Checking…|Testing…)$/;

/**
 * Where Test is now: one in the page and none in the save strip; on the same
 * line as status text - a piece of text beside it, centred with it - and below
 * every field of the form before it.
 */
const placed = async (what) => {
  const button = page.locator('main').getByRole('button', { name: TEST });
  await button.first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  const inPage = await button.count();
  const inStrip = await page.getByTestId('save-bar').getByRole('button', { name: TEST }).count();
  const line = inPage === 0 ? null : await button.first().evaluate((element) => {
    const own = element.getBoundingClientRect();
    const middle = own.top + own.height / 2;
    // The nearest ancestor holding text besides the button: the status line.
    let row = element.parentElement;
    while (row !== null && (row.innerText ?? '').replace(element.innerText, '').trim() === '') row = row.parentElement;
    const texts = row === null ? [] : [...row.querySelectorAll('span, p')]
      .filter((one) => !element.contains(one) && one.children.length === 0 && (one.innerText ?? '').trim() !== '');
    const beside = texts.find((one) => {
      const box = one.getBoundingClientRect();
      return Math.abs(box.top + box.height / 2 - middle) < 10;
    });
    const fields = [...document.querySelectorAll('main input:not([type=hidden]), main [data-select], main textarea')]
      .filter((field) => field.getBoundingClientRect().height > 0
        && (field.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    const below = fields.every((field) => field.getBoundingClientRect().bottom <= own.top + 1);
    return { status: beside ? beside.innerText.trim().slice(0, 40) : null, below };
  });
  record(
    inPage === 1 && inStrip === 0 && line !== null && line.status !== null && line.below,
    `${what}: Test is on the status line under the form, beside "${line?.status ?? ''}", not in the save strip (${inPage} in the page, ${inStrip} in the strip${line?.below === false ? ', not below the form' : ''})`,
  );
  // Wherever it is, so the rest of the check still runs on a page that has it elsewhere.
  return inPage > 0 ? button.first() : page.getByRole('button', { name: TEST }).first();
};

const pressed = async (what, button, mutation) => {
  const before = captured.length;
  await button.click();
  await page.waitForTimeout(800);
  record(captured.slice(before).includes(mutation), `${what}: pressing it still asks (${captured.slice(before).join(', ') || 'nothing sent'})`);
};

try {
  await sweep();

  // Add Provider: Test in the strip, and the typed key survives it.
  capturing = false;
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
  await page.locator('#provider-name').waitFor({ timeout: 20_000 });
  const addTest = await placed('Add Provider');
  await page.locator('#provider-name').fill(`${PREFIX} ${Date.now()}`);
  await page.locator('#provider-endpoint').fill('http://strip-test.invalid/v1');
  await page.locator('#provider-secret').fill('sk-strip-check-key');
  await addTest.click();
  await page.waitForFunction(() => {
    const button = [...document.querySelectorAll('button')].find((one) => /^(Test Connection|Checking…)$/.test((one.textContent ?? '').trim()));
    return button !== null && !/…/.test(button.textContent ?? '');
  }, null, { timeout: 30_000 }).catch(() => undefined);
  const kept = await page.locator('#provider-secret').inputValue();
  record(kept === 'sk-strip-check-key', `after Test, the API key typed is still in its box (${JSON.stringify(kept)})`);
  const create = page.getByTestId('save-bar').getByRole('button', { name: 'Create' });
  record(await create.isEnabled(), 'and Create is still on, so the provider can be finished');
  // Test saved nothing: there is no row to discard.
  await page.getByTestId('save-bar-discard').click();
  await page.waitForURL(/\/models(\b|$|#|\?)/, { timeout: 15_000 }).catch(() => undefined);
  capturing = true;

  // An existing provider.
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  const provider = modelProviders.find((one) => !one.name.startsWith(PREFIX));
  if (provider !== undefined) {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${provider.id}`, { waitUntil: 'domcontentloaded' });
    await pressed('a provider', await placed('a provider'), 'checkModelProviderDraft');
  }

  // A connection.
  const { workspaceConnections } = await graphql(`query($w: ID!) { workspaceConnections(workspaceId: $w) { id } }`, { w: WORKSPACE });
  if (workspaceConnections.length > 0) {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/connections/${workspaceConnections[0].id}`, { waitUntil: 'domcontentloaded' });
    await pressed('a connection', await placed('a connection'), 'testWorkspaceConnection');
  }

  // An MCP server.
  const { mcpServers } = await graphql(`query($w: ID!) { mcpServers(workspaceId: $w) { id } }`, { w: WORKSPACE });
  if (mcpServers.length > 0) {
    await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/servers/${mcpServers[0].id}`, { waitUntil: 'domcontentloaded' });
    await pressed('an MCP server', await placed('an MCP server'), 'checkMcpServer');
  }

  // A remote box.
  const { boxes } = await graphql(`query { boxes { id kind } }`);
  const remote = boxes.find((one) => one.kind === 'REMOTE');
  if (remote !== undefined) {
    await page.goto(`${BASE}/admin/boxes/${remote.id}`, { waitUntil: 'domcontentloaded' });
    await pressed('a box', await placed('a box'), 'testBoxConnection');
  }
  record(provider !== undefined && workspaceConnections.length > 0, 'the workspace had a provider and a connection to open');
} finally {
  await sweep();
}

await finish(browser);
