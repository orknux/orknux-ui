/**
 * Models go out as a file and come back in, from the Models page.
 *
 * Export saves the models the list shows - the search and type filter applied -
 * under their providers and without any key. Import reads such a file: a
 * provider and models this workspace lacks are added, and the line under the
 * heading says what was added and which provider needs a key.
 *
 * Makes its own provider and models through the import, and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();
const PROVIDER = `zz transfer ${stamp}`;
const FILE = {
  format: 'orknux-models',
  formatVersion: 1,
  modelProviders: [{
    name: PROVIDER, endpoint: 'http://transfer.invalid/v1', credentialNeeded: true, type: 'OPENAI',
    models: [{ name: `zz ${stamp} Talker`, modelId: 'talker', kind: 'CHAT' }, { name: `zz ${stamp} Drawer`, modelId: 'drawer', kind: 'IMAGE' }],
  }],
};

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/models`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('models-import').waitFor({ timeout: 20_000 });

  await page.getByTestId('models-import-file').setInputFiles({
    name: 'models.orkx.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(FILE)),
  });
  const note = page.getByTestId('models-transfer-note');
  await note.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const said = (await note.innerText().catch(() => '')).trim();
  record(said.includes('2 models added') && said.includes(`add a key to ${PROVIDER}`), `Import adds the models and says which provider needs a key (${said})`);

  // Narrowed to the two just added, Export saves exactly those, with their provider and no key.
  await page.getByPlaceholder('Search models...').fill(`zz ${stamp}`);
  await page.waitForTimeout(600);
  const waiting = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
  await page.getByTestId('models-export').click();
  const download = await waiting;
  let file = null;
  if (download !== null) {
    const chunks = [];
    for await (const chunk of await download.createReadStream()) chunks.push(chunk);
    file = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const exported = (file?.modelProviders ?? []).flatMap((provider) => provider.models.map((model) => `${provider.name} / ${model.name}`));
  record(file?.format === 'orknux-models' && download?.suggestedFilename() === 'models.orkx.json'
    && JSON.stringify(exported.sort()) === JSON.stringify([`${PROVIDER} / zz ${stamp} Drawer`, `${PROVIDER} / zz ${stamp} Talker`])
    && file.modelProviders.every((provider) => provider.secret === undefined && JSON.stringify(provider).indexOf('sk-') < 0),
    `Export saves the models the list shows, under their provider, without a key (${JSON.stringify(exported)})`);

  // One provider from its own row: the provider with every model it has, in a file named after it.
  await page.getByPlaceholder('Search providers...').fill(PROVIDER);
  const button = page.locator(`[data-testid="provider-export"][aria-label="Export ${PROVIDER}"]`);
  await button.waitFor({ timeout: 10_000 }).catch(() => undefined);
  const placed = await button.evaluate((held) => {
    const settings = held.parentElement?.querySelector('a[href*="/models/providers/"]');
    if (!settings) return null;
    const a = held.getBoundingClientRect();
    const b = settings.getBoundingClientRect();
    return { centres: Math.round(Math.abs((a.top + a.height / 2) - (b.top + b.height / 2))), height: Math.round(a.height), settingsHeight: Math.round(b.height), before: a.right <= b.left };
  }).catch(() => null);
  record(placed !== null && placed.centres <= 1 && placed.height === placed.settingsHeight && placed.before,
    `the provider row offers Export beside its settings (${JSON.stringify(placed)})`);
  const waitingOne = page.waitForEvent('download', { timeout: 10_000 }).catch(() => null);
  await button.click().catch(() => undefined);
  const one = await waitingOne;
  let oneFile = null;
  if (one !== null) {
    const chunks = [];
    for await (const chunk of await one.createReadStream()) chunks.push(chunk);
    oneFile = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }
  const shipped = (oneFile?.modelProviders ?? []).map((provider) => `${provider.name}: ${provider.models.length}`);
  record(oneFile?.format === 'orknux-models' && JSON.stringify(shipped) === JSON.stringify([`${PROVIDER}: 2`])
    && one?.suggestedFilename() === `${PROVIDER.replace(/[^\w.-]+/g, '-')}.orkx.json`
    && JSON.stringify(oneFile).indexOf('sk-') < 0,
    `Export on a provider's row saves that provider with all its models (${JSON.stringify(shipped)}, ${one?.suggestedFilename()})`);
} finally {
  const { modelProviders } = await graphql('query($w: ID!) { modelProviders(workspaceId: $w) { id name } }', { w: WORKSPACE }).catch(() => ({ modelProviders: [] }));
  for (const provider of (modelProviders ?? []).filter((one) => one.name === PROVIDER)) {
    await graphql('mutation($id: ID!) { removeModelProvider(id: $id) }', { id: provider.id }).catch(() => undefined);
  }
}

await finish(browser);
