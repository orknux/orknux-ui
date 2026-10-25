/**
 * A PDF opens on the Artifacts page, in the middle of the window.
 *
 * The reader framed the preview address, and the server serves every preview
 * under `Content-Security-Policy: sandbox` - which an HTML file an agent wrote
 * needs, and which a browser's own PDF reader will not run under. So a PDF was
 * Chrome's broken-document icon, every time, and the Research page's report
 * was the same icon. The pages are drawn by pdf.js now, and an HTML file is
 * still the sandboxed frame it was.
 *
 * And the panel was fixed to the scrolled content area rather than to the
 * window - the shell's content rises in with a transform that fills forwards,
 * which makes it the containing block of anything fixed inside it - so it sat
 * low and to the right of where anybody was looking.
 *
 * Both files are made here, through the upload the New research dialog uses:
 * what is measured is the reader, not whatever a workspace happens to hold.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const VIEWPORT = { width: 1500, height: 1000 };
const { browser, context, page, graphql } = await open({ viewport: VIEWPORT });

/**
 * A real PDF of [pages] pages, each with a line of text and a filled block on
 * it - text so the text layer has something to select, the block so a drawn
 * page cannot be mistaken for a blank one.
 */
function makePdf(pages) {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', null];
  const kids = [];
  pages.forEach((words) => {
    const content = `0.15 0.35 0.75 rg 72 560 450 120 re f BT /F1 28 Tf 0 0 0 rg 72 720 Td (${words}) Tj ET`;
    const pageAt = objects.length + 1;
    kids.push(`${pageAt} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${pageAt + 2} 0 R >> >> /Contents ${pageAt + 1} 0 R >>`,
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    );
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets = objects.map((body, at) => {
    const offset = out.length;
    out += `${at + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  out += offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const STAMP = Date.now();
const PDF_NAME = `zz-pdf-reader-${STAMP}.pdf`;
const HTML_NAME = `zz-pdf-reader-${STAMP}.html`;

/** Kept as a workspace document, and answered as the artifact the gallery lists. */
async function upload(name, mimeType, buffer) {
  const answer = await context.request.post(`${BASE}/api/workspaces/${WORKSPACE}/research-documents`, {
    multipart: { files: { name, mimeType, buffer } },
  });
  const said = await answer.json().catch(() => ({}));
  const id = said.documents?.[0]?.id;
  if (id === undefined) throw new Error(`${name} was not kept: ${answer.status()} ${JSON.stringify(said)}`);
  const { workspaceArtifact } = await graphql(
    `query($w: ID!, $id: ID!) { workspaceArtifact(workspaceId: $w, id: $id) { id filename contentType url previewUrl } }`,
    { w: WORKSPACE, id: `SAVED-${id}` },
  );
  return workspaceArtifact;
}

const pdf = await upload(PDF_NAME, 'application/pdf', makePdf(['Orknux reader check', 'The second page']));
const html = await upload(HTML_NAME, 'text/html', Buffer.from('<!doctype html><h1>Orknux reader check</h1>', 'utf8'));
record(pdf?.contentType === 'application/pdf' && pdf.previewUrl !== null, `a PDF to read (${pdf?.id}, ${pdf?.previewUrl})`);

/** How many of a drawn page's pixels are not the paper: zero is a page nothing was drawn on. */
async function inked(selector) {
  await page
    .waitForFunction((at) => document.querySelector(`${at}[data-drawn="true"]`) !== null, selector, { timeout: 15_000 })
    .catch(() => undefined);
  return page.evaluate((at) => {
    const canvas = document.querySelector(at);
    if (canvas === null || canvas.width === 0) return { found: canvas !== null, ink: 0, of: 0 };
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let ink = 0;
    for (let at = 0; at < pixels.length; at += 4) {
      if (pixels[at + 3] > 0 && (pixels[at] < 240 || pixels[at + 1] < 240 || pixels[at + 2] < 240)) ink += 1;
    }
    return { found: true, ink, of: pixels.length / 4 };
  }, selector);
}

/* ---------------------------------------------------------- the Artifacts reader */

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/${pdf.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="dialog"]', { timeout: 20_000 }).catch(() => undefined);

const first = await inked('[role="dialog"] canvas[data-pdf-page="1"]');
record(first.found, 'the PDF is drawn in the reader as a page, not framed for a reader that will not run');
record(
  first.ink > first.of * 0.02,
  `and the page has its ink on it (${first.ink} of ${first.of} pixels)`,
);

const frames = await page.locator('[role="dialog"] iframe').count();
record(frames === 0, `with no frame of the sandboxed preview behind it (${frames})`);

const words = await page
  .locator('[role="dialog"] [data-pdf-reader]')
  .first()
  .evaluate((reader) => reader.textContent ?? '')
  .catch(() => '');
record(words.includes('Orknux reader check'), `its text is on the page to be selected (${words.replace(/\s+/g, ' ').slice(0, 80)})`);

await page.locator('[role="dialog"] button[aria-label="Next page"], [role="dialog"] button[title="Next page"]').first().click({ timeout: 3_000 }).catch(() => undefined);
await page.waitForTimeout(500);
const where = ((await page.locator('[data-pdf-where]').textContent().catch(() => '')) ?? '').trim();
record(/2\D+2/.test(where), `the next page is a press away, and it says where it is (${where})`);
const second = await inked('[role="dialog"] canvas[data-pdf-page="2"]');
record(second.ink > 0, `and that page is drawn too (${second.ink} pixels)`);

/*
 * In the middle of the window, whatever the page behind it is scrolled to.
 * Everything that can scroll is scrolled to its end first, which is where the
 * reader used to be furthest from where anybody was looking.
 */
await page.evaluate(() => {
  for (const element of document.querySelectorAll('main, [class*="workspace"], body, html')) {
    element.scrollTop = element.scrollHeight;
  }
  window.scrollTo(0, document.body.scrollHeight);
});
await page.waitForTimeout(400);
const box = await page.evaluate(() => {
  const frame = document.querySelector('[role="dialog"] > div');
  const drawn = frame?.getBoundingClientRect();
  return drawn === undefined ? null : { x: drawn.left + drawn.width / 2, y: drawn.top + drawn.height / 2, width: drawn.width, height: drawn.height };
});
const off = box === null ? null : { x: Math.round(box.x - VIEWPORT.width / 2), y: Math.round(box.y - VIEWPORT.height / 2) };
record(
  off !== null && Math.abs(off.x) <= 3 && Math.abs(off.y) <= 3,
  `the reader is centred in the window (${off === null ? 'not drawn' : `${off.x}px across, ${off.y}px down from the centre`})`,
);

/* The reader offers the file itself, not only a tab to read it in. */
const download = await page.evaluate(() => {
  const link = document.querySelector('[role="dialog"] a[data-reading-download]');
  return link === null ? null : { href: link.getAttribute('href'), name: link.getAttribute('download') };
});
const disposition = download === null || download.href === null
  ? null
  : await page.evaluate(async (href) => (await fetch(href)).headers.get('content-disposition'), download.href);
record(
  download !== null && download.name !== null && download.name.endsWith('.pdf') && /^attachment/.test(disposition ?? ''),
  `the reader has a Download that hands over the file (${JSON.stringify(download)}, ${disposition})`,
);

/* ---------------------------------------------- an HTML file is still locked in */

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/${html.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[role="dialog"] iframe', { timeout: 20_000 }).catch(() => undefined);
const framed = await page.evaluate(() => {
  const frame = document.querySelector('[role="dialog"] iframe');
  return frame === null ? null : { sandbox: frame.getAttribute('sandbox'), src: frame.getAttribute('src') };
});
record(
  framed !== null && framed.sandbox === '' && framed.src === html.previewUrl,
  `an HTML file is still read in a frame sandboxed with nothing allowed (${JSON.stringify(framed)})`,
);
record((await page.locator('[role="dialog"] [data-pdf-reader]').count()) === 0, 'and not handed to the PDF reader');

/* --------------------------------------------------- the Research page's report */

/*
 * The research is answered here - a finished one whose report is the PDF made
 * above - so this needs no model; the server's suite drives the pipeline.
 */
const RESEARCH = {
  id: '424243', question: 'zz pdf reader check', modeId: null, modeName: 'Deep', workflowId: '1',
  workflowName: 'Research: Deep', modelId: null, modelName: 'Stub', language: 'FORMAL', outputFormat: 'PDF',
  websitesInclude: [], websitesExclude: [], documentsInclude: [], documentsExclude: [], useWebSearch: true,
  includeImages: false, images: [], status: 'COMPLETED', executionId: null, result: '# Report',
  fileName: PDF_NAME, fileUrl: pdf.url, artifactId: pdf.id.replace('SAVED-', ''), previewUrl: pdf.previewUrl,
  error: null, startedBy: 'alice', startedAt: new Date(Date.now() - 60_000).toISOString(), finishedAt: new Date().toISOString(),
  progress: { step: 'Finished', subQuestions: [], searched: [], level: 1, sourcesRead: 0, stage: 'SAVE' },
  sources: [],
};
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if ((body.query ?? '').includes('research(id:')) return route.fulfill({ json: { data: { research: RESEARCH } } });
  return route.continue();
});
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/research/${RESEARCH.id}`, { waitUntil: 'domcontentloaded' });
await page.locator('[data-opened]').waitFor({ timeout: 20_000 }).catch(() => undefined);
const report = await inked('[data-opened] canvas[data-pdf-page="1"]');
record(report.found && report.ink > 0, `the Research page draws its PDF report too (${report.ink} pixels)`);
await page.unroute('**/graphql');

/* ------------------------------------------------------------------ clean up */

for (const one of [pdf, html]) {
  if (one?.id !== undefined) await graphql('mutation($id: ID!) { deleteArtifact(id: $id) }', { id: one.id }).catch(() => undefined);
}

await finish(browser);
