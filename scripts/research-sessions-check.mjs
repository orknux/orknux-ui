/**
 * A research's page links the sessions its steps talked in. Issue #668.
 *
 * Plan and Write are agent nodes, and Review a reviewer-and-writer loop; what
 * each agent was asked, the tools it called and what it answered is kept in a
 * session of the step's own. A research's page lists them on a line under the
 * strip of steps, each link named for its step, in step order, and opening one
 * goes to that session's page. Under the strip and not in it: an icon beside
 * each of six step names cut them shorter, so this measures that the names
 * have the same room with sessions as without. A research with no session
 * has no line.
 *
 * The research is answered here, with sessions for Plan and Write, so the
 * check does not depend on a model.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

// Tall enough that the page never scrolls, so a scrollbar coming and going cannot narrow the strip.
const { browser, page } = await open({ viewport: { width: 1440, height: 2000 } });

const SESSIONS = [
  { stage: 'PLAN', sessionId: '9101', url: `/workspace/${WORKSPACE}/sessions/9101` },
  { stage: 'WRITE', sessionId: '9102', url: `/workspace/${WORKSPACE}/sessions/9102` },
];
const ROW = {
  id: '454545', question: 'zz sessions check: why are there tides?', modeId: null, modeName: 'Shallow', workflowId: '1',
  workflowName: 'Research: Shallow', modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT',
  plannerAgentId: null, plannerAgentName: 'Research planner', writerAgentId: null, writerAgentName: 'Research writer',
  reviewerAgentId: null, reviewerAgentName: null, websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'COMPLETED', executionId: null,
  fileName: null, fileUrl: null, artifactId: null, artifactKey: null, previewUrl: null, error: null, startedBy: 'alice',
  startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), earlierExecutionIds: [], review: false,
  reviewerModelId: null, reviewerModelName: null, parentId: null, sources: [],
  progress: { step: 'Finished', subQuestions: ['tide causes'], searched: ['tide causes'], level: 1, sourcesRead: 1, stage: 'SAVE', reading: null },
  result: '# Tides', draft: null, estimatedSecondsLeft: null, reviewRounds: [], followUps: [], followUpCount: 0,
  parentQuestion: null, children: [], sessions: SESSIONS,
};
let sessions = SESSIONS;
let askedForSessions = false;
await page.route('**/graphql', async (route) => {
  const query = route.request().postDataJSON()?.query ?? '';
  if (query.includes('research(id:')) {
    askedForSessions = askedForSessions || query.includes('sessions');
    return route.fulfill({ json: { data: { research: { ...ROW, sessions } } } });
  }
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/${ROW.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-stages]').waitFor({ timeout: 20_000 });
record(askedForSessions, "the page asks for the research's sessions");

const line = page.locator('[data-sessions]');
record(await line.isVisible().catch(() => false), 'there is a line of sessions');
const links = line.locator('[data-stage-session]');
record(
  JSON.stringify(await links.evaluateAll((all) => all.map((one) => one.getAttribute('data-stage-session')))) === JSON.stringify(['PLAN', 'WRITE']),
  'one link for each step that kept a session, in step order',
);
for (const { stage, url } of SESSIONS) {
  const link = line.locator(`[data-stage-session="${stage}"]`);
  const named = (await link.textContent().catch(() => ''))?.trim() ?? '';
  const inStrip = (await page.locator(`[data-stage-step="${stage}"]`).textContent().catch(() => ''))?.trim() ?? '';
  record(named !== '' && inStrip.includes(named), `${stage}: named as its step is (${named})`);
  record((await link.getAttribute('href').catch(() => null)) === url, `${stage}: to that session's page (${await link.getAttribute('href').catch(() => null)})`);
}

// Under the strip, and the strip's names whole.
const strip = await page.locator('[data-stages]').boundingBox();
const under = await line.boundingBox({ timeout: 5_000 }).catch(() => null);
record(strip !== null && under !== null && under.y >= strip.y + strip.height - 0.5, `the line is under the steps (${JSON.stringify({ strip, under })})`);
/** How much room each step's name has in the strip. */
const roomInStrip = () => page.locator('[data-stage-step]').evaluateAll((steps) =>
  steps.map((step) => [...step.querySelectorAll('span')].map((one) => Math.round(one.clientWidth)).join('/')),
);
const withSessions = await roomInStrip();
const drawn = await line.evaluate((one) => ({ height: one.getBoundingClientRect().height, font: parseFloat(getComputedStyle(one).fontSize) })).catch(() => ({ height: null, font: null }));
record(drawn.height !== null && drawn.height < drawn.font * 2.5, `on one line (${JSON.stringify(drawn)})`);

await line.locator('[data-stage-session="PLAN"]').click({ timeout: 5_000 }).catch(() => undefined);
await page.waitForURL(`**${SESSIONS[0].url}`, { timeout: 10_000 }).catch(() => undefined);
record(page.url().endsWith(SESSIONS[0].url), `opening one goes to the session (${page.url()})`);

// A research with no session yet has no line.
sessions = [];
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/${ROW.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-stages]').waitFor({ timeout: 20_000 });
record((await page.locator('[data-sessions]').count()) === 0, 'with no sessions there is no line');
const without = await roomInStrip();
record(JSON.stringify(withSessions) === JSON.stringify(without), `the sessions take no room from the step names (${JSON.stringify({ withSessions, without })})`);

await browser.close();
finish();
