/**
 * A research may be reviewed before it is saved, and the list says which were.
 *
 * New research has Review beside Use web search and Include images, unticked
 * until somebody ticks it. With a single agent that agent reviews too, so
 * there is no Reviewer to choose; with an agent per step a Reviewer is offered
 * once Review is ticked, empty until somebody picks one, and Start waits for
 * it. Start sends the review with the reviewer, or with the one agent. The
 * next research starts with Review and the reviewer as they were left - the
 * reviewer only because somebody picked it. A research that was reviewed says
 * so beside its mode on the list.
 *
 * Follow-up questions is a number beside them, five for somebody who never
 * said and what they said last otherwise, and Start sends it.
 *
 * The agents are the workspace's own; the list and the start are answered in
 * the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption, chosenOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

// Any of the workspace's agents will do: none is made for research any more.
const agents = (await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id name enabled } } }`, { w: WORKSPACE }))
  .workspaceAgents.content.filter((one) => one.enabled);
record(agents.length > 0, `the workspace has agents to choose (${agents.length})`);
const planner = agents[0]?.id ?? '';
const writer = (agents[1] ?? agents[0])?.id ?? '';
const reviewer = (agents[2] ?? agents[1] ?? agents[0])?.id ?? '';

const ROW = {
  id: '434343', question: 'zz review check: why are there tides?', modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', plannerAgentId: null, plannerAgentName: null, writerAgentId: null, writerAgentName: null,
  reviewerAgentId: null, reviewerAgentName: null, agentMode: 'PER_STEP', parentId: null,
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
  if (query.includes('research(id:')) {
    return route.fulfill({
      json: { data: { research: { ...ROW, status: 'RUNNING', finishedAt: null, result: null, draft: null, estimatedSecondsLeft: null, reviewRounds: [], followUps: [], followUpCount: 2, parentQuestion: null, children: [], sessions: [] } } },
    });
  }
  if (query.includes('researchSearchReady')) return route.fulfill({ json: { data: { researchSearchReady: true } } });
  return route.continue();
});

// Forget a remembered choice, so the form starts as a person who never chose anything sees it.
const PARTS = ['review', 'reviewer', 'followups', 'agents', 'agent', 'planner', 'writer'];
const forget = () => page.evaluate(([w, parts]) => {
  for (const part of parts) window.localStorage.removeItem(`orknux.research.${part}.${w}.sieve`);
}, [WORKSPACE, PARTS]);
const shown = (selector) => page.locator(`dialog[open] ${selector}`).isVisible().catch(() => false);
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await forget();
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
// And the question keeps its room beside the wider Mode column: at 200px it was squeezed to nothing.
const questionWidth = await page.locator('[data-research="434343"] [data-cell="question"]').evaluate((cell) => Math.round(cell.getBoundingClientRect().width)).catch(() => 0);
record(questionWidth >= 200, `and the question keeps its room (${questionWidth}px)`);

// --- the form ----------------------------------------------------------------------
await page.getByRole('button', { name: 'New research' }).click();
const dialog = page.locator('dialog[open]');
await dialog.locator('[data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const box = dialog.locator('input[type="checkbox"][data-review]');
record((await box.count()) === 1 && !(await box.isChecked()), 'Review is a box, unticked until somebody ticks it');
const label = ((await box.locator('xpath=..').textContent()) ?? '').trim();
record(label === 'Review', `and it says so in one word (${label})`);
record(!(await shown('#research-reviewer')), 'unticked, there is no reviewer to choose');
const count = await dialog.locator('input[data-follow-up-count]').inputValue().catch(() => '');
record(count === '5', `Follow-up questions starts at five for somebody who never said (${count})`);
await dialog.locator('input[data-follow-up-count]').fill('2');
await dialog.locator('textarea#research-question').fill(`zz review check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });

// One agent does every step, the review included: ticked, there is still no Reviewer.
record((await chosenOption(page, '#research-agent-mode').catch(() => '')) === 'SINGLE', 'a single agent is the way to start with');
await box.check();
await page.waitForTimeout(200);
record(!(await shown('#research-reviewer')), 'with a single agent, ticking Review offers no Reviewer');

// An agent per step: the Reviewer is offered, empty, and Start waits for it.
await chooseOption(page, '#research-agent-mode', { value: 'PER_STEP' }).catch(() => undefined);
await dialog.locator('#research-reviewer').waitFor({ timeout: 5_000 }).catch(() => undefined);
record(await shown('#research-reviewer'), 'with an agent per step, ticked, a Reviewer is offered');
record((await chosenOption(page, '#research-reviewer').catch(() => 'unread')) === '', 'with nobody chosen for it');
await chooseOption(page, '#research-planner', { value: planner }).catch(() => undefined);
await chooseOption(page, '#research-writer', { value: writer }).catch(() => undefined);
record(!(await start.isEnabled()), 'Start waits for the reviewer');
await chooseOption(page, '#research-reviewer', { value: reviewer }).catch(() => undefined);
record(await start.isEnabled(), 'chosen, Start can be pressed');

await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(
  started !== null && started.review === true && started.agentMode === 'PER_STEP' && started.reviewerAgentId === reviewer,
  `Start sends the review and its reviewer (${JSON.stringify({ review: started?.review, mode: started?.agentMode, reviewerAgentId: started?.reviewerAgentId })})`,
);
record(started?.followUps === 2, `and the number of follow-up questions (${started?.followUps})`);

// --- remembered ----------------------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click();
await page.locator('dialog[open] [data-review]').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForFunction((want) => document.querySelector('#research-reviewer')?.getAttribute('data-value') === want, reviewer, { timeout: 10_000 }).catch(() => undefined);
const again = page.locator('dialog[open] input[type="checkbox"][data-review]');
const kept = (await page.locator('#research-reviewer').getAttribute('data-value').catch(() => null)) ?? '';
record((await again.isChecked()) && kept === reviewer, `the next research starts with the review and the reviewer somebody chose (${kept})`);
const keptCount = await page.locator('dialog[open] input[data-follow-up-count]').inputValue().catch(() => '');
record(keptCount === '2', `and the number of follow-up questions last chosen (${keptCount})`);

// With a single agent, that agent is sent with the review, and no reviewer beside it.
const next = page.locator('dialog[open]');
await chooseOption(page, '#research-agent-mode', { value: 'SINGLE' }).catch(() => undefined);
await chooseOption(page, '#research-agent', { value: planner }).catch(() => undefined);
await next.locator('textarea#research-question').fill(`zz review check single ${stamp}`);
started = null;
await next.getByRole('button', { name: /^Start$/ }).click().catch(() => undefined);
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(
  started !== null && started.review === true && started.agentMode === 'SINGLE' && started.agentId === planner && !started.reviewerAgentId,
  `with a single agent, Start sends the review and that agent alone (${JSON.stringify({ review: started?.review, mode: started?.agentMode, agentId: started?.agentId, reviewerAgentId: started?.reviewerAgentId })})`,
);

await forget();
await finish(browser);
