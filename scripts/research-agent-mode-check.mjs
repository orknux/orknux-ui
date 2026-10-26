/**
 * New research works one of two ways: a single agent for every step, or an
 * agent chosen for each - and a workspace has no research agents of its own,
 * so nothing is chosen for anybody.
 *
 * Single agent, the way somebody who never said starts on, shows one Agent
 * picker, empty, and no Planner, Writer or Reviewer to override it - not even
 * with Review ticked. Start waits for the agent and sends it alone. An agent
 * per step shows the three instead. The way last used is used again, and a
 * research run by one agent names it once rather than under three headings.
 *
 * The start and the research are answered in the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish, chosenOption, chooseOption } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const stamp = Date.now();

const listed = await graphql(`query($w: ID!) { workspaceAgents(workspaceId: $w, size: 500) { content { id name enabled } } }`, { w: WORKSPACE });
const agent = listed.workspaceAgents.content.find((one) => one.enabled);
record(agent !== undefined, `the workspace has an agent to choose (${agent?.name})`);

const ROW = {
  id: '686868', question: `zz agent mode check ${stamp}`, modeId: null, modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', plannerAgentId: agent?.id ?? null, plannerAgentName: agent?.name ?? null,
  writerAgentId: agent?.id ?? null, writerAgentName: agent?.name ?? null, reviewerAgentId: agent?.id ?? null, reviewerAgentName: agent?.name ?? null,
  agentMode: 'SINGLE',
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
  if (query.includes('researchSearchReady')) return route.fulfill({ json: { data: { researchSearchReady: true } } });
  return route.continue();
});

const PARTS = ['agents', 'agent', 'planner', 'writer', 'reviewer', 'review'];
const forget = () => page.evaluate(([w, parts]) => {
  for (const part of parts) window.localStorage.removeItem(`orknux.research.${part}.${w}.sieve`);
}, [WORKSPACE, PARTS]);
const shown = (selector) => page.locator(`dialog[open] ${selector}`).isVisible().catch(() => false);

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await forget();
await page.reload({ waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await dialog.locator('#research-agent-mode').waitFor({ timeout: 10_000 }).catch(() => undefined);
await page.waitForTimeout(500);

// --- one agent, the way a person who never said starts ----------------------------
record((await chosenOption(page, '#research-agent-mode').catch(() => '')) === 'SINGLE', 'a single agent is the way to start with');
record(await shown('#research-agent'), 'one Agent picker is shown');
record((await chosenOption(page, '#research-agent').catch(() => 'unread')) === '', 'with no agent chosen');
record(!(await shown('#research-planner')) && !(await shown('#research-writer')), 'and no Planner or Writer to override it');
await dialog.locator('input[type="checkbox"][data-review]').check();
await page.waitForTimeout(200);
record(!(await shown('#research-reviewer')), 'nor a Reviewer, with Review ticked');

await dialog.locator('textarea#research-question').fill(`zz agent mode check ${stamp}`);
const start = dialog.getByRole('button', { name: /^Start$/ });
record(!(await start.isEnabled()), 'Start waits for the agent');

// --- an agent per step, and back ---------------------------------------------------
await chooseOption(page, '#research-agent-mode', { value: 'PER_STEP' }).catch(() => undefined);
await page.waitForTimeout(200);
record(
  !(await shown('#research-agent')) && (await shown('#research-planner')) && (await shown('#research-writer')) && (await shown('#research-reviewer')),
  'an agent per step shows a Planner, a Writer and, with Review ticked, a Reviewer in its place',
);
await chooseOption(page, '#research-agent-mode', { value: 'SINGLE' }).catch(() => undefined);
await page.waitForTimeout(200);

await chooseOption(page, '#research-agent', { value: agent.id }).catch(() => undefined);
record(await start.isEnabled(), 'with the agent chosen, Start can be pressed');
await start.click();
await page.waitForFunction(() => document.querySelector('dialog[open]') === null, null, { timeout: 10_000 }).catch(() => undefined);
record(
  started !== null && started.agentMode === 'SINGLE' && started.agentId === agent.id &&
    started.plannerAgentId === null && started.writerAgentId === null && started.reviewerAgentId === null,
  `Start sends the one agent and no other (${JSON.stringify({ mode: started?.agentMode, agent: started?.agentId, planner: started?.plannerAgentId })})`,
);

// --- the research names it once ------------------------------------------------------
await page.locator('[data-research-agent]').waitFor({ timeout: 15_000 }).catch(() => undefined);
const named = ((await page.locator('[data-research-agent]').textContent().catch(() => '')) ?? '').trim();
record(named === agent.name, `the research names its agent (${named})`);
record((await page.locator('[data-research-planner], [data-research-writer], [data-research-reviewer]').count()) === 0, 'once, not under Planner, Writer and Reviewer');

// --- the way used is used again --------------------------------------------------------
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research`, { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: 'New research' }).click({ timeout: 20_000 });
await page.waitForFunction((want) => document.querySelector('#research-agent')?.getAttribute('data-value') === want, agent.id, { timeout: 10_000 }).catch(() => undefined);
record((await chosenOption(page, '#research-agent').catch(() => '')) === agent.id, 'the agent somebody chose is chosen again next time');

await forget();
await finish(browser);
