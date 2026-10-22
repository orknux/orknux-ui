/**
 * A Remove in a Danger Zone asks before it removes anything.
 *
 * Reported: "why remove provider does not ask for permission?" - the provider's
 * page removed the provider, and every model reached through it, on one press.
 * So did a model's page, and a trusted certificate authority's. Each is checked
 * the same way: the press opens a dialog and the thing is still on the server,
 * Cancel leaves it there, and only the dialog's own Remove takes it away.
 *
 * Action, condition, template and box pages are not here: they ask with a
 * second click in the Danger Zone itself, which is asking. The box page also
 * needs a box running somewhere, which a check has no business starting.
 *
 * The certificate is a self-signed authority made for this check, whose key was
 * thrown away the moment it was made - trusted for the few seconds the check
 * holds it, it can vouch for nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const PREFIX = 'zz remove-asks';
const SCRATCH_CA = `-----BEGIN CERTIFICATE-----
MIIBtDCCAVmgAwIBAgIUIQMCzNCoVUW+1DlSlHCELS4I56MwCgYIKoZIzj0EAwIw
LjEsMCoGA1UEAwwjb3JrbnV4IHJlbW92ZS1hc2tzLWZpcnN0IHNjcmF0Y2ggQ0Ew
IBcNMjYxMDIyMTk0MzAyWhgPMjEyNjA5MjgxOTQzMDJaMC4xLDAqBgNVBAMMI29y
a251eCByZW1vdmUtYXNrcy1maXJzdCBzY3JhdGNoIENBMFkwEwYHKoZIzj0CAQYI
KoZIzj0DAQcDQgAE5rHQVFaineOvleoXMkBeT8Br9XGqA1KGePxBxYGhe+xnWmqb
UOx1IyfqTBf0l7RA9KVvla4XoFCV+ewWqyPHOKNTMFEwHQYDVR0OBBYEFIp+Jy8g
uYblFLQvwdvB23XkAc1jMB8GA1UdIwQYMBaAFIp+Jy8guYblFLQvwdvB23XkAc1j
MA8GA1UdEwEB/wQFMAMBAf8wCgYIKoZIzj0EAwIDSQAwRgIhANU1DB2lK37Tof97
OB4seA97LQv8TZrztwhdmB8R2E/cAiEAhBhYcjmjjjxD2FWU5KPohqqbJv7V3EF0
Ozm3x+qWaaM=
-----END CERTIFICATE-----`;

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ------------------------------------------------------------ the sweep */

async function sweep() {
  const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id name } }', { w: WORKSPACE });
  for (const one of models.filter((m) => m.name.startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { removeModel(id: $id) }', { id: one.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql('query($w: ID!) { modelProviders(workspaceId: $w) { id name } }', { w: WORKSPACE });
  for (const one of modelProviders.filter((p) => p.name.startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { removeModelProvider(id: $id) }', { id: one.id }).catch(() => undefined);
  }
  const { trustedCertificates } = await graphql('query { trustedCertificates { id name } }');
  for (const one of trustedCertificates.filter((c) => c.name.startsWith(PREFIX))) {
    await graphql('mutation($id: ID!) { untrustCertificate(id: $id) }', { id: one.id }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------- the walk */

const danger = () => page.locator('section', { has: page.getByRole('heading', { name: 'Danger Zone' }) });
const dialog = () => page.locator('dialog[open]');

/**
 * Presses the Danger Zone's button and walks the dialog: asks, Cancel keeps,
 * Remove removes. `exists` reads the thing back off the server.
 */
async function walk(what, url, button, exists, expectInDialog = []) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const press = danger().getByRole('button', { name: button, exact: true });
  const drawn = await press.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(drawn, `${what}: the Danger Zone offers "${button}"`);
  if (!drawn) return;

  await press.click();
  const asked = await dialog().waitFor({ timeout: 5_000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(500);
  record(asked, `${what}: pressing "${button}" opens a dialog that asks first`);
  record(await exists(), `${what}: and nothing is removed before the answer`);
  if (!asked) return;

  // What goes with it is read when the dialog opens, so it is waited for rather than read off the first paint.
  for (const expected of expectInDialog) {
    await dialog().getByText(expected).first().waitFor({ timeout: 5_000 }).catch(() => undefined);
  }
  const said = (await dialog().innerText()).replace(/\s+/g, ' ');
  for (const expected of expectInDialog) {
    record(said.includes(expected), `${what}: the dialog names "${expected}" (it says: ${said})`);
  }

  await dialog().getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(500);
  record((await dialog().count()) === 0, `${what}: Cancel closes the dialog`);
  record(await exists(), `${what}: and Cancel keeps it`);

  await press.click();
  await dialog().waitFor({ timeout: 5_000 });
  await dialog().getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForURL((at) => !at.pathname.endsWith(url.slice(BASE.length)), { timeout: 10_000 }).catch(() => undefined);
  record(!(await exists()), `${what}: the dialog's Remove removes it`);
}

await sweep();
try {
  const stamp = Date.now();

  /* A provider, with a model reached through it that the dialog has to name. */
  const provider = (await graphql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }',
    { input: { workspaceId: WORKSPACE, name: `${PREFIX} provider ${stamp}`, type: 'OPENAI', endpoint: 'http://remove-asks.invalid/v1' } },
  )).createModelProvider;
  const goesWith = `${PREFIX} goes-with ${stamp}`;
  await graphql('mutation($input: CreateModelInput!) { createModel(input: $input) { id } }', {
    input: { providerId: provider.id, name: goesWith, modelId: 'remove-asks-goes-with' },
  });
  const providerThere = async () =>
    (await graphql('query($id: ID!) { modelProvider(id: $id) { id } }', { id: provider.id })).modelProvider !== null;
  await walk(
    'provider',
    `${BASE}/workspace/${WORKSPACE}/models/providers/${provider.id}`,
    'Remove Provider',
    providerThere,
    [`${PREFIX} provider ${stamp}`, goesWith],
  );

  /* A model, under a provider of its own that is swept afterwards. */
  const host = (await graphql(
    'mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }',
    { input: { workspaceId: WORKSPACE, name: `${PREFIX} host ${stamp}`, type: 'OPENAI', endpoint: 'http://remove-asks.invalid/v1' } },
  )).createModelProvider;
  const model = (await graphql('mutation($input: CreateModelInput!) { createModel(input: $input) { id } }', {
    input: { providerId: host.id, name: `${PREFIX} model ${stamp}`, modelId: 'remove-asks-model' },
  })).createModel;
  const modelThere = async () =>
    (await graphql('query($w: ID!) { models(workspaceId: $w) { id } }', { w: WORKSPACE })).models.some((m) => m.id === model.id);
  await walk('model', `${BASE}/workspace/${WORKSPACE}/models/${model.id}`, 'Remove Model', modelThere, [`${PREFIX} model ${stamp}`]);

  /* A trusted certificate authority. */
  const certificate = (await graphql('mutation($name: String!, $pem: String!) { trustCertificate(name: $name, pem: $pem) { id } }', {
    name: `${PREFIX} CA ${stamp}`,
    pem: SCRATCH_CA,
  })).trustCertificate;
  const certificateThere = async () =>
    (await graphql('query { trustedCertificates { id } }')).trustedCertificates.some((c) => c.id === certificate.id);
  await walk('certificate', `${BASE}/admin/networking/certificates/${certificate.id}`, 'Remove', certificateThere, [`${PREFIX} CA ${stamp}`]);

  /* Discarding a provider never saved has nothing to lose, so it still asks nothing. */
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/new`, { waitUntil: 'domcontentloaded' });
  const discard = danger().getByRole('button', { name: 'Discard', exact: true });
  await discard.waitFor({ timeout: 20_000 });
  await discard.click();
  const left = await page
    .waitForURL((at) => at.pathname === `/workspace/${WORKSPACE}/models`, { timeout: 5_000 })
    .then(() => true)
    .catch(() => false);
  record(left && (await dialog().count()) === 0, 'a provider being added is discarded at once, with no dialog');
} finally {
  await sweep();
}

await finish(browser);
