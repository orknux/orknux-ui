/**
 * A research may be reviewed before it is saved, and the list says which were.
 *
 * New research has Review beside Use web search and Include images, unticked
 * until somebody ticks it - and only then a Reviewer, the model the review is
 * done with. Ticked with no reviewer chosen, Start waits for one; Start sends
 * both, as they were left. A research that was reviewed says so beside its
 * mode on the list.
 *
 * The models are the server's own, made here where the workspace has too few;
 * the list and the start are answered in the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

const held = await graphql(`query($w: ID!) { models(workspaceId: $w) { id name kind } }`, { w: WORKSPACE });
let chat = held.models.filter((one) => one.kind === 'CHAT');
if (chat.length < 2) {
  const provider = (
    await graphql(`mutation ($input: CreateModelProviderInput!) { createModelProvider(input: $input) { id } }`, {
      input: { workspaceId: WORKSPACE, name: `zz review check ${stamp}`, type: 'OPENAI', endpoint: 'https://review.invalid', secret: 'sk-check' },
    })
  ).createModelProvider.id;
  for (let at = chat.length; at < 2; at++) {
    await graphql(`mutation ($input: CreateModelInput!) { createModel(input: $input) { id } }`, {
      input: { providerId: provider, name: `zz review model ${stamp} ${at}`, modelId: `zz-review-${at}`, kind: 'CHAT' },
    });
  }
  chat = (await graphql(`query($w: ID!) { models(workspaceId: $w) { id name kind } }`, { w: WORKSPACE })).models.filter((one) => one.kind === 'CHAT');
}

const ROW = {
  id: '434343', question: 'zz review check: why are there tides?', modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT', websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'COMPLETED', executionId: null, fileName: null, fileUrl: null,
  artifactId: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date(Date.now() - 60_000).toISOString(), finishedAt: new Date().toISOString(),
  earlierExecutionIds: [], review: true, reviewerModelId: null, reviewerModelName: 'Careful model',
  progress: { step: 'Finished', subQuestions: [], searched: [], level: 1, sourcesRead: 0, stage: 'SAVE', reading: null }, sources: [],
};
let started = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('researches(')) {
    return route.fulfill({ json: { data: { researches: { content: [ROW], page: 0, size: 20, totalElements: 1, totalPages: 1 } } } });
  }
  if (query.includes('startResearch(')) {
    started = body.variables?.input ?? null;
    return route.fulfill({ json: { data: { startResearch: { ...ROW, status: 'RUNNING', finishedAt: null } } } });
  }
  if (query.includes('research(id:')) return route.fulfill({ json: { data: { research: { ...ROW, status: 'RUNNING', finishedAt: null, reviewRounds: [] } } } });
  return route.continue();
});

// Forget a remembered choice, so the box starts as a person who never ticked it sees it.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.evaluate((w) => {
  window.localStorage.removeItem(`orknux.research.review.${w}.sieve`);
  window.localStorage.removeItem(`orknux.research.reviewer.${w}.sieve`);
}, WORKSPACE);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-research="434343"]').waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- the list ----------------------------------------------------------------------
const marked = ((await page.locator('[data-research="434343"] [data-reviewed]').textContent().catch(() => '')) ?? '').trim();
record(marked === 'Reviewed', `a reviewed research says so on the list (${marked})`);

// --- the form ----------------------------------------------------------------------
await page.getByRole('button', { name: 'New research' }).click();
const dialog = page.locator('dialog[open]');
await dialog.locator('[data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
const box = dialog.locator('input[type="checkbox"][data-review]');
record((await box.count()) === 1 && !(await box.isChecked()), 'Review is a box, unticked until somebody ticks it');
const label = ((await box.locator('xpath=..').textContent()) ?? '').trim();
record(label === 'Review', `and it says so in one word (${label})`);
record((await dialog.locator('[data-reviewer]').count()) === 0, 'unticked, there is no reviewer to choose');

await box.check();
await dialog.locator('#research-reviewer').waitFor({ timeout: 5_000 }).catch(() => undefined);
record(await dialog.locator('#research-reviewer').isVisible(), 'ticked, the reviewer is chosen with the model picker');
await dialog.locator('textarea#research-question').fill(`zz review check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });
record(await start.isDisabled(), 'and Start waits until a reviewer is chosen');

const reviewer = chat[chat.length - 1].id;
await dialog.locator('#research-reviewer').click();
await page.locator(`[data-model-menu="research-reviewer"] [role="option"][data-value="${reviewer}"]`).click({ timeout: 5_000 }).catch(() => undefined);
record(await start.isEnabled(), 'chosen, Start can be pressed');

await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(started !== null && started.review === true && started.reviewerModelId === reviewer, `Start sends the review and its model (${JSON.stringify({ review: started?.review, reviewerModelId: started?.reviewerModelId })})`);

// --- remembered ----------------------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click();
await page.locator('dialog[open] [data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForFunction((want) => document.querySelector('#research-reviewer')?.getAttribute('data-value') === want, reviewer, { timeout: 10_000 }).catch(() => undefined);
const again = page.locator('dialog[open] input[type="checkbox"][data-review]');
const kept = (await page.locator('#research-reviewer').getAttribute('data-value').catch(() => null)) ?? '';
record((await again.isChecked()) && kept === reviewer, `the next research starts with the review and the reviewer last chosen (${kept})`);

await finish(browser);
