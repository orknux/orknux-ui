/**
 * A running research can be stopped from its own page.
 *
 * Stopping lived only on the run's page, behind Open the run; the research
 * page had Restart for one that had stopped and nothing for one still going.
 * Its Stop stops that run - the same `stopExecution` the run's page sends -
 * and is drawn only while the research runs.
 *
 * The research and the stop are answered in the browser, so nothing runs.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const ROW = {
  id: '949494', question: 'zz stop check', modeId: '1', modeName: 'Shallow', workflowId: '1', workflowName: 'Research: Shallow',
  modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT', websitesInclude: [], websitesExclude: [], documentsInclude: [],
  documentsExclude: [], useWebSearch: true, includeImages: false, images: [], status: 'RUNNING', executionId: '959595', fileName: null, fileUrl: null,
  artifactId: null, artifactKey: null, previewUrl: null, error: null, startedBy: 'alice', startedAt: new Date().toISOString(), finishedAt: null,
  earlierExecutionIds: [], review: false, reviewerModelId: null, reviewerModelName: null, reviewRounds: [],
  progress: { step: 'Gathering sources', subQuestions: [], searched: [], level: 1, sourcesRead: 0, stage: 'GATHER', reading: null }, sources: [],
};
let status = 'RUNNING';
let stopped = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('stopExecution(')) {
    stopped = body.variables?.id ?? null;
    status = 'STOPPED';
    return route.fulfill({ json: { errors: [{ message: 'answered in the browser' }] } });
  }
  if (query.includes('research(id:')) return route.fulfill({ json: { data: { research: { ...ROW, status } } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/${ROW.id}`, { waitUntil: 'domcontentloaded' });
const button = page.locator('[data-stop]');
await button.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await button.count()) === 1 && (await button.innerText()).trim() === 'Stop', 'a running research draws Stop beside Open the run');
await button.click().catch(() => undefined);
await page.waitForTimeout(800);
record(stopped === ROW.executionId, `Stop stops the research's own run (${stopped})`);

await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('[data-open-run]').waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await page.locator('[data-stop]').count()) === 0, 'a research that has stopped draws no Stop');

await finish(browser);
