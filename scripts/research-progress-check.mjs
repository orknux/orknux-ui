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
 * The steps are drawn as a strip of five in the order the workflow takes them
 * - in one row at this width, each as wide as the next - with the ones taken
 * marked done, the one it is in marked current, and the rest waiting. Each
 * source is a row of its own: its number, its title as a link, where it was
 * read and what kind it is.
 *
 * Asked for images, a finished research shows the ones it kept as a gallery
 * under the report - each a thumbnail drawn from its own artifact, its
 * caption, and a link to where it came from - which opens the picture over
 * the page, and the given-settings card says images were on.
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
  websitesInclude: [], websitesExclude: [], documentsInclude: ['Harbour log'], documentsExclude: [], useWebSearch: true,
  includeImages: false, images: [], status: 'RUNNING',
  executionId: null, result: null, fileName: null, fileUrl: null, artifactId: null, previewUrl: null, error: null, startedBy: 'alice',
  startedAt: new Date().toISOString(), finishedAt: null,
  progress: {
    step: 'Reading Tides and the moon', subQuestions: ['tide causes', 'tide timing', 'tide records'],
    searched: ['tide causes', 'tide timing'], level: 2, sourcesRead: 2, stage: 'GATHER',
  },
  sources: SOURCES,
};
const FINISHED = {
  ...RUNNING, status: 'COMPLETED', startedAt: new Date(Date.now() - 125_000).toISOString(), finishedAt: new Date().toISOString(), fileName: 'tides.md', fileUrl: '/api/artifacts/4242', artifactId: '4242',
  progress: { ...RUNNING.progress, step: 'Finished', stage: 'SAVE' },
  includeImages: true,
  images: [
    {
      number: 1, caption: 'The moon over the bay', url: 'https://pictures.example.org/moon.png', page: 'https://bay.example.org/moon',
      contentType: 'image/png', sizeBytes: 68, width: 200, height: 150, artifactId: '9001', fileUrl: '/api/artifacts/9001', previewUrl: '/api/artifacts/9001/preview',
    },
    {
      number: 2, caption: 'A tide chart', url: 'https://charts.example.org/chart.png', page: null,
      contentType: 'image/png', sizeBytes: 68, width: 300, height: 200, artifactId: '9002', fileUrl: '/api/artifacts/9002', previewUrl: '/api/artifacts/9002/preview',
    },
  ],
  result: '# Tides\n\nThe moon pulls the sea [1], and a spring tide comes every fortnight [2].\n\n## Sources\n\n1. [Tides and the moon](https://one.example.org/tides)\n2. [Harbour log](/api/artifacts/7)',
};
let answering = RUNNING;

/** A picture of one pixel, which is what every kept image's preview is answered with here. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.route('**/api/artifacts/*/preview', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

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
record((await opened.locator('[data-include-images-on]').count()) === 0, 'nor about images, where it was not asked for them');
record((await opened.locator('[data-images]').count()) === 0, 'and with no image kept, there is no Images section');
record(/Searches\s*2/.test(facts) && /Sources read\s*2/.test(facts), `it counts searches and sources (${facts.slice(0, 120)})`);
// --- the steps, drawn in order -------------------------------------------------
const strip = await opened.locator('[data-stages] > li').evaluateAll((all) =>
  all.map((one) => {
    const box = one.getBoundingClientRect();
    return { stage: one.getAttribute('data-stage-step'), state: one.getAttribute('data-state'), name: (one.textContent ?? '').trim(), top: box.top, left: box.left, width: box.width, height: box.height };
  }),
);
record(
  JSON.stringify(strip.map((one) => one.stage)) === JSON.stringify(['PLAN', 'GATHER', 'FOLLOW_UP', 'WRITE', 'SAVE']),
  `the five steps are drawn in the order they are taken (${strip.map((one) => one.stage).join(', ')})`,
);
record(
  JSON.stringify(strip.map((one) => one.state)) === JSON.stringify(['done', 'current', 'waiting', 'waiting', 'waiting']),
  `the ones taken are done, the one it is in is current, the rest wait (${strip.map((one) => one.state).join(', ')})`,
);
record(strip.every((one) => one.name.includes(['Plan research', 'Gather sources', 'Deepen findings', 'Write report', 'Save report'][strip.indexOf(one)])), `each by its step's name (${strip.map((one) => one.name).join(' | ')})`);
const tops = strip.map((one) => Math.round(one.top));
const widths = strip.map((one) => Math.round(one.width));
record(strip.length === 5 && Math.max(...tops) - Math.min(...tops) <= 1, `in one row at 1440px (tops ${tops.join(', ')})`);
record(strip.every((one, at) => at === 0 || one.left > strip[at - 1].left + strip[at - 1].width - 1), `left to right, none over another (${strip.map((one) => Math.round(one.left)).join(', ')})`);
record(Math.max(...widths) - Math.min(...widths) <= 1 && Math.min(...widths) >= 120, `each as wide as the next (${widths.join(', ')})`);
const currentBorder = await opened.locator('[data-stage-step="GATHER"]').evaluate((one) => getComputedStyle(one).borderTopColor).catch(() => '');
const waitingBorder = await opened.locator('[data-stage-step="WRITE"]').evaluate((one) => getComputedStyle(one).borderTopColor).catch(() => '');
record(currentBorder !== '' && currentBorder !== waitingBorder, `the current step is drawn apart from a waiting one (${currentBorder} against ${waitingBorder})`);

// --- the sources, as rows ------------------------------------------------------
const rows = await opened.locator('[data-sources] > [data-source]').evaluateAll((all) =>
  all.map((one) => {
    const box = one.getBoundingClientRect();
    return {
      number: one.querySelector('[aria-hidden="true"]')?.textContent?.trim(),
      title: one.querySelector('a')?.textContent?.trim(),
      host: one.querySelector('[data-source-host]')?.textContent?.trim(),
      kind: one.querySelector('[data-source-kind]')?.textContent?.trim(),
      top: box.top,
      height: box.height,
      bordered: getComputedStyle(one).borderTopStyle !== 'none',
    };
  }),
);
record(rows.length === 2, `each source is a row of its own (${rows.length})`);
record(
  JSON.stringify(rows.map((one) => [one.number, one.title, one.host, one.kind])) ===
    JSON.stringify([['1', 'Tides and the moon', 'one.example.org', 'Web'], ['2', 'Harbour log', 'Artifacts', 'Document']]),
  `with its number, its title, where it was read and its kind (${JSON.stringify(rows.map((one) => [one.number, one.title, one.host, one.kind]))})`,
);
record(rows.length === 2 && rows[1].top >= rows[0].top + rows[0].height && rows.every((one) => one.bordered), 'one under the other, each a drawn row');

const links = await opened.locator('[data-sources] li a').evaluateAll((all) => all.map((one) => one.getAttribute('href')));
record(JSON.stringify(links) === JSON.stringify(['https://one.example.org/tides', '/api/artifacts/7']), `it links each source it read, in order (${links.join(', ')})`);
const numbers = await opened.locator('[data-sources] li').evaluateAll((all) => all.map((one) => one.value));
record(JSON.stringify(numbers) === JSON.stringify([1, 2]), `numbered as the report cites them (${numbers.join(', ')})`);

// --- its own page --------------------------------------------------------------
record((await page.locator('[data-research]').count()) === 0, 'it is a page of its own, with no row of the list');
const heading = ((await page.locator('h1').first().textContent().catch(() => '')) ?? '').trim();
record(heading === RUNNING.question, `titled with the question (${heading})`);
record((await page.locator('a[aria-label="Back to Research"]').count()) === 1, 'and a Back link to the list');
record((await opened.locator('[data-summary] [data-working]').count()) === 1, 'running, its state has the spinner beside it');

// --- finished -----------------------------------------------------------------
answering = FINISHED;
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('article').waitFor({ timeout: 20_000 }).catch(() => undefined);
const report = ((await opened.locator('article').textContent().catch(() => '')) ?? '');
record(report.includes('The moon pulls the sea [1]'), 'finished, the report is drawn with its citations');
record((await opened.locator('[data-step]').count()) === 0, 'and no longer says it is working');
record((await opened.locator('[data-sources] li').count()) === 2, 'and keeps its sources');
const states = await opened.locator('[data-stages] > li').evaluateAll((all) => all.map((one) => one.getAttribute('data-state')));
record(states.length === 5 && states.every((one) => one === 'done'), `and every step is done (${states.join(', ')})`);
record((await opened.locator('[data-summary] [data-working]').count()) === 0, 'and the spinner is gone');
const kept = await opened.locator('[data-research-artifact]').getAttribute('href').catch(() => null);
record(kept !== null && kept.endsWith('/artifacts/4242'), `and links the report it kept on the Artifacts page (${kept})`);
const took = ((await opened.locator('[data-took]').textContent().catch(() => '')) ?? '').trim();
record(took === '2m 5s', `and says how long it took, start to finish (${took})`);
const rounds = ((await opened.locator('[data-stat="level"]').locator('xpath=preceding-sibling::dt').textContent().catch(() => '')) ?? '').trim();
record(rounds === 'Search rounds', `the depth reached is called what it is, not "Level" (${rounds})`);

// --- the images it kept ----------------------------------------------------------
const imagesOn = ((await opened.locator('[data-include-images-on]').textContent().catch(() => '')) ?? '').trim();
record(imagesOn === 'On', `the given-settings card says images were on (${imagesOn})`);
const gallery = opened.locator('[data-images]');
await gallery.locator('img').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
const reportBox = await opened.locator('[data-report]').boundingBox().catch(() => null);
const galleryBox = await gallery.boundingBox().catch(() => null);
record(
  reportBox !== null && galleryBox !== null && galleryBox.y >= reportBox.y + reportBox.height - 1,
  `an Images section is drawn under the report (${galleryBox?.y} under ${reportBox === null ? null : reportBox.y + reportBox.height})`,
);
await page
  .waitForFunction(() => [...document.querySelectorAll('[data-images] img')].every((one) => one.complete && one.naturalWidth > 0), null, { timeout: 10_000 })
  .catch(() => undefined);
const figures = await gallery.locator('[data-image]').evaluateAll((all) =>
  all.map((one) => {
    const picture = one.querySelector('img');
    const box = picture?.getBoundingClientRect();
    return {
      caption: one.querySelector('[data-image-caption]')?.textContent?.trim(),
      source: one.querySelector('[data-image-source]')?.getAttribute('href') ?? null,
      host: one.querySelector('[data-image-source]')?.textContent?.trim() ?? null,
      src: picture?.getAttribute('src'),
      loaded: (picture?.naturalWidth ?? 0) > 0,
      width: Math.round(box?.width ?? 0),
      height: Math.round(box?.height ?? 0),
      top: Math.round(box?.top ?? 0),
    };
  }),
);
record(figures.length === 2, `each kept image is a figure of its own (${figures.length})`);
record(
  JSON.stringify(figures.map((one) => one.caption)) === JSON.stringify(['1The moon over the bay', '2A tide chart']),
  `numbered and captioned as the report places them (${figures.map((one) => one.caption).join(' | ')})`,
);
record(
  JSON.stringify(figures.map((one) => [one.source, one.host])) ===
    JSON.stringify([['https://bay.example.org/moon', 'bay.example.org'], ['https://charts.example.org/chart.png', 'charts.example.org']]),
  `each links where it came from: its page, or where it was fetched (${JSON.stringify(figures.map((one) => [one.source, one.host]))})`,
);
record(
  figures.length === 2 && figures.every((one, at) => one.src === FINISHED.images[at].previewUrl && one.loaded),
  `each drawn from its own artifact, never from where it was found (${figures.map((one) => `${one.src}:${one.loaded}`).join(', ')})`,
);
record(
  figures.length === 2 && figures.every((one) => one.width >= 120 && one.height >= 80 && one.width <= 400),
  `as thumbnails, small and not nothing (${figures.map((one) => `${one.width}x${one.height}`).join(', ')})`,
);
record(figures.length === 2 && figures[0].top === figures[1].top, `side by side at 1440px (${figures.map((one) => one.top).join(', ')})`);

await gallery.locator('[data-open-image="1"]').click().catch(() => undefined);
const viewer = page.locator('dialog[open]');
await viewer.locator('img').waitFor({ timeout: 5_000 }).catch(() => undefined);
const shown = await viewer.locator('img').getAttribute('src').catch(() => null);
const named = ((await viewer.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(
  shown === '/api/artifacts/9001/preview' && named.includes('The moon over the bay'),
  `a thumbnail opens its picture in the viewer, under its caption (${shown}; ${named.slice(0, 60)})`,
);
await page.keyboard.press('ArrowRight');
const next = await viewer.locator('img').getAttribute('src').catch(() => null);
record(next === '/api/artifacts/9002/preview', `and steps on to the next (${next})`);
await page.keyboard.press('Escape');
await viewer.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined);
record((await page.locator('dialog[open]').count()) === 0, 'and Escape closes it');

await finish(browser);
