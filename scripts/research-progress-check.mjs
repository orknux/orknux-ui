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
 * While it runs, the page being read is a row of its own under the sources,
 * marked as being read and not numbered, and each source arrives as it is
 * read; the report is drawn as its writer writes it, marked as being written,
 * and grows; and the summary says about how long is left where the server
 * measured it, and nothing where it did not.
 *
 * A failed or stopped research has a Restart in its header, and a finished or
 * running one has none; pressing it asks first, sends no stage - the server
 * restarts from where it stopped - and the page shows it running. A step taken
 * offers Restart from here on hover, and that sends its own stage.
 *
 * Reviewed, the strip draws Review as a step like the others and a Review
 * panel says each round's verdict and what it found, and that the report was
 * revised for it; the summary names the reviewer's model.
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
/** What each restart was asked with, in order. */
const restarts = [];

/** A picture of one pixel, which is what every kept image's preview is answered with here. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
await page.route('**/api/artifacts/*/preview', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }));

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if ((body.query ?? '').includes('restartResearch(')) {
    restarts.push(body.variables ?? {});
    answering = { ...RUNNING, progress: { ...RUNNING.progress, step: 'Restarting' } };
    return route.fulfill({ json: { data: { restartResearch: answering } } });
  }
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
  JSON.stringify(strip.map((one) => one.stage)) === JSON.stringify(['PLAN', 'GATHER', 'FOLLOW_UP', 'WRITE', 'REVIEW', 'SAVE']),
  `the six steps are drawn in the order they are taken (${strip.map((one) => one.stage).join(', ')})`,
);
record(
  JSON.stringify(strip.map((one) => one.state)) === JSON.stringify(['done', 'current', 'waiting', 'waiting', 'skipped', 'waiting']),
  `the ones taken are done, the one it is in is current, the rest wait, and a review not asked for is skipped (${strip.map((one) => one.state).join(', ')})`,
);
record(strip.every((one) => one.name.includes(['Plan research', 'Gather sources', 'Deepen findings', 'Write report', 'Review report', 'Save report'][strip.indexOf(one)])), `each by its step's name (${strip.map((one) => one.name).join(' | ')})`);
const tops = strip.map((one) => Math.round(one.top));
const widths = strip.map((one) => Math.round(one.width));
record(strip.length === 6 && Math.max(...tops) - Math.min(...tops) <= 1, `in one row at 1440px (tops ${tops.join(', ')})`);
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
record(
  states.length === 6 && JSON.stringify(states) === JSON.stringify(['done', 'done', 'done', 'done', 'skipped', 'done']),
  `and every step is done, the review it was not asked for skipped (${states.join(', ')})`,
);
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

// --- while it runs: what is being read, sources as they come, the report as it is written ---
answering = {
  ...RUNNING, sources: SOURCES.slice(0, 1), estimatedSecondsLeft: 240,
  progress: { ...RUNNING.progress, sourcesRead: 1, step: 'Reading Harbour log', reading: { title: 'Harbour log', url: '/api/artifacts/7', kind: 'DOCUMENT' } },
};
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-source-reading]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const live = async () => ({
  sources: await opened.locator('[data-sources] > [data-source]').count(),
  reading: ((await opened.locator('[data-source-reading]').textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim(),
  counter: ((await opened.locator('[data-stat="sources"]').textContent().catch(() => '')) ?? '').trim(),
});
const one = await live();
record(one.sources === 1 && one.counter === '1', `one source read, one row and a counter of one (${one.sources}, ${one.counter})`);
record(one.reading.includes('Harbour log') && one.reading.includes('Reading…'), `the one being read is a row of its own, marked as being read (${one.reading})`);
const unnumbered = ((await opened.locator('[data-source-reading] [aria-hidden="true"]').first().textContent().catch(() => '')) ?? '').trim();
record(unnumbered === '…', `and not numbered, since it is not a source yet (${unnumbered})`);
const left = ((await opened.locator('[data-summary] [data-time-left]').textContent().catch(() => '')) ?? '').trim();
record(left === 'about 4 min left', `the summary says about how long is left (${left})`);
const leftBox = await opened.locator('[data-time-left]').boundingBox().catch(() => null);
const startedBox = await opened.locator('[data-summary] dd[title]').first().boundingBox().catch(() => null);
record(
  leftBox !== null && startedBox !== null && Math.abs(leftBox.y - startedBox.y) <= 2 && leftBox.x > startedBox.x,
  `beside Started, on the same line (${leftBox?.x},${leftBox?.y} after ${startedBox?.x},${startedBox?.y})`,
);

answering = { ...answering, sources: SOURCES, progress: { ...answering.progress, sourcesRead: 2, reading: null } };
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-sources] > [data-source="2"]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const two = await live();
record(two.sources === 2 && two.counter === '2' && two.reading === '', `the next one read is a source, and nothing is being read (${two.sources}, ${two.counter}, "${two.reading}")`);

answering = {
  ...RUNNING, estimatedSecondsLeft: null, draft: '# Tides\n\nThe moon',
  progress: { ...RUNNING.progress, stage: 'WRITE', step: 'Writing the report' },
};
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-draft] article').waitFor({ timeout: 20_000 }).catch(() => undefined);
const drafted = ((await opened.locator('[data-draft] article').textContent().catch(() => '')) ?? '').trim();
record(drafted.startsWith('Tides') && drafted.includes('The moon'), `the report is drawn as it is being written (${drafted})`);
record((await opened.locator('[data-draft] article h1').count()) === 1, 'as markdown, its heading a heading');
record((await opened.locator('[data-draft] [data-writing]').count()) === 1, 'marked as being written');
record((await opened.locator('[data-report]').count()) === 0, 'and is not yet the report');
record((await opened.locator('[data-time-left]').count()) === 0, 'with no estimate to go on, no time left is said');
answering = { ...answering, draft: '# Tides\n\nThe moon pulls the sea [1], and a spring tide comes every fortnight [2].' };
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-draft] article').waitFor({ timeout: 20_000 }).catch(() => undefined);
const grown = ((await opened.locator('[data-draft] article').textContent().catch(() => '')) ?? '').trim();
record(grown.includes('a spring tide comes every fortnight'), `and grows as it is written (${grown.slice(0, 80)})`);
record(
  (await opened.locator('[data-restart]').count()) === 0 && (await opened.locator('[data-restart-from]').count()) === 0,
  'running, nothing offers to restart it',
);

// --- a failed research restarts from where it stopped ---------------------------
answering = {
  ...RUNNING, status: 'FAILED', executionId: '777', error: 'Gather was interrupted by a restart', finishedAt: new Date().toISOString(),
  progress: { ...RUNNING.progress, stage: 'GATHER', step: 'Reading Tides and the moon' },
};
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-restart]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const restart = opened.locator('[data-restart]');
record((await restart.count()) === 1, 'a failed research has a Restart in its header');
const restartBox = await restart.boundingBox().catch(() => null);
const runBox = await opened.locator('[data-open-run]').boundingBox().catch(() => null);
record(
  restartBox !== null && runBox !== null && Math.abs(restartBox.y - runBox.y) <= 2 && Math.abs(restartBox.x + restartBox.width - runBox.x) <= 24,
  `beside Open the run (${restartBox?.x},${restartBox?.y} and ${runBox?.x},${runBox?.y})`,
);
const restartFill = await restart.evaluate((one) => getComputedStyle(one).backgroundColor).catch(() => '');
const runFill = await opened.locator('[data-open-run]').evaluate((one) => getComputedStyle(one).backgroundColor).catch(() => '');
record(restartFill !== '' && restartFill !== runFill, `drawn as the action, apart from the link beside it (${restartFill} against ${runFill})`);
await restart.click().catch(() => undefined);
const asking = page.locator('dialog[open]');
await asking.waitFor({ timeout: 5_000 }).catch(() => undefined);
const askingText = ((await asking.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(askingText.includes('Restart research') && askingText.includes('Gather sources'), `it asks first, naming the step it starts from (${askingText.slice(0, 140)})`);
await asking.locator('button', { hasText: /^Restart$/ }).click().catch(() => undefined);
await opened.locator('[data-summary] [data-status="RUNNING"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
record(
  restarts.length === 1 && restarts[0].id === '424242' && (restarts[0].fromStage ?? null) === null,
  `and restarts from where it stopped, sending no stage (${JSON.stringify(restarts)})`,
);
record((await opened.locator('[data-summary] [data-status="RUNNING"]').count()) === 1, 'after which the page shows it running');
record((await opened.locator('[data-restart]').count()) === 0, 'with no Restart any more');

// --- a finished one restarts from a step taken --------------------------------
answering = FINISHED;
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('article').waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await opened.locator('[data-restart]').count()) === 0, 'a finished research has no Restart in its header');
const offers = await opened.locator('[data-restart-from]').count();
record(offers === 5, `each step taken offers Restart from here (${offers})`);
const offer = opened.locator('[data-restart-from="FOLLOW_UP"]');
await page.mouse.move(0, 0);
const hidden = await offer.evaluate((one) => getComputedStyle(one).opacity).catch(() => '');
await opened.locator('[data-stage-step="FOLLOW_UP"]').hover().catch(() => undefined);
await page.waitForTimeout(100);
const pointed = await offer.evaluate((one) => getComputedStyle(one).opacity).catch(() => '');
record(hidden === '0' && pointed === '1', `only to somebody pointing at the step (${hidden} then ${pointed})`);
await offer.click().catch(() => undefined);
await asking.waitFor({ timeout: 5_000 }).catch(() => undefined);
const fromHere = ((await asking.textContent().catch(() => '')) ?? '').replace(/\s+/g, ' ');
record(fromHere.includes('Deepen findings'), `it asks first, naming that step (${fromHere.slice(0, 140)})`);
await asking.locator('button', { hasText: /^Restart$/ }).click().catch(() => undefined);
await opened.locator('[data-summary] [data-status="RUNNING"]').waitFor({ timeout: 10_000 }).catch(() => undefined);
record(restarts.length === 2 && restarts[1].fromStage === 'FOLLOW_UP', `and sends that step (${JSON.stringify(restarts[1] ?? null)})`);

// --- a reviewed research ---------------------------------------------------------
answering = {
  ...FINISHED, review: true, reviewerModelId: '5', reviewerModelName: 'Careful model',
  reviewRounds: [
    {
      round: 1, verdict: 'REVISE', summary: 'One claim has no source.', revised: true, charactersBefore: 1200, charactersAfter: 1100,
      issues: [{ kind: 'UNSUPPORTED', issue: 'The claim about the sun is in no note.', fix: 'Cite [1] or cut it.' }],
    },
  ],
};
await page.reload({ waitUntil: 'domcontentloaded' });
await opened.locator('[data-review-panel]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const reviewedStates = await opened.locator('[data-stages] > li').evaluateAll((all) => all.map((one) => `${one.getAttribute('data-stage-step')}:${one.getAttribute('data-state')}`));
record(reviewedStates.includes('REVIEW:done') && reviewedStates.length === 6, `reviewed, Review is a step it took (${reviewedStates.join(', ')})`);
const reviewRounds = await opened.locator('[data-review-panel] [data-review-round]').evaluateAll((all) =>
  all.map((one) => ({
    verdict: one.querySelector('[data-verdict-label]')?.textContent?.trim(),
    outcome: one.querySelector('[data-review-outcome]')?.textContent?.trim(),
    issues: [...one.querySelectorAll('[data-issue]')].map((issue) => (issue.textContent ?? '').replace(/\s+/g, ' ').trim()),
  })),
);
record(reviewRounds.length === 1 && reviewRounds[0].verdict === 'Changes asked for', `a Review panel gives each round's verdict (${JSON.stringify(reviewRounds)})`);
record(
  reviewRounds[0]?.issues.length === 1 && reviewRounds[0].issues[0].includes('Unsupported claim') && reviewRounds[0].issues[0].includes('Cite [1] or cut it.'),
  `with what it found, by kind, and the fix (${reviewRounds[0]?.issues.join(' | ')})`,
);
record((reviewRounds[0]?.outcome ?? '').includes('revised') && (reviewRounds[0]?.outcome ?? '').includes('1200') && (reviewRounds[0]?.outcome ?? '').includes('1100'), `and that the report was revised for it (${reviewRounds[0]?.outcome})`);
const reviewer = ((await opened.locator('[data-research-reviewer]').textContent().catch(() => '')) ?? '').trim();
record(reviewer === 'Careful model', `the summary names the reviewer's model (${reviewer})`);

await finish(browser);
