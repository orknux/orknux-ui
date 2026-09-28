/**
 * A saved artifact an answer links to is drawn small under the answer.
 *
 * A task that turned a poem into a PDF said so in a line with a link in it,
 * `[The_Symphony_of_Steel.pdf](…/api/artifacts/13)`, and the pictures the
 * same task drew were on the page while its document was a line of blue text.
 * Now a PDF is drawn as its first page, a picture as itself, and a file that is
 * not what it says - a PDF that will not open - as the tile the Artifacts page
 * draws, rather than as nothing.
 *
 * Measured on what is drawn: the page is a canvas with a size, and pixels on
 * it that are not all one colour, which is what separates a page drawn from a
 * box left blank.
 *
 * The artifacts and the answer are both stubbed. A seeded installation has no
 * saved artifacts - only an agent's tool makes one - and what is measured is
 * the rendering, which is the same component in the chat, a task's log and a
 * task's outcome.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { chatSessions } = await graphql(
  `query ($w: ID!) { chatSessions(workspaceId: $w) { id title } }`,
  { w: WORKSPACE },
);
const chat = chatSessions[0];
if (chat === undefined) {
  record(false, 'the workspace has a chat to open; the seed builds one');
  await finish(browser);
}

/** A one-page PDF with a black box and a word on it, cross-reference and all. */
function onePagePdf() {
  const stream = 'BT /F1 48 Tf 72 700 Td (Steel) Tj ET 72 300 450 300 re f';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((one, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${one}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const at of offsets) body += `${String(at).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

/** Numbers no installation has handed out, so nothing real is fetched. */
const PDF = '990001';
const BROKEN = '990002';
const PICTURE = '990003';
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const FILES = {
  [PDF]: { contentType: 'application/pdf', body: onePagePdf() },
  // What artifact 12 is on the development database: 32 bytes calling themselves a PDF.
  [BROKEN]: { contentType: 'application/pdf', body: Buffer.from('this is not a pdf, it only says') },
  [PICTURE]: { contentType: 'image/png', body: PIXEL },
};
await page.route(/\/api\/artifacts\/99000\d(\/preview)?$/, (route) => {
  const id = route.request().url().match(/\/api\/artifacts\/(\d+)/)[1];
  const file = FILES[id];
  // As the server answers: the file's own address hands a document over as a
  // download, and only the reading address says what it is.
  const reading = route.request().url().endsWith('/preview');
  const contentType = reading || file.contentType.startsWith('image/') ? file.contentType : 'application/octet-stream';
  return route.fulfill({ status: 200, contentType, body: file.body });
});

const ANSWER = [
  'I converted the poem into a PDF.',
  '',
  `You can download it here: [The_Symphony_of_Steel.pdf](http://localhost:5173/api/artifacts/${PDF})`,
  `The first try is here too: [Symphony_of_Steel.pdf](/api/artifacts/${BROKEN})`,
  `And the cover: [cover.png](http://localhost:5173/api/artifacts/${PICTURE})`,
].join('\n');

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('ChatMessages')) {
    await route.continue();
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      data: {
        chatMessages: [
          { role: 'user', content: 'Convert this to pdf', actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:00Z' },
          { role: 'assistant', content: ANSWER, actor: null, takes: [], thinking: null, thinkingMillis: null, at: '2026-09-20T10:00:05Z' },
        ],
      },
    }),
  });
});

await page.goto(`${BASE}/chat/${chat.id}`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'the chat log')) {
  const pdf = `[data-artifact-miniature="${PDF}"]`;
  await page.waitForSelector(`${pdf} canvas[data-state="drawn"]`, { timeout: 20_000 }).catch(() => null);

  const shown = await page.evaluate(
    ({ PDF, BROKEN, PICTURE }) => {
      const box = (element) => {
        if (element === null) return null;
        const { width, height } = element.getBoundingClientRect();
        return { width: Math.round(width), height: Math.round(height) };
      };
      const miniature = (id) => document.querySelector(`[data-artifact-miniature="${id}"]`);
      const canvas = miniature(PDF)?.querySelector('canvas') ?? null;
      let colours = 0;
      if (canvas !== null && canvas.width > 0 && canvas.height > 0) {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        const seen = new Set();
        for (let at = 0; at < pixels.length; at += 4 * 97) seen.add(pixels[at] + pixels[at + 1] * 256 + pixels[at + 2] * 65536);
        colours = seen.size;
      }
      return {
        page: box(canvas),
        colours,
        pageLink: miniature(PDF)?.querySelector('a')?.getAttribute('href') ?? null,
        caption: miniature(PDF)?.querySelector('figcaption')?.textContent ?? null,
        brokenCanvas: miniature(BROKEN)?.querySelector('canvas') !== null && miniature(BROKEN)?.querySelector('canvas') !== undefined,
        brokenTile: box(miniature(BROKEN)?.querySelector('a') ?? null),
        brokenText: miniature(BROKEN)?.querySelector('a')?.textContent ?? null,
        picture: box(miniature(PICTURE)?.querySelector('img') ?? null),
      };
    },
    { PDF, BROKEN, PICTURE },
  );
  console.log(JSON.stringify(shown));

  record(
    shown.page !== null && shown.page.width > 0 && shown.page.height > 0,
    `the PDF is drawn as a miniature with a size (${JSON.stringify(shown.page)})`,
  );
  record(
    shown.page !== null && shown.page.height > shown.page.width,
    'the miniature is a page, taller than it is wide',
  );
  record(shown.colours > 1, `something is drawn on the page, not a blank box (${shown.colours} colours)`);
  record(shown.pageLink === `/api/artifacts/${PDF}/preview`, `the miniature opens the file for reading (${shown.pageLink})`);
  record(shown.caption === 'The_Symphony_of_Steel.pdf', `it is captioned with what the link called it (${shown.caption})`);
  record(
    !shown.brokenCanvas && shown.brokenTile !== null && shown.brokenTile.width > 0 && /PDF/.test(shown.brokenText ?? ''),
    `a PDF that will not open is drawn as a tile saying PDF, not a blank page (${JSON.stringify(shown.brokenTile)})`,
  );
  record(
    shown.picture !== null && shown.picture.width > 0 && shown.picture.height > 0,
    `a saved picture is drawn as itself (${JSON.stringify(shown.picture)})`,
  );
}

await finish(browser);
