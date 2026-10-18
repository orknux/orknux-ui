/**
 * A provider says how its server reads a picture edit's mask.
 *
 * stable-diffusion.cpp's server reads it white for the change where the
 * standard marks the change transparent, so a provider page for an OpenAI or a
 * stable-diffusion.cpp provider carries an Edit mask field: the type's own way,
 * or either one said outright - and what is chosen is saved.
 *
 * The provider is answered here, so the check needs no image server.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PROVIDER = {
  id: '9777', workspaceId: WORKSPACE, name: 'zz sd server', type: 'STABLE_DIFFUSION_CPP', endpoint: 'http://192.0.2.1:8087/v1',
  authMethod: 'API_KEY', apiVersion: null, deploymentName: null, region: null, tenantId: null, clientId: null, scope: null,
  secretSet: false, secretVariableId: null, secretVariableName: null, secretVariableMissing: false, status: 'NOT_CHECKED',
  lastCheckMessage: null, lastCheckedAt: null, checkEnabled: true, throttleTokensPerSecond: null, throttleRequestsPerSecond: null,
  acceptRetryAfter: true, chatApi: null, sendsReasoning: false, offerAllTools: null, offersAllTools: false, maxTools: null,
  toolCap: 0, editMask: null,
};
const saved = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('updateModelProvider')) {
    saved.push(body.variables?.input);
    return route.fulfill({ json: { data: { updateModelProvider: { ...PROVIDER, editMask: body.variables?.input?.editMask ?? null } } } });
  }
  if (/modelProvider\(/.test(query)) {
    const answered = await route.fetch().catch(() => null);
    const json = answered === null ? {} : await answered.json().catch(() => ({}));
    const data = { ...(json.data ?? {}), modelProvider: PROVIDER };
    return route.fulfill({ json: { ...json, data } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/models/providers/${PROVIDER.id}`, { waitUntil: 'domcontentloaded' });
const field = page.getByTestId('edit-mask');
await field.waitFor({ timeout: 20_000 }).catch(() => undefined);
const options = await field.locator('option').allInnerTexts().catch(() => []);
record(options.length === 3 && options[0].includes('white marks the change'),
  `the provider page asks how the server reads an edit mask, the type's way first (${JSON.stringify(options)})`);
const type = await page.locator('#provider-type').evaluate((one) => one.selectedOptions[0]?.textContent ?? '').catch(() => '');
record(/stable-diffusion\.cpp/.test(type), `and offers stable-diffusion.cpp as a type (${type})`);

await field.selectOption('TRANSPARENT');
await page.getByRole('button', { name: /^Save Changes$/ }).click().catch(() => undefined);
await page.waitForTimeout(800);
record(saved.some((one) => one?.editMask === 'TRANSPARENT'), `and Save stores what was chosen (${JSON.stringify(saved.map((one) => one?.editMask))})`);

await finish(browser);
