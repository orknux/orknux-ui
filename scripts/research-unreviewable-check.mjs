/**
 * A mode that cannot be reviewed says so on the Review box, not on Start.
 *
 * A research mode's workflow either has a Review step or it does not - a
 * workflow somebody drew their own way may not - and the server refuses to
 * start a reviewed research in one without. New research reads that off the
 * mode (`reviewable`): on such a mode Review is drawn switched off and
 * unticked, the reviewer picker is gone, and a (?) beside the box says why in
 * one sentence. Picking a mode that can be reviewed gives the box back as it
 * was left, and Start on the other sends no review.
 *
 * The modes, the list and the start are answered in the browser, so nothing
 * runs; the models are the server's own, made here where there are none.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

const held = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name kind } }`, { w: WORKSPACE });
let chat = held.models.filter((one) => one.kind === 'CHAT');
if (chat.length < 1) {
  const provider = (
    await graphql(`mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
      input: { workspaceId: WORKSPACE, name: `zz unreviewable check ${stamp}`, type: 'OPENAI', endpoint: 'https://unreviewable.invalid', secret: 'sk-check' },
    })
  ).createModelProvider.id;
  await graphql(`mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
    input: { providerId: provider, name: `zz unreviewable model ${stamp}`, modelId: 'zz-unreviewable', kind: 'CHAT' },
  });
  chat = (await graphql(`query($w: ID!) { models(workspaceId: $w) { id name kind } }`, { w: WORKSPACE })).models.filter((one) => one.kind === 'CHAT');
}

const SENTENCE = "This mode's workflow has no Review step, so it cannot be reviewed";
const MODES = [
  { id: '919191', kind: 'SHALLOW', name: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow', reviewable: true },
  { id: '929292', kind: 'CUSTOM', name: 'zz Patents', workflowId: '2', workflowName: 'My research', reviewable: false },
];
const ROW = {
  id: '939393', question: 'zz unreviewable check', modeId: '929292', modeName: 'zz Patents', workflowId: '2', workflowName: 'My research',
  modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT', websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'RUNNING', executionId: null, fileName: null, fileUrl: null,
  artifactId: null, artifactKey: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date().toISOString(), finishedAt: null,
  earlierExecutionIds: [], review: false, reviewerModelId: null, reviewerModelName: null,
  progress: { step: 'Planning', subQuestions: [], searched: [], level: 1, sourcesRead: 0, stage: 'PLAN', reading: null }, sources: [],
};
let started = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('researchModes(')) return route.fulfill({ json: { data: { researchModes: MODES } } });
  if (query.includes('researches(')) {
    return route.fulfill({ json: { data: { researches: { content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 } } } });
  }
  if (query.includes('startResearch(')) {
    started = body.variables?.input ?? null;
    return route.fulfill({ json: { data: { startResearch: ROW } } });
  }
  if (query.includes('research(id:')) return route.fulfill({ json: { data: { research: { ...ROW, reviewRounds: [] } } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
// A person who reviews by habit: Review remembered as ticked.
await page.evaluate((w) => window.localStorage.setItem(`orknux.research.review.${w}.sieve`, 'on'), WORKSPACE);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click();
const dialog = page.locator('dialog[open]');
const box = dialog.locator('input[type="checkbox"][data-review]');
await box.waitFor({ timeout: 10_000 }).catch(() => undefined);

async function pick(modeId) {
  await dialog.locator('#research-mode').click();
  const name = MODES.find((one) => one.id === modeId).name;
  await page.getByRole('option', { name, exact: true }).first().click({ timeout: 5_000 }).catch(() => undefined);
  await page.waitForFunction((want) => document.querySelector('#research-mode')?.getAttribute('data-value') === want, modeId, { timeout: 5_000 })
    .catch(() => undefined);
  const now = await dialog.locator('#research-mode').getAttribute('data-value').catch(() => null);
  record(now === modeId, `${name} is picked (${now})`);
}

// --- a mode with a Review step ----------------------------------------------------
await pick('919191');
record(await box.isEnabled(), 'on a mode with a Review step, Review can be ticked');
if (!(await box.isChecked())) await box.check();
record(await box.isChecked(), 'and is ticked as it was left');
record(await dialog.locator('[data-reviewer]').isVisible().catch(() => false), 'with the reviewer to choose');
record((await dialog.locator('[data-review-hint]').count()) === 0, 'and nothing beside it to explain');

// --- a mode without -----------------------------------------------------------------
await pick('929292');
record(await box.isDisabled(), 'on a mode with no Review step, Review is switched off');
record(!(await box.isChecked()), 'and drawn unticked');
record((await dialog.locator('[data-reviewer]').count()) === 0, 'and there is no reviewer to choose');

const hint = dialog.locator('[data-review-hint] button[data-hint]');
const drawn = await hint.boundingBox().catch(() => null);
const boxAt = await box.boundingBox().catch(() => null);
record(
  drawn !== null && boxAt !== null && drawn.width > 0 && Math.abs((drawn.y + drawn.height / 2) - (boxAt.y + boxAt.height / 2)) < 12,
  `a (?) beside the box, on its line (${JSON.stringify({ hint: drawn?.y, box: boxAt?.y })})`,
);
await hint.click().catch(() => undefined);
const said = ((await page.locator('[role="note"]').first().textContent({ timeout: 5_000 }).catch(() => '')) ?? '').replace('×', '').trim();
record(said === SENTENCE, `which says why in one sentence (${said})`);
await page.locator('[role="note"] button[aria-label^="Close"]').click({ timeout: 2_000 }).catch(() => undefined);

// --- and Start ------------------------------------------------------------------------
await dialog.locator('textarea#research-question').fill(`zz unreviewable check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });
record(await start.isEnabled(), 'Start does not wait for a reviewer the mode cannot have');
await start.click().catch(() => undefined);
await page.waitForTimeout(500);
record(started !== null && started.review === false && started.reviewerModelId === null,
  `and sends no review (${JSON.stringify({ review: started?.review, reviewerModelId: started?.reviewerModelId })})`);

await finish(browser);
