/**
 * A plugin's connection kinds, on the three screens that show one. Issue #363.
 *
 * A plugin may declare kinds of connection - a Prometheus plugin's "server", a
 * wiki plugin's "space" - so a workspace can hold two Prometheus servers that
 * read as Prometheus servers rather than as two "HTTP endpoint" rows, and the
 * plugin's own picker offers only its own hosts. A kind is an HTTP connection
 * wearing a label: the URL, the auth type and the secret are the generic ones,
 * and only `pluginType` - `pluginKey/name` - is the plugin's.
 *
 * What is asserted:
 *
 *   the dialog  - the Type menu offers SLACK, SMTP and HTTP and then the kinds,
 *                 each by its label; two plugins labelling a kind the same way
 *                 are told apart by the plugin's name; choosing a kind shows the
 *                 URL box with the kind's own placeholder, the Auth Type and the
 *                 Token, exactly as HTTP does; and what is sent is
 *                 `type: HTTP` with `pluginType: <id>`.
 *   the list    - a row wearing a label shows the label, and a plain HTTP row
 *                 beside it still says HTTP endpoint.
 *   the page    - the Type menu stands on the label a connection wears, and
 *                 picking a core kind over it sends `pluginType: ""`, which is
 *                 the server's word for "clear it".
 *   the picker  - a plugin parameter whose `connectionType` is the plugin's own
 *                 kind is offered only the connections wearing `key/name`, and
 *                 not the plain HTTP one beside them.
 *
 * ---------------------------------------------------------------------------
 * Live and canned
 *
 * No plugin shipped with this installation declares a kind, so the live half
 * can only assert that the menu still works with none. Everything about a kind
 * is then driven against canned answers: the `pluginConnectionTypes` query is
 * answered with two plugins' kinds, the `workspaceConnections` list is
 * rewritten so one of this check's own connections wears a label, and the
 * `workspacePlugins` list is given a plugin asking for that kind. The create
 * and update mutations are captured and answered here rather than sent on, so
 * what the screens send can be read exactly and nothing bogus lands in the
 * database. When a real plugin declares a kind, the live half will list it and
 * the canned half still holds.
 *
 * Its own two connections, made and removed over GraphQL, and swept at the
 * start in case an earlier run was killed before it could remove them.
 */
import { BASE, WORKSPACE, drawn, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const PREFIX = 'zz kind check';
const STAMP = Date.now();
const LABELLED = `${PREFIX} prometheus ${STAMP}`;
const PLAIN = `${PREFIX} plain ${STAMP}`;

/** The kinds two imaginary plugins declare; the second pair share a label. */
const KINDS = [
  {
    id: 'prometheus/server',
    name: 'server',
    label: 'Prometheus server',
    description: 'A Prometheus server to read metrics from',
    urlPlaceholder: 'http://prometheus:9090',
    pluginKey: 'prometheus',
    pluginName: 'Prometheus',
  },
  {
    id: 'confluence/wiki',
    name: 'wiki',
    label: 'Wiki',
    description: null,
    urlPlaceholder: null,
    pluginKey: 'confluence',
    pluginName: 'Confluence',
  },
  {
    id: 'mediawiki/wiki',
    name: 'wiki',
    label: 'Wiki',
    description: null,
    urlPlaceholder: null,
    pluginKey: 'mediawiki',
    pluginName: 'MediaWiki',
  },
];

/** The plugin the picker is driven against: one parameter, wanting its own kind. */
const PLUGIN = {
  id: '999999',
  key: 'prometheus',
  name: 'Prometheus',
  filename: 'prometheus.js',
  sizeBytes: 1024,
  apiVersion: 1,
  sha256: '0'.repeat(64),
  uploadedAt: '2026-01-01T00:00:00Z',
  uploadedBy: 'alice',
  enabled: true,
  libraries: [],
  marketplaceKey: null,
  marketplaceVersion: null,
  icon: null,
  iconDark: null,
  summary: 'Canned for plugin-connection-kind-check',
  author: null,
  version: '1.0.0',
  declaredFunctions: [],
  skills: [],
  declaredParameters: [{ name: 'server', description: null, type: 'connection', required: true, secret: false }],
  connectionTypes: [KINDS[0]],
  permissions: [],
  permissionsAcceptedAt: null,
  permissionsAcceptedBy: null,
};

let ids = [];
/** What the screens sent, captured off the wire. */
const sent = { create: null, update: null };
/** Whether the canned answers are on. Off for the live half. */
let canned = false;

const answer = (route, data) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

/*
 * One route for the whole check. Everything not named here goes to the real
 * server untouched, and so does everything while `canned` is off.
 */
await page.route('**/graphql', async (route) => {
  try {
    const body = route.request().postDataJSON() ?? {};
    const query = String(body.query ?? '');
    const variables = body.variables ?? {};

    if (!canned) return await route.continue();

    if (query.includes('pluginConnectionTypes')) {
      return await answer(route, { pluginConnectionTypes: KINDS });
    }
    if (query.includes('mutation CreateWorkspaceConnection')) {
      sent.create = variables.input;
      return await answer(route, {
        createWorkspaceConnection: {
          ...(await freshConnection(ids[0])),
          id: '999998',
          name: variables.input.name,
          pluginType: variables.input.pluginType ?? null,
        },
      });
    }
    if (query.includes('mutation UpdateWorkspaceConnection')) {
      sent.update = variables.input;
      const held = await freshConnection(variables.id);
      return await answer(route, {
        updateWorkspaceConnection: {
          ...held,
          pluginType: variables.input.pluginType === '' ? null : (variables.input.pluginType ?? held.pluginType),
        },
      });
    }
    if (query.includes('workspacePlugins(')) {
      const real = await route.fetch();
      const parsed = await real.json();
      parsed.data.workspacePlugins = [
        {
          plugin: PLUGIN,
          missing: ['server'],
          parameters: [
            {
              name: 'server',
              description: null,
              type: 'connection',
              connectionType: 'server',
              required: true,
              secret: false,
              options: [],
              literal: null,
              secretSet: false,
              variableId: null,
              variableName: null,
              missing: true,
            },
          ],
        },
        ...parsed.data.workspacePlugins,
      ];
      return await route.fulfill({ response: real, body: JSON.stringify(parsed) });
    }
    // Any answer carrying connections: the labelled one wears its label.
    if (query.includes('workspaceConnections(') || query.includes('workspaceConnection(')) {
      const real = await route.fetch();
      const parsed = await real.json();
      const wear = (one) => (one !== null && one.name === LABELLED ? { ...one, pluginType: 'prometheus/server' } : one);
      if (parsed.data?.workspaceConnections !== undefined) {
        parsed.data.workspaceConnections = parsed.data.workspaceConnections.map(wear);
      }
      if (parsed.data?.workspaceConnection !== undefined) {
        parsed.data.workspaceConnection = wear(parsed.data.workspaceConnection);
      }
      return await route.fulfill({ response: real, body: JSON.stringify(parsed) });
    }
    return await route.continue();
  } catch {
    // The page is done with; whatever this was is no longer being read.
  }
});

/** The stored connection, as the real server holds it, for a canned answer to stand on. */
async function freshConnection(id) {
  const data = await graphql(
    `query($id: ID!) { workspaceConnection(id: $id) {
      id workspaceId name type pluginType url urlOverride effectiveUrl authType headers { name value } inherited secretSet
      secretVariableId secretVariableName secretVariableCatalog secretVariableMissing
      appTokenSet appTokenVariableId appTokenVariableName appTokenVariableCatalog appTokenVariableMissing
      userTokenSet userTokenVariableId userTokenVariableName userTokenVariableCatalog userTokenVariableMissing
      smtpPort smtpUsername smtpFrom smtpSecurity status lastCheckMessage lastCheckedAt } }`,
    { id },
  );
  return data.workspaceConnection;
}

const options = async (selector) =>
  page.locator(`${selector} option`).evaluateAll((all) =>
    all.map((one) => ({ value: one.value, text: one.textContent.trim(), group: one.parentElement.label ?? null })),
  );

try {
  /* ------------------------------------------------------------- fixture */

  const stale = await graphql(`query($id: ID!) { workspaceConnections(workspaceId: $id) { id name } }`, {
    id: WORKSPACE,
  });
  for (const old of stale.workspaceConnections.filter((held) => held.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: old.id }).catch(() => undefined);
    console.log(`swept connection ${old.name} (#${old.id}) from an earlier run`);
  }

  for (const name of [LABELLED, PLAIN]) {
    const made = await graphql(
      `mutation($input: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $input) { id pluginType } }`,
      { input: { workspaceId: WORKSPACE, name, type: 'HTTP', url: 'https://example.invalid/', authType: 'NONE' } },
    );
    ids.push(made.createWorkspaceConnection.id);
    record(made.createWorkspaceConnection.pluginType === null, `${name} is a plain HTTP connection (pluginType null)`);
  }

  /* --------------------------------------------------- live: the menu as it is */

  const live = await graphql(`query { pluginConnectionTypes { id label pluginName } }`);
  console.log(
    `NOTE: the server declares ${live.pluginConnectionTypes.length} plugin connection kind(s)` +
      (live.pluginConnectionTypes.length > 0
        ? `: ${live.pluginConnectionTypes.map((one) => `${one.id} "${one.label}"`).join(', ')}`
        : ' - the kind path below runs against canned answers'),
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'integrations (live)')) {
    const rows = await page.locator('main').innerText();
    record(rows.includes(LABELLED) && rows.includes(PLAIN), 'live: both scratch connections are listed');
    record(
      (rows.match(/HTTP endpoint/g) ?? []).length >= 2,
      'live: with no label stored, both read as HTTP endpoint',
    );

    await page.locator('button', { hasText: /^\+ Add Connection$/ }).click();
    await page.waitForSelector('#workspace-connection-name', { timeout: 20_000 });
    await page.waitForTimeout(800);
    const offered = await options('#workspace-connection-type');
    const values = offered.map((one) => one.value);
    record(
      ['SLACK', 'SMTP', 'HTTP'].every((core) => values.includes(core)),
      `live: the Type menu offers the three core kinds (${values.filter(Boolean).join(', ')})`,
    );
    record(
      live.pluginConnectionTypes.every((kind) => values.includes(kind.id)),
      `live: and every kind the server declares (${live.pluginConnectionTypes.length})`,
    );
    record(
      offered.filter((one) => one.value.includes('/')).length === live.pluginConnectionTypes.length,
      'live: and no kind the server does not declare',
    );
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  /* ------------------------------------------------- canned: the dialog */

  canned = true;
  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'integrations (canned)')) {
    /* the list */
    const labelledRow = page.locator('main a', { hasText: LABELLED }).locator('xpath=..');
    const plainRow = page.locator('main a', { hasText: PLAIN }).locator('xpath=..');
    const labelledText = (await labelledRow.innerText()).replace(/\s+/g, ' ');
    const plainText = (await plainRow.innerText()).replace(/\s+/g, ' ');
    record(
      labelledText.includes('Prometheus server') && !labelledText.includes('HTTP endpoint'),
      `list: the labelled row reads Prometheus server, not HTTP endpoint (${labelledText.slice(0, 80)})`,
    );
    record(plainText.includes('HTTP endpoint'), `list: the plain row still reads HTTP endpoint (${plainText.slice(0, 80)})`);

    /* the dialog */
    await page.locator('button', { hasText: /^\+ Add Connection$/ }).click();
    await page.waitForSelector('#workspace-connection-name', { timeout: 20_000 });
    await page.locator('#workspace-connection-type option[value="prometheus/server"]').waitFor({
      state: 'attached',
      timeout: 10_000,
    });
    const offered = await options('#workspace-connection-type');
    const texts = Object.fromEntries(offered.map((one) => [one.value, one.text]));
    record(
      offered.map((one) => one.value).join('|') ===
        '|SLACK|SMTP|HTTP|prometheus/server|confluence/wiki|mediawiki/wiki',
      `dialog: core kinds first, then the plugins' (${offered.map((one) => one.value).join(', ')})`,
    );
    record(texts['prometheus/server'] === 'Prometheus server', `dialog: a kind is offered by its label (${texts['prometheus/server']})`);
    record(
      texts['confluence/wiki'] === 'Wiki · Confluence' && texts['mediawiki/wiki'] === 'Wiki · MediaWiki',
      `dialog: two plugins labelling a kind alike are told apart by plugin name (${texts['confluence/wiki']}; ${texts['mediawiki/wiki']})`,
    );
    record(
      offered.filter((one) => one.value.includes('/')).every((one) => one.group === 'From plugins'),
      'dialog: the kinds sit under a From plugins heading',
    );

    await page.selectOption('#workspace-connection-type', 'prometheus/server');
    await page.waitForTimeout(400);
    const url = page.locator('#workspace-connection-url');
    record((await url.count()) === 1, 'dialog: choosing a kind shows the URL box');
    record(
      (await url.getAttribute('placeholder')) === 'http://prometheus:9090',
      `dialog: with the kind's own placeholder (${await url.getAttribute('placeholder')})`,
    );
    record((await page.locator('#workspace-connection-auth').count()) === 1, 'dialog: and the Auth Type, as HTTP does');
    record((await page.locator('#workspace-connection-secret').count()) === 1, 'dialog: and the Token / Key, as HTTP does');
    record(
      (await page.locator('#workspace-connection-security').count()) === 0 &&
        (await page.locator('#workspace-connection-bot-token').count()) === 0,
      'dialog: and nothing of Slack or SMTP',
    );

    await page.selectOption('#workspace-connection-type', 'confluence/wiki');
    await page.waitForTimeout(300);
    record(
      (await url.getAttribute('placeholder')) === 'https://',
      `dialog: a kind without a placeholder falls back to https:// (${await url.getAttribute('placeholder')})`,
    );
    await page.selectOption('#workspace-connection-type', 'prometheus/server');

    await page.fill('#workspace-connection-name', `${PREFIX} sent ${STAMP}`);
    await page.fill('#workspace-connection-url', 'http://prometheus.example.invalid:9090');
    await page.selectOption('#workspace-connection-auth', 'NONE');
    await page.waitForTimeout(300);
    const submit = page.locator('dialog[open] button[type="submit"]');
    record(await submit.isEnabled(), 'dialog: a name, a kind and a URL are enough to add it');
    await submit.click();
    await page.waitForTimeout(1500);

    record(sent.create !== null, 'dialog: the create mutation was sent');
    record(sent.create?.type === 'HTTP', `dialog: it sends type HTTP (${sent.create?.type})`);
    record(
      sent.create?.pluginType === 'prometheus/server',
      `dialog: and pluginType prometheus/server (${sent.create?.pluginType})`,
    );
    record(
      sent.create?.url === 'http://prometheus.example.invalid:9090' && sent.create?.authType === 'NONE',
      'dialog: with the generic URL and auth type',
    );
    record((await page.locator('dialog[open]').count()) === 0, 'dialog: and closed on the answer');
  }

  /* ------------------------------------------------- canned: the page */

  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/connections/${ids[0]}`, {
    waitUntil: 'domcontentloaded',
  });
  await page.locator('#connection-type').waitFor({ state: 'visible', timeout: 20_000 });
  await page.locator('#connection-type option[value="prometheus/server"]').waitFor({ state: 'attached', timeout: 10_000 });
  await page.waitForTimeout(400);
  record(
    (await page.locator('#connection-type').inputValue()) === 'prometheus/server',
    `page: the Type menu stands on the label the connection wears (${await page.locator('#connection-type').inputValue()})`,
  );
  const pageOffered = await options('#connection-type');
  record(
    pageOffered.some((one) => one.value === 'prometheus/server' && one.text === 'Prometheus server') &&
      pageOffered.some((one) => one.text === 'Wiki · Confluence'),
    'page: the menu offers the kinds as the dialog does',
  );
  record((await page.locator('#connection-auth').count()) === 1, 'page: a labelled connection keeps the HTTP Auth Type');
  record((await page.locator('#connection-url-override').count()) === 1, 'page: and the URL Override');

  await page.selectOption('#connection-type', 'HTTP');
  await page.waitForTimeout(300);
  await page.locator('button[type="submit"]', { hasText: 'Save Credentials' }).click();
  await page.waitForTimeout(1500);
  record(sent.update !== null, 'page: saving sent the update mutation');
  record(
    sent.update?.pluginType === '',
    `page: picking a core kind over a label sends pluginType "" to clear it (${JSON.stringify(sent.update?.pluginType)})`,
  );
  record(
    sent.update?.type === undefined,
    `page: and no type, since HTTP is what it already was (${JSON.stringify(sent.update?.type)})`,
  );

  sent.update = null;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('#connection-type').waitFor({ state: 'visible', timeout: 20_000 });
  await page.waitForTimeout(600);
  await page.locator('button[type="submit"]', { hasText: 'Save Credentials' }).click();
  await page.waitForTimeout(1500);
  record(
    sent.update !== null && sent.update.pluginType === undefined,
    `page: saving a credential without touching the menu leaves the label alone (${JSON.stringify(sent.update?.pluginType)})`,
  );

  /* ------------------------------------------------- canned: the picker */

  await page.goto(`${BASE}/workspace/${WORKSPACE}/plugins`, { waitUntil: 'domcontentloaded' });
  if (await drawn(page, 'plugins (canned)')) {
    // The list is paged and ordered by name, so the canned plugin is searched
    // for rather than looked for on whichever page it happened to sort onto.
    await page.fill('input[placeholder="Search plugins..."]', PLUGIN.name);
    await page.waitForTimeout(800);
    const opener = page.locator('button', { hasText: /^Prometheus/ });
    const listed = record(
      (await opener.count()) === 1,
      `picker: the canned plugin is listed (${(await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 160)})`,
    );
    if (listed) {
      await opener.click();
      const picker = page.locator(`#plugin-parameter-${PLUGIN.id}-server`);
      await picker.waitFor({ state: 'visible', timeout: 10_000 });
      const held = await options(`#plugin-parameter-${PLUGIN.id}-server`);
      const names = held.map((one) => one.text).filter((text) => text !== 'Choose a connection…');
      record(
        names.includes(LABELLED),
        `picker: the connection wearing prometheus/server is offered (${names.join(', ')})`,
      );
      record(!names.includes(PLAIN), 'picker: and the plain HTTP one beside it is not');
      record(
        names.every((name) => name === LABELLED),
        `picker: nothing else is either (${names.length} offered)`,
      );
    }
  }
} finally {
  canned = false;
  await page.unroute('**/graphql').catch(() => {});
  for (const id of ids) {
    await graphql(`mutation($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id }).catch(() => undefined);
  }
  // Anything the dialog might have created for real, had the canned answer not taken it.
  const left = await graphql(`query($id: ID!) { workspaceConnections(workspaceId: $id) { id name } }`, {
    id: WORKSPACE,
  }).catch(() => ({ workspaceConnections: [] }));
  for (const old of left.workspaceConnections.filter((held) => held.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

await finish(browser);
