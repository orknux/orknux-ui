/**
 * A research runs with agents, not models, and nothing is chosen for anybody.
 * Issue #678, and the two ways of choosing after it.
 *
 * With an agent for each step, New research shows a Planner and a Writer -
 * and, once Review is ticked, a Reviewer - each empty until somebody picks
 * from the workspace's agents, each row saying beside it, not in it, the
 * model that agent thinks with. There is no model picker, and Start stays off
 * until every agent it needs is chosen. Start sends the agents and no model;
 * an agent somebody chose for a step is chosen again next time; and the
 * research names the agents it was started with, each a link to its page.
 *
 * The start and the research are answered in the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish, chosenOption, chooseOption, optionsOffered } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

const listed = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id name enabled modelName } } }`, { w: WORKSPACE });
const agents = listed.workspaceAgents.content;
const enabledAgents = agents.filter((one) => one.enabled);
record(enabledAgents.length >= 2, `the workspace has agents to choose from (${enabledAgents.length})`);
const planner = enabledAgents[0];
const writer = enabledAgents[1] ?? enabledAgents[0];
const reviewer = enabledAgents[2] ?? enabledAgents[0];

const ROW = {
  id: '676767', question: `zz agents check ${stamp}`, modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', plannerAgentId: planner?.id ?? null, plannerAgentName: planner?.name ?? null,
  writerAgentId: writer?.id ?? null, writerAgentName: writer?.name ?? null, reviewerAgentId: reviewer?.id ?? null, reviewerAgentName: reviewer?.name ?? null,
  agentMode: 'PER_STEP',
  language: 'FORMAL', outputFormat: 'DOCUMENT', websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'RUNNING', executionId: null, fileName: null, fileUrl: null,
  artifactId: null, artifactKey: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date().toISOString(), finishedAt: null,
  earlierExecutionIds: [], review: true, reviewerModelId: null, reviewerModelName: 'Stub', parentId: null,
  progress: { step: 'Planning', subQuestions: [], searched: [], level: 1, sourcesRead: 0, stage: 'PLAN', reading: null }, sources: [],
};
let started = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('startResearch(')) {
    started = body.variables?.input ?? null;
    return route.fulfill({ json: { data: { startResearch: ROW } } });
  }
  if (query.includes('research(id:')) {
    return route.fulfill({
      json: { data: { research: { ...ROW, result: null, draft: null, estimatedSecondsLeft: null, reviewRounds: [], followUps: [], followUpCount: 5, parentQuestion: null, children: [] } } },
    });
  }
  // As if the workspace's search had a key, so Start is held back by the agents alone.
  if (query.includes('researchSearchReady')) return route.fulfill({ json: { data: { researchSearchReady: true } } });
  return route.continue();
});

const PARTS = ['agents', 'agent', 'planner', 'writer', 'reviewer', 'review'];
const forget = () => page.evaluate(([w, parts]) => {
  for (const part of parts) window.localStorage.removeItem(`orknux.research.${part}.${w}.sieve`);
}, [WORKSPACE, PARTS]);

// A person who never chose, who asks for an agent for each step.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await forget();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await dialog.locator('#research-agent-mode').waitFor({ timeout: 10_000 }).catch(() => undefined);
await chooseOption(page, '#research-agent-mode', { value: 'PER_STEP' }).catch(() => undefined);
await dialog.locator('#research-planner').waitFor({ timeout: 10_000 }).catch(() => undefined);

// --- the pickers -------------------------------------------------------------
record((await dialog.locator('#research-model').count()) === 0, 'there is no model picker');
record(await dialog.locator('#research-planner').isVisible().catch(() => false), 'the planner is picked from the agents');
record(await dialog.locator('#research-writer').isVisible().catch(() => false), 'and so is the writer');
await page.waitForTimeout(500);
const plannerChosen = await chosenOption(page, '#research-planner').catch(() => 'unread');
const writerChosen = await chosenOption(page, '#research-writer').catch(() => 'unread');
record(plannerChosen === '' && writerChosen === '', `each starts with no agent chosen (${JSON.stringify([plannerChosen, writerChosen])})`);
const offered = await optionsOffered(page, '#research-writer').catch(() => []);
const names = enabledAgents.map((one) => one.name).sort();
record(
  JSON.stringify(offered.filter((one) => one.value !== '').map((one) => one.label).sort()) === JSON.stringify(names),
  `the workspace's agents are offered, by name alone (${offered.length - 1} of ${names.length})`,
);

await dialog.locator('textarea#research-question').fill(`zz agents check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });
record(!(await start.isEnabled()), 'Start waits until the agents are chosen');

// The model an agent thinks with is said beside its row, not in it.
await dialog.locator('#research-writer').click();
const writerRow = page.getByRole('option', { name: writer.name, exact: true }).first();
await writerRow.hover().catch(() => undefined);
await page.waitForTimeout(150);
const hint = ((await page.locator('[data-select-hint]').first().textContent().catch(() => '')) ?? '').trim();
record(hint !== '' && hint === (writer?.modelName ?? 'No model'), `the row's hint is the model it thinks with (${hint})`);
await page.keyboard.press('Escape');

await chooseOption(page, '#research-planner', { value: planner.id }).catch(() => undefined);
await chooseOption(page, '#research-writer', { value: writer.id }).catch(() => undefined);
record((await chosenOption(page, '#research-writer').catch(() => '')) === writer.id, `an agent is chosen to write it (${writer.name})`);
record(await start.isEnabled(), 'with a planner and a writer chosen, Start can be pressed');

// Ticked, a reviewer appears - empty, and holding Start back until chosen.
await dialog.locator('input[type="checkbox"][data-review]').check();
await dialog.locator('#research-reviewer').waitFor({ timeout: 5_000 }).catch(() => undefined);
record((await chosenOption(page, '#research-reviewer').catch(() => 'unread')) === '', 'ticking Review offers a reviewer, with none chosen');
record(!(await start.isEnabled()), 'and Start waits for it');
await chooseOption(page, '#research-reviewer', { value: reviewer.id }).catch(() => undefined);
await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(
  started !== null && started.agentMode === 'PER_STEP' && started.agentId === null &&
    started.plannerAgentId === planner.id && started.writerAgentId === writer.id && started.reviewerAgentId === reviewer.id,
  `Start sends an agent for each step (${JSON.stringify({ mode: started?.agentMode, planner: started?.plannerAgentId, writer: started?.writerAgentId, reviewer: started?.reviewerAgentId })})`,
);
record(started !== null && !('modelId' in started) && !('reviewerModelId' in started), 'and no model');

// --- the research names them ----------------------------------------------------
await page.locator('[data-research-planner]').waitFor({ timeout: 15_000 }).catch(() => undefined);
const plannerShown = ((await page.locator('[data-research-planner]').textContent().catch(() => '')) ?? '').trim();
const plannerLink = (await page.locator('[data-research-planner] a[data-agent-link]').getAttribute('href').catch(() => null)) ?? '';
record(plannerShown === planner.name && plannerLink === `/workspace/${WORKSPACE}/agents/${planner.id}/settings`, `the research names its planner, a link to its page (${plannerShown} ${plannerLink})`);
const writerShown = ((await page.locator('[data-research-writer]').textContent().catch(() => '')) ?? '').trim();
record(writerShown === writer.name, `and its writer (${writerShown})`);
const reviewerShown = ((await page.locator('[data-research-reviewer]').textContent().catch(() => '')) ?? '').trim();
record(reviewerShown === reviewer.name, `and its reviewer, by the agent (${reviewerShown})`);

// --- remembered ----------------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
await page.waitForFunction((want) => document.querySelector('#research-writer')?.getAttribute('data-value') === want, writer.id, { timeout: 10_000 }).catch(() => undefined);
record((await chosenOption(page, '#research-agent-mode').catch(() => '')) === 'PER_STEP', 'an agent for each step is the way chosen again next time');
record((await chosenOption(page, '#research-writer').catch(() => '')) === writer.id, 'and the writer somebody chose is chosen again');

// Forgotten again, so the next run of anything starts where a new person would.
await forget();
await finish(browser);
