/**
 * An image node offers only what its model takes, and a free size has presets.
 *
 * Issue #431. The panel used to draw one fixed trio of pickers whatever the
 * model; it now asks the server what the chosen model's endpoint takes and
 * draws one control per answer. What no server test can say is whether the
 * screen follows the answer, which is what this walks:
 *
 *   - a DALL-E 3 gets a size, a quality and a style picker, each holding the
 *     model's own choices and nothing off another model's list;
 *   - a model on a provider that is not OpenAI's gets Width, Height and a
 *     Preset menu, and neither a quality nor a style;
 *   - picking a preset fills both boxes, and a preset the model cannot draw is
 *     offered greyed out;
 *   - switching models takes a parameter the new model does not take off the
 *     node, so the save cannot be refused over a control nobody can see;
 *   - the Manage presets dialog adds, edits in place, moves and - after the
 *     app's own confirm - removes a preset, and the menu follows.
 *
 * It builds two image models of its own and takes them away again, and the
 * preset it adds is removed by the walk itself; a sweep at the start clears
 * what a killed run left. The graph is never saved.
 *
 * ORKNUX_IMAGE_CANNED=1 answers the three families this needs - the models,
 * the parameters and the presets - from the page instead of the server, for a
 * checkout whose server does not have the schema yet. The default is live.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, shot, finish } from './suite/harness.mjs';

const PREFIX = 'zzParams';
const CANNED = process.env.ORKNUX_IMAGE_CANNED === '1';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

/* ----------------------------------------------------------- the fixture */

const MODEL_FIELDS = 'id name kind enabled providerId workspaceId providerName modelId';

async function sweep() {
  if (CANNED) return;
  const { models } = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name providerId } }`, { w: WORKSPACE });
  for (const old of models.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModel(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { modelProviders } = await graphql(`query($w: ID!) { modelProviders(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const old of modelProviders.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeModelProvider(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
  const { imageSizePresets } = await graphql(`query($w: ID!) { imageSizePresets(workspaceId: $w) { id name } }`, {
    w: WORKSPACE,
  });
  for (const old of imageSizePresets.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeImageSizePreset(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}

/** A provider of this type and an image model on it, named so the sweep finds them. */
async function imageModel(type, endpoint, modelId, name) {
  const { createModelProvider } = await graphql(
    `mutation($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `${PREFIX} ${name} provider`, endpoint, type, secret: 'sk-check' } },
  );
  const { createModel } = await graphql(`mutation($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
    input: { providerId: createModelProvider.id, name: `${PREFIX} ${name}`, modelId, kind: 'IMAGE' },
  });
  return createModel.id;
}

const DALLE = `${PREFIX} DALL-E`;
const HOSTED = `${PREFIX} Hosted`;

/*
 * The canned half: what the server would answer for two models and a menu of
 * presets, kept in the page so the dialog's changes are visible to the menu.
 */
if (CANNED) {
  const specs = {
    'm-dalle': [
      { name: 'size', kind: 'CHOICE', choices: ['1024x1024', '1792x1024', '1024x1792'], minSide: null, maxSide: null, step: null },
      { name: 'quality', kind: 'CHOICE', choices: ['standard', 'hd'], minSide: null, maxSide: null, step: null },
      { name: 'style', kind: 'CHOICE', choices: ['vivid', 'natural'], minSide: null, maxSide: null, step: null },
    ],
    'm-hosted': [{ name: 'size', kind: 'DIMENSIONS', choices: [], minSide: 64, maxSide: 4096, step: 8 }],
  };
  const model = (id, name, modelId) => ({
    id, name, modelId, kind: 'IMAGE', enabled: true, providerId: 'p1', workspaceId: WORKSPACE, providerName: 'Canned',
  });
  let presets = [
    { id: 'ps1', workspaceId: WORKSPACE, name: 'Square 1024', width: 1024, height: 1024, position: 0 },
    { id: 'ps2', workspaceId: WORKSPACE, name: 'Landscape 1536', width: 1536, height: 1024, position: 1 },
    { id: 'ps3', workspaceId: WORKSPACE, name: 'Too wide', width: 5000, height: 1024, position: 2 },
  ];
  let next = 10;
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    const vars = body.variables ?? {};
    const answer = (data) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });
    if (query.includes('query Models(')) {
      return answer({ models: [model('m-dalle', DALLE, 'dall-e-3'), model('m-hosted', HOSTED, 'sdxl')] });
    }
    if (query.includes('imageModelParameters(')) return answer({ imageModelParameters: specs[vars.modelId] ?? [] });
    if (query.includes('addImageSizePreset(')) {
      const made = { id: `ps${next++}`, workspaceId: WORKSPACE, name: vars.name, width: vars.width, height: vars.height, position: presets.length };
      presets = [...presets, made];
      return answer({ addImageSizePreset: made });
    }
    if (query.includes('updateImageSizePreset(')) {
      presets = presets.map((one) =>
        one.id === vars.id
          ? { ...one, name: vars.name ?? one.name, width: vars.width ?? one.width, height: vars.height ?? one.height }
          : one,
      );
      return answer({ updateImageSizePreset: presets.find((one) => one.id === vars.id) });
    }
    if (query.includes('reorderImageSizePresets(')) {
      presets = vars.ids.map((id, at) => ({ ...presets.find((one) => one.id === id), position: at }));
      return answer({ reorderImageSizePresets: presets });
    }
    if (query.includes('removeImageSizePreset(')) {
      presets = presets.filter((one) => one.id !== vars.id);
      return answer({ removeImageSizePreset: true });
    }
    if (query.includes('imageSizePresets(')) return answer({ imageSizePresets: presets });
    return route.continue();
  });
}

await sweep();
if (!CANNED) {
  await imageModel('OPENAI', 'http://localhost:8199', 'dall-e-3', 'DALL-E');
  await imageModel('OLLAMA', 'http://localhost:11434', 'sdxl', 'Hosted');
}

/* ----------------------------------------------------------- the walk */

/** The picker's own list, not any other listbox the page happens to hold. */
const listOf = (id) => page.locator(`#${id}`).locator('..').getByRole('listbox');

/** What a picker offers, read by opening it and closing it again. */
async function choicesOf(id) {
  await page.locator(`#${id}`).click();
  await listOf(id).waitFor({ state: 'visible', timeout: 5_000 });
  const rows = await listOf(id).getByRole('option').allInnerTexts();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  return rows.map((one) => one.trim());
}

async function choose(id, label) {
  await page.locator(`#${id}`).click();
  await listOf(id).getByRole('option', { name: label, exact: true }).click();
  await page.waitForTimeout(400);
}

/** The three controls this is about, and nothing else on the page named image-something. */
const IMAGE_CONTROLS =
  '[data-testid="image-size-choice"], [data-testid="image-quality-choice"], [data-testid="image-style-choice"], [data-testid="image-size-dimensions"]';

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(1500);

  await page.getByRole('button', { name: /add node/i }).click();
  await page.waitForTimeout(300);
  await page.getByRole('menuitem', { name: /^image model$/i }).click();
  await page.waitForTimeout(800);

  record((await page.locator(IMAGE_CONTROLS).count()) === 0, 'with no model chosen, the panel draws no size, quality or style at all');

  // ---- DALL-E 3: three pickers, each the model's own list -----------------
  await choose('node-image-model', DALLE);
  await page.locator('[data-testid="image-style-choice"]').waitFor({ state: 'visible', timeout: 10_000 });
  record(true, 'a DALL-E 3 draws a size, a quality and a style');
  record((await page.locator('[data-testid="image-size-dimensions"]').count()) === 0, 'and no width and height boxes');

  const sizes = await choicesOf('node-image-size');
  record(
    JSON.stringify(sizes) === JSON.stringify(['Model default', '1024x1024', '1792x1024', '1024x1792']),
    `the size picker holds the model default and DALL-E 3's three sizes (${JSON.stringify(sizes)})`,
  );
  const qualities = await choicesOf('node-image-quality');
  record(
    JSON.stringify(qualities) === JSON.stringify(['Model default', 'standard', 'hd']),
    `the quality picker holds standard and hd and nothing of gpt-image-1's (${JSON.stringify(qualities)})`,
  );
  const styles = await choicesOf('node-image-style');
  record(JSON.stringify(styles) === JSON.stringify(['Model default', 'vivid', 'natural']), `the style picker holds vivid and natural (${JSON.stringify(styles)})`);

  await choose('node-image-style', 'vivid');
  record((await page.locator('#node-image-style').innerText()).includes('vivid'), 'a style can be chosen');
  await page.screenshot({ path: shot('image-parameters-dalle.png') });

  // ---- A self-hosted model: width, height, preset, nothing else ---------
  await choose('node-image-model', HOSTED);
  await page.locator('[data-testid="image-size-dimensions"]').waitFor({ state: 'visible', timeout: 10_000 });
  record(true, 'a model on another provider draws Width and Height');
  record((await page.locator('[data-testid="image-quality-choice"]').count()) === 0, 'and no quality picker');
  record((await page.locator('[data-testid="image-style-choice"]').count()) === 0, 'and no style picker');

  const preset = page.locator('#node-image-preset');
  const offered = await preset.locator('option').allInnerTexts();
  record(offered.some((one) => one.startsWith('Landscape 1536')), `the Preset menu offers the workspace's presets (${JSON.stringify(offered).slice(0, 160)})`);
  if (CANNED) {
    record(await preset.locator('option', { hasText: 'Too wide' }).isDisabled(), 'a preset outside the model’s bounds is greyed out');
  }
  await preset.selectOption({ label: offered.find((one) => one.startsWith('Landscape 1536')) });
  await page.waitForTimeout(300);
  record((await page.locator('#node-image-width').inputValue()) === '1536', 'picking a preset fills the width');
  record((await page.locator('#node-image-height').inputValue()) === '1024', 'and the height');

  await page.locator('#node-image-width').fill('800');
  await page.locator('#node-image-height').fill('600');
  await page.waitForTimeout(300);
  record((await preset.inputValue()) === '', 'a size typed by hand is no preset, so the menu says so');
  await page.screenshot({ path: shot('image-parameters-hosted.png') });

  // ---- Switching back: the style the hosted model did not take is gone --
  await choose('node-image-model', DALLE);
  await page.locator('[data-testid="image-style-choice"]').waitFor({ state: 'visible', timeout: 10_000 });
  record(
    (await page.locator('#node-image-style').innerText()).includes('Model default'),
    'a style chosen on DALL-E 3 was taken off the node while a model that takes none was chosen',
  );

  // ---- Manage presets --------------------------------------------------
  await choose('node-image-model', HOSTED);
  await page.locator('[data-testid="image-size-dimensions"]').waitFor({ state: 'visible', timeout: 10_000 });
  await page.getByRole('button', { name: 'Manage presets' }).click();
  const dialog = page.locator('[data-testid="image-size-presets"]');
  await dialog.waitFor({ state: 'visible', timeout: 5_000 });
  record((await dialog.locator('button[data-hint="Size presets"]').count()) === 1, 'the dialog’s explanation is behind the (?)');

  const NAME = `${PREFIX} Thumb`;
  await dialog.locator('#new-image-size-preset').fill(NAME);
  await dialog.getByLabel('Width').fill('600');
  await dialog.getByLabel('Height').fill('400');
  await dialog.getByRole('button', { name: 'Add', exact: true }).click();
  await dialog.locator('li', { hasText: NAME }).waitFor({ state: 'visible', timeout: 5_000 });
  const added = dialog.locator('li', { hasText: NAME });
  record((await added.innerText()).includes('600×400'), 'a preset is added with its size');
  const rows = await dialog.locator('li').count();
  record(await dialog.locator(`button[aria-label="Move ${NAME} down"]`).isDisabled(), 'the new one is last, so it cannot move down');

  await added.getByRole('button', { name: NAME, exact: true }).click();
  await dialog.locator(`input[aria-label="Width of ${NAME}"]`).fill('640');
  await dialog.locator(`input[aria-label="Width of ${NAME}"]`).press('Enter');
  await page.waitForTimeout(600);
  record((await dialog.locator('li', { hasText: NAME }).innerText()).includes('640×400'), 'the width is edited in place');

  await dialog.locator(`button[aria-label="Move ${NAME} up"]`).click();
  await page.waitForTimeout(600);
  const order = await dialog.locator('li').allInnerTexts();
  record(order[rows - 2]?.includes(NAME) === true, `moving up puts it one row higher (${JSON.stringify(order.map((one) => one.split(String.fromCharCode(10))[0]))})`);
  await page.screenshot({ path: shot('image-parameters-presets.png') });

  await dialog.locator(`button[aria-label="Remove ${NAME}"]`).click();
  // The confirm is its own dialog beside the presets one, not inside it - see
  // ImageSizePresetsDialog for why - so it is the open dialog that is not that one.
  const confirm = page.locator('dialog[open]:not([data-testid="image-size-presets"])');
  await confirm.waitFor({ state: 'visible', timeout: 5_000 });
  record((await confirm.innerText()).includes(NAME), 'removing asks first, naming the preset');
  await confirm.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.waitForTimeout(800);
  record((await dialog.locator('li', { hasText: NAME }).count()) === 0, 'and it is gone once confirmed');

  await dialog.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(300);
  const after = await preset.locator('option').allInnerTexts();
  record(!after.some((one) => one.startsWith(NAME)), 'the Preset menu follows the dialog');
} finally {
  await sweep().catch(() => undefined);
}

await finish(browser);
