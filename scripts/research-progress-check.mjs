/**
 * A research shows how far it has got while it runs, and keeps its sources.
 * Issue #659.
 *
 * Opened while it runs, a research says what it is doing now, the
 * step of its workflow it is in, the sub-questions it broke the question into,
 * how many searches and sources so far, and the sources read - numbered as the report will cite them, each a
 * link to where it was read. Finished, it shows the report with its [n]
 * citations and the same numbered sources under it.
 *
 * The research itself is answered here, as a run part-way through and then
 * as one finished, so the check does not depend on a model or a search engine
 * - the server's own tests drive the pipeline with stubs of both.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const SOURCES = [
  { number: 1, title: 'Tides and the moon', url: 'https://one.example.org/tides', kind: 'WEB', notes: 'The moon pulls the sea.' },
  { number: 2, title: 'Harbour log', url: '/api/artifacts/7', kind: 'DOCUMENT', notes: 'A spring tide every fortnight.' },
];
const RUNNING = {
  id: '424242', question: 'zz progress check: why are there tides?', modeId: null, modeName: 'Deep', workflowId: '1',
  workflowName: 'Research: Deep', modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'DOCUMENT',
  websitesInclude: [], websitesExclude: [], documentsInclude: ['Harbour log'], documentsExclude: [], useWebSearch: true, status: 'RUNNING',
  executionId: null, result: null, fileName: null, fileUrl: null, artifactId: null, previewUrl: null, error: null, startedBy: 'alice',
  startedAt: new Date().toISOString(), finishedAt: null,
  progress: {
    step: 'Reading Tides and the moon', subQuestions: ['tide causes', 'tide timing', 'tide records'],
    searched: ['tide causes', 'tide timing'], level: 2, sourcesRead: 2, stage: 'GATHER',
  },
  sources: SOURCES,
};
const FINISHED = {
  ...RUNNING, status: 'COMPLETED', finishedAt: new Date().toISOString(), fileName: 'tides.md', fileUrl: '/api/artifacts/4242', artifactId: '4242',
  progress: { ...RUNNING.progress, step: 'Finished', stage: 'SAVE' },
  result: '# Tides\n\nThe moon pulls the sea [1], and a spring tide comes every fortnight [2].\n\n## Sources\n\n1. [Tides and the moon](https://one.example.org/tides)\n2. [Harbour log](/api/artifacts/7)',
};
let answering = RUNNING;

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if ((body.query ?? '').includes('research(id:')) return route.fulfill({ json: { data: { research: answering } } });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/424242`, { waitUntil: 'domcontentloaded' });
const opened = page.locator('[data-opened="424242"]');
await opened.waitFor({ timeout: 20_000 }).catch(() => undefined);

// --- while it runs ------------------------------------------------------------
const step = ((await opened.locator('[data-step]').textContent().catch(() => '')) ?? '').trim();
record(step.includes('Reading Tides and the moon'), `it says what it is doing now (${step})`);
const parts = await opened.locator('[data-sub-questions] li').allTextContents();
record(JSON.stringify(parts) === JSON.stringify(['tide causes', 'tide timing', 'tide records']), `it lists its sub-questions (${parts.join(', ')})`);
const facts = ((await opened.locator('[data-progress]').textContent()) ?? '').replace(/\s+/g, ' ');
const stage = ((await opened.locator('[data-stage]').textContent().catch(() => '')) ?? '').trim();
record(stage === 'Gathering sources', `it says which step of the workflow it is in (${stage})`);
record((await opened.locator('[data-web-search-off]').count()) === 0, 'a research that searched the web says nothing about it');
record(/Searches\s*2/.test(facts) && /Sources read\s*2/.test(facts), `it counts searches and sources (${facts.slice(0, 120)})`);
const links = await opened.locator('[data-sources] li a').evaluateAll((all) => all.map((one) => one.getAttribute('href')));
record(JSON.stringify(links) === JSON.stringify(['https://one.example.org/tides', '/api/artifacts/7']), `it links each source it read, in order (${links.join(', ')})`);
const numbers = await opened.locator('[data-sources] li').evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(numbers) === JSON.stringify([1, 2]), `numbered as the report cites them (${numbers.join(', ')})`);

// --- finished -----------------------------------------------------------------
answering = FINISHED;
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('article').waitFor({ timeout: 20_000 }).catch(() => undefined);
const report = ((await opened.locator('article').textContent().catch(() => '')) ?? '');
record(report.includes('The moon pulls the sea [1]'), 'finished, the report is drawn with its citations');
record((await opened.locator('[data-step]').count()) === 0, 'and no longer says it is working');
record((await opened.locator('[data-sources] li').count()) === 2, 'and keeps its sources');
const lastStage = ((await opened.locator('[data-stage]').textContent().catch(() => '')) ?? '').trim();
record(lastStage === 'Saving the report', `and the last step it took (${lastStage})`);
const kept = await opened.locator('[data-research-artifact]').getAttribute('href').catch(() => null);
record(kept !== null && kept.endsWith('/artifacts/4242'), `and links the report it kept on the Artifacts page (${kept})`);

await finish(browser);
