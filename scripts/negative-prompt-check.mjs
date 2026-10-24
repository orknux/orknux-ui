/**
 * A negative prompt is offered where the model draws with one, and sent.
 *
 * Issue #657. The server half is `DesignImageAPITest` and `TaskPictureTest`, on
 * both engines over stubs on the loopback: the negative prompt reaches
 * stable-diffusion.cpp's server inside the prompt and a WebUI's img2img in its
 * body, the model's own default stands in for none, and a model whose provider
 * takes none refuses one. What no server test can say is what the screen does
 * with that:
 *
 *   - a model on a stable-diffusion.cpp provider has a Default negative prompt
 *     on its page, which saves; one on an OpenAI provider has none;
 *   - the image editor draws a Negative prompt box under the prompt for the
 *     first and not for the second, with the model's default as its
 *     placeholder, and Generate sends what is typed in it.
 *
 * The models are the server's own, made here and taken away again - the field
 * is shown off the server's `takesNegativePrompt`, which is the thing under
 * test. Only the queueing mutation is answered in the browser, so nothing is
 * drawn and nothing needs an image server.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, optionsArrived } from './suite/harness.mjs';

const PREFIX = 'zzNegative';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ----------------------------------------------------------- the fixture */

async function sweep() {
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  for (const old of models.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, { w: WORKSPACE });
  for (const old of modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

/** An image model on a provider of its own; nothing here calls either. */
async function imageModel(type, name) {
  const provider = (
    await graphql(`mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} ${name} provider`, type, endpoint: 'http://images.invalid:8085' },
    })
  ).createModelProvider;
  return (
    await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id name } }`, {
      input: { providerId: provider.id, name: `${PREFIX} ${name}`, modelId: `${name}-model`, kind: 'IMAGE' },
    })
  ).createModel;
}

await sweep();
const local = await imageModel('STABLE_DIFFUSION_CPP', 'Local');
const hosted = await imageModel('OPENAI', 'Hosted');

try {
  /* ------------------------------------------------------ the model's page */

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${local.id}`, { waitUntil: 'domcontentloaded' });
  const fieldOnPage = page.locator('#model-negative-prompt');
  await fieldOnPage.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  record((await fieldOnPage.count()) === 1, 'a stable-diffusion.cpp model has a default negative prompt on its page');
  await fieldOnPage.fill('blurry, text');
  await page.getByRole('button', { name: 'Save Changes' }).last().click();
  await page.waitForTimeout(1500);
  const saved = (await graphql(`query($id: ID!) { model(id: $id) { negativePrompt } }`, { id: local.id })).model.negativePrompt;
  record(saved === 'blurry, text', `and saving the page saves it (the model holds ${JSON.stringify(saved)})`);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/models/${hosted.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#model-name').waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
  record((await page.locator('#model-name').count()) === 1 && (await page.locator('#model-negative-prompt').count()) === 0,
    'an OpenAI model has none, since its API takes no negative prompt');

  /* ------------------------------------------------------ the image editor */

  const queued = [];
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('queueDesignImage(')) {
      const input = body.variables?.input ?? {};
      queued.push(input);
      const job = { id: '990001', status: 'QUEUED', prompt: input.prompt, modelId: input.modelId, model: 'Stub', size: null, quality: null,
        style: null, negativePrompt: input.negativePrompt ?? null, requestedBy: 'alice', requestedAt: new Date().toISOString(),
        startedAt: null, reason: null, ahead: 0, name: input.prompt, sourceId: null, upscaler: null, scale: null, image: null };
      return route.fulfill({ json: { data: { queueDesignImage: job } } });
    }
    if (query.includes('designImageJob(')) return route.fulfill({ json: { data: { designImageJob: null } } });
    return route.continue();
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/new`, { waitUntil: 'domcontentloaded' });
  await optionsArrived(page, '#image-model', 2);
  const box = page.locator('#image-negative');

  await chooseOption(page, '#image-model', hosted.id);
  await page.waitForTimeout(500);
  record((await box.count()) === 0, 'the editor offers no negative prompt for a model that takes none');

  await chooseOption(page, '#image-model', local.id);
  await box.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => undefined);
  record((await box.count()) === 1, 'and offers one for a model that does');
  // The prompt's frame, not the textarea: the textarea is taller than the frame that shows it and scrolls inside it.
  const promptBox = await page.locator('#image-prompt').locator('xpath=..').boundingBox().catch(() => null);
  const negativeBox = await box.boundingBox().catch(() => null);
  record(promptBox !== null && negativeBox !== null && negativeBox.y > promptBox.y + promptBox.height - 1,
    `under the prompt (prompt ${JSON.stringify(promptBox)}, negative ${JSON.stringify(negativeBox)})`);
  record((await box.getAttribute('placeholder')) === 'blurry, text', `with the model's own default as its placeholder (${await box.getAttribute('placeholder')})`);

  await page.locator('#image-prompt').fill('zz a lighthouse at dusk');
  await box.fill('people, text');
  await page.getByRole('button', { name: 'Generate' }).click();
  await page.waitForTimeout(800);
  const sent = queued.at(-1);
  record(sent?.negativePrompt === 'people, text' && String(sent?.modelId) === String(local.id),
    `Generate sends it with the picture asked for (${JSON.stringify(sent)})`);
} finally {
  await sweep();
}

await finish(browser);
