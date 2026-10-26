/**
 * A research may be reviewed before it is saved, and the list says which were.
 *
 * New research has Review beside Use web search and Include images, unticked
 * until somebody ticks it - and only then a Reviewer, the agent the review is
 * done by, starting on the Research reviewer (#678). Start sends both, as they
 * were left. A research that was reviewed says so beside its mode on the list.
 *
 * Follow-up questions is a number beside them, five for somebody who never
 * said and what they said last otherwise, and Start sends it.
 *
 * The agents are the server's own; the list and the start are answered in the
 * browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

// The seeded agents: asking for the modes is what makes them.
await graphql(`query($w: ID!) { researchModes(workspaceId: $w) { id } }`, { w: WORKSPACE });
const agents = (await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id name enabled } } }`, { w: WORKSPACE }))
  .workspaceAgents.content;
const seededReviewer = agents.find((one) => one.name === 'Research reviewer')?.id ?? '';

const ROW = {
  id: '434343', question: 'zz review check: why are there tides?', modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', plannerAgentId: null, plannerAgentName: null, writerAgentId: null, writerAgentName: null,
  reviewerAgentId: null, reviewerAgentName: null,
  language: 'FORMAL', outputFormat: 'DOCUMENT', websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'COMPLETED', executionId: null, fileName: null, fileUrl: null,
  artifactId: null, artifactKey: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date(Date.now() - 60_000).toISOString(), finishedAt: new Date().toISOString(),
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
  window.localStorage.removeItem(`orknux.research.followups.${w}.sieve`);
}, WORKSPACE);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-research="434343"]').waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- the list ----------------------------------------------------------------------
const marked = ((await page.locator('[data-research="434343"] [data-reviewed]').textContent().catch(() => '')) ?? '').trim();
record(marked === 'Reviewed', `a reviewed research says so on the list (${marked})`);
// Whole, not cut to "Review…" by a narrow Mode column: the badge ends inside its cell.
const fits = await page.locator('[data-research="434343"] [data-cell="mode"]').evaluate((cell) => {
  const badge = cell.querySelector('[data-reviewed]');
  return badge !== null && badge.getBoundingClientRect().right <= cell.getBoundingClientRect().right + 0.5 && cell.scrollWidth <= cell.clientWidth;
}).catch(() => false);
record(fits, 'and the badge is shown whole beside the mode');

// --- the form ----------------------------------------------------------------------
await page.getByRole('button', { name: 'New research' }).click();
const dialog = page.locator('dialog[open]');
await dialog.locator('[data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
const box = dialog.locator('input[type="checkbox"][data-review]');
record((await box.count()) === 1 && !(await box.isChecked()), 'Review is a box, unticked until somebody ticks it');
const label = ((await box.locator('xpath=..').textContent()) ?? '').trim();
record(label === 'Review', `and it says so in one word (${label})`);
record((await dialog.locator('[data-reviewer]').count()) === 0, 'unticked, there is no reviewer to choose');
const count = await dialog.locator('input[data-follow-up-count]').inputValue().catch(() => '');
record(count === '5', `Follow-up questions starts at five for somebody who never said (${count})`);
await dialog.locator('input[data-follow-up-count]').fill('2');

await box.check();
await dialog.locator('#research-reviewer').waitFor({ timeout: 5_000 }).catch(() => undefined);
record(await dialog.locator('#research-reviewer').isVisible(), 'ticked, a reviewer is offered');
// The agents arrive after the dialog does.
await page.waitForFunction((want) => document.querySelector('#research-reviewer')?.getAttribute('data-value') === want, seededReviewer, { timeout: 10_000 }).catch(() => undefined);
const startedOn = await chosenOption(page, '#research-reviewer').catch(() => '');
record(startedOn === seededReviewer, `starting on the Research reviewer (${startedOn} for ${seededReviewer})`);
await dialog.locator('textarea#research-question').fill(`zz review check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });

// Another agent reviews: any enabled one but the seeded reviewer.
const reviewer = agents.find((one) => one.enabled && one.id !== seededReviewer)?.id ?? seededReviewer;
await chooseOption(page, '#research-reviewer', { value: reviewer }).catch(() => undefined);
record(await start.isEnabled(), 'chosen, Start can be pressed');

await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(started !== null && started.review === true && started.reviewerAgentId === reviewer, `Start sends the review and its reviewer (${JSON.stringify({ review: started?.review, reviewerAgentId: started?.reviewerAgentId })})`);
record(started?.followUps === 2, `and the number of follow-up questions (${started?.followUps})`);

// --- remembered ----------------------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click();
await page.locator('dialog[open] [data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForFunction((want) => document.querySelector('#research-reviewer')?.getAttribute('data-value') === want, reviewer, { timeout: 10_000 }).catch(() => undefined);
const again = page.locator('dialog[open] input[type="checkbox"][data-review]');
const kept = (await page.locator('#research-reviewer').getAttribute('data-value').catch(() => null)) ?? '';
record((await again.isChecked()) && kept === reviewer, `the next research starts with the review and the reviewer last chosen (${kept})`);
const keptCount = await page.locator('dialog[open] input[data-follow-up-count]').inputValue().catch(() => '');
record(keptCount === '2', `and the number of follow-up questions last chosen (${keptCount})`);

await finish(browser);
