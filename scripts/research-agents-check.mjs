/**
 * A research runs with agents, not models. Issue #678.
 *
 * New research picks a Planner and a Writer - and, once Review is ticked, a
 * Reviewer - from the workspace's agents, each starting on the Research
 * planner, writer and reviewer the workspace was seeded with, and each row
 * saying beside it, not in it, the model that agent thinks with. There is no
 * model picker any more. Start sends the three agents and no model; the agent
 * last chosen for a part is chosen again next time; and the research names
 * the agents it was started with, each a link to the agent's page.
 *
 * The start and the research are answered in the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish, chosenOption, chooseOption, optionsOffered } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

// The seeded agents: asking for the modes is what makes them.
await graphql(`query($w: ID!) { researchModes(workspaceId: $w) { id } }`, { w: WORKSPACE });
const listed = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id name enabled modelName } } }`, { w: WORKSPACE });
const agents = listed.workspaceAgents.content;
const named = (name) => agents.find((one) => one.name === name);
const planner = named('Research planner');
const writer = named('Research writer');
const reviewer = named('Research reviewer');
record(planner !== undefined && writer !== undefined && reviewer !== undefined, 'the workspace has its three research agents');
// Somebody else's agent to pick for writing: any enabled one that is not the writer.
const other = agents.find((one) => one.enabled && one.id !== writer?.id) ?? planner;

const ROW = {
  id: '676767', question: `zz agents check ${stamp}`, modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', plannerAgentId: planner?.id ?? null, plannerAgentName: 'Research planner',
  writerAgentId: other?.id ?? null, writerAgentName: other?.name ?? null, reviewerAgentId: reviewer?.id ?? null, reviewerAgentName: 'Research reviewer',
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
  return route.continue();
});

// A person who never chose: whatever an earlier run remembered is forgotten.
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.evaluate((w) => {
  for (const part of ['planner', 'writer', 'reviewer', 'review']) window.localStorage.removeItem(`orknux.research.${part}.${w}.sieve`);
}, WORKSPACE);
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await dialog.locator('#research-planner').waitFor({ timeout: 10_000 }).catch(() => undefined);

// --- the pickers -------------------------------------------------------------
record((await dialog.locator('#research-model').count()) === 0, 'there is no model picker');
record(await dialog.locator('#research-planner').isVisible().catch(() => false), 'the planner is picked from the agents');
record(await dialog.locator('#research-writer').isVisible().catch(() => false), 'and so is the writer');
await page.waitForFunction(() => (document.querySelector('#research-planner')?.getAttribute('data-value') ?? '') !== '', null, { timeout: 10_000 }).catch(() => undefined);
const plannerChosen = await chosenOption(page, '#research-planner').catch(() => '');
const writerChosen = await chosenOption(page, '#research-writer').catch(() => '');
record(plannerChosen === planner?.id && writerChosen === writer?.id, `each starts on the seeded agent (${plannerChosen}, ${writerChosen})`);
const offered = await optionsOffered(page, '#research-writer').catch(() => []);
const enabled = agents.filter((one) => one.enabled).map((one) => one.name).sort();
record(
  JSON.stringify(offered.map((one) => one.label).sort()) === JSON.stringify(enabled),
  `the workspace's agents are offered, by name alone (${offered.length} of ${enabled.length})`,
);

// The model an agent thinks with is said beside its row, not in it.
await dialog.locator('#research-writer').click();
const writerRow = page.getByRole('option', { name: 'Research writer', exact: true }).first();
await writerRow.hover().catch(() => undefined);
await page.waitForTimeout(150);
const hint = ((await page.locator('[data-select-hint]').first().textContent().catch(() => '')) ?? '').trim();
record(hint !== '' && hint === (writer?.modelName ?? 'No model'), `the row's hint is the model it thinks with (${hint})`);
await page.keyboard.press('Escape');

await chooseOption(page, '#research-writer', { value: other.id }).catch(() => undefined);
record((await chosenOption(page, '#research-writer').catch(() => '')) === other.id, `another agent can write it (${other.name})`);

// Ticked, a reviewer appears, on the seeded one.
await dialog.locator('input[type="checkbox"][data-review]').check();
await dialog.locator('#research-reviewer').waitFor({ timeout: 5_000 }).catch(() => undefined);
record((await chosenOption(page, '#research-reviewer').catch(() => '')) === reviewer?.id, 'ticking Review offers a reviewer, on the Research reviewer');

await dialog.locator('textarea#research-question').fill(`zz agents check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });
record(await start.isEnabled(), 'Start can be pressed with the agents as they are');
await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(
  started !== null && started.plannerAgentId === planner?.id && started.writerAgentId === other.id && started.reviewerAgentId === reviewer?.id,
  `Start sends the three agents (${JSON.stringify({ planner: started?.plannerAgentId, writer: started?.writerAgentId, reviewer: started?.reviewerAgentId })})`,
);
record(started !== null && !('modelId' in started) && !('reviewerModelId' in started), 'and no model');

// --- the research names them ----------------------------------------------------
await page.locator('[data-research-planner]').waitFor({ timeout: 15_000 }).catch(() => undefined);
const plannerShown = ((await page.locator('[data-research-planner]').textContent().catch(() => '')) ?? '').trim();
const plannerLink = (await page.locator('[data-research-planner] a[data-agent-link]').getAttribute('href').catch(() => null)) ?? '';
record(plannerShown === 'Research planner' && plannerLink === `/workspace/${WORKSPACE}/agents/${planner?.id}/settings`, `the research names its planner, a link to its page (${plannerShown} ${plannerLink})`);
const writerShown = ((await page.locator('[data-research-writer]').textContent().catch(() => '')) ?? '').trim();
record(writerShown === other.name, `and its writer (${writerShown})`);
const reviewerShown = ((await page.locator('[data-research-reviewer]').textContent().catch(() => '')) ?? '').trim();
record(reviewerShown === 'Research reviewer', `and its reviewer, by the agent (${reviewerShown})`);

// --- remembered ----------------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
await page.waitForFunction((want) => document.querySelector('#research-writer')?.getAttribute('data-value') === want, other.id, { timeout: 10_000 }).catch(() => undefined);
record((await chosenOption(page, '#research-writer').catch(() => '')) === other.id, 'the writer last chosen is chosen again next time');

// Forgotten again, so the next run of anything starts where a new person would.
await page.evaluate((w) => {
  for (const part of ['planner', 'writer', 'reviewer', 'review']) window.localStorage.removeItem(`orknux.research.${part}.${w}.sieve`);
}, WORKSPACE);
await finish(browser);
