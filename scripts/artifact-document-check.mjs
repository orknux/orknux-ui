/**
 * An artifact that is not a picture is a thing you can open.
 *
 * The Artifacts page drew every row as an `<img>`, so an HTML report an agent
 * wrote appeared as the browser's broken-image icon - which is the page's own
 * way of saying "these bytes are gone" about a file that is perfectly fine.
 * The only way to read it was to download it and open it from a machine, which
 * is the same HTML with *more* trust around it than a tab has.
 *
 * So: a document gets a tile that says what it is and a link that opens it,
 * and the server hands it back sandboxed - no script, no network, an opaque
 * origin - which is what makes opening it in a tab the safer of the two.
 *
 * The artifact is made through the API rather than by asking an agent to write
 * one: what is measured here is the page and the headers, not a model.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1000 } });

/*
 * An artifact that is not a picture, whichever one this installation has.
 *
 * Artifacts arrive through the agent's own `save_artifact` tool - there is no
 * mutation to make one with - so this reads the workspace rather than seeding
 * it, and says plainly when there is nothing of the kind to look at. That is
 * better than a timeout: a workspace whose agents have only ever drawn
 * pictures is not a failure of this page.
 */
const { workspaceArtifacts } = await graphql(
  `query($w: ID!) {
     workspaceArtifacts(workspaceId: $w, page: 0, size: 100) {
       content { id prompt filename contentType url previewUrl }
     }
   }`,
  { w: WORKSPACE },
);

const PICTURES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp'];
const document_ = workspaceArtifacts.content.find(
  (one) => !PICTURES.includes((one.contentType ?? '').toLowerCase().split(';')[0].trim()),
);

if (document_ === undefined) {
  console.log('NOTE: this workspace holds only pictures, so there is no document tile to measure');
  await finish(browser);
}

record(true, `a document artifact to look at: ${document_.filename} (${document_.contentType})`);

/* ------------------------------------------------------- what the server says */

/*
 * Two addresses, and the difference between them is the point.
 *
 * The artifact's own url hands the bytes over whatever they are, so a link
 * somebody copies and sends a colleague is a download - which is what they
 * meant by copying it. Rendering is something the server does deliberately, at
 * an address that says so.
 */
record(
  document_.previewUrl !== null && document_.previewUrl !== document_.url,
  `a document has a reading address of its own (${document_.url} against ${document_.previewUrl})`,
);

const handed = await page.request.get(`${BASE}${document_.url}`);
record(
  (handed.headers()['content-disposition'] ?? '').startsWith('attachment'),
  `and its own address still hands the file over (${handed.headers()['content-disposition']})`,
);

const served = await page.request.get(`${BASE}${document_.previewUrl}`);
const disposition = served.headers()['content-disposition'] ?? '';
const policy = served.headers()['content-security-policy'] ?? '';

record(served.status() === 200, `the file is served (${served.status()})`);
record(
  disposition.startsWith('inline'),
  `a document is handed back to be read rather than saved (${disposition})`,
);
record(
  (served.headers()['content-type'] ?? '').split(';')[0].trim() === document_.contentType.split(';')[0].trim(),
  `as itself rather than as a download (${served.headers()['content-type']})`,
);

/*
 * The assertion the whole thing rests on. A page served from our host with no
 * sandbox is a page with our cookies; with it, the document is in an opaque
 * origin and nothing in it runs.
 */
record(policy.includes('sandbox'), `and sandboxed, so nothing in it runs (${policy})`);
record(policy.includes("default-src 'none'"), 'with nothing fetchable from anywhere');
record(!policy.includes('script-src'), 'and no script allowance of any kind');

/* --------------------------------------------------------- what the page draws */

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
// The gallery itself, not a stopwatch: the page fetches a page of artifacts
// and the cards arrive when they arrive.
await page.waitForSelector('figure', { timeout: 20_000 });
await page.waitForTimeout(600);

const tile = await page.evaluate(({ named, at }) => {
  const cards = [...document.querySelectorAll('figure')];
  // By what the card links to rather than by its words: the caption is the
  // prompt, truncated, and a filename may not be on the card at all.
  const card =
    cards.find((one) => one.querySelector(`a[href="${at}"], img[src="${at}"]`) !== null) ??
    cards.find((one) => one.textContent.includes(named));
  if (card === undefined) return null;
  const link = card.querySelector('a[target="_blank"]');
  // Any picture tile on the page: their addresses differ by where the picture
  // came from - a run, a task, an agent's own saving - and what is being
  // compared is the box, not the file.
  const picture = document.querySelector('figure [class*="_image_"]');
  return {
    brokenImage: card.querySelector('img[src*="/api/artifacts/"]') !== null,
    opensInATab: link !== null,
    href: link?.getAttribute('href') ?? '',
    tall: Math.round(link?.getBoundingClientRect().height ?? 0),
    pictureTall: Math.round(picture?.getBoundingClientRect().height ?? 0),
    cursor: link === null ? '' : getComputedStyle(link).cursor,
    says: card.textContent.replace(/\s+/g, ' ').trim().slice(0, 120),
  };
}, { named: document_.prompt || document_.filename, at: document_.url });

record(tile !== null, 'the document is on the Artifacts page');
if (tile !== null) {
  record(
    !tile.brokenImage,
    'it is not drawn as a picture, which is what made it look like a file that had gone',
  );
  record(tile.opensInATab, `it opens in a tab (${tile.href})`);
  record(
    tile.href === document_.previewUrl,
    `at the reading address rather than the file's (${tile.href})`,
  );
  /*
   * The same box a thumbnail fills, and a cursor that says what the click
   * does. Sized to the glyph, the tile was a strip at the top of a card as
   * tall as its neighbours - a band of dark under the caption, which reads as
   * a picture that failed to load. And it shares a class with the picture
   * tile, which is `zoom-in`: a magnifying glass over something that opens a
   * tab is the interface telling a small lie every time somebody passes over
   * it.
   */
  record(
    tile.tall === tile.pictureTall,
    `and fills the same box a picture does (${tile.tall}px against ${tile.pictureTall}px)`,
  );
  record(tile.cursor === 'pointer', `with a cursor that says it opens something (${tile.cursor})`);
  record(
    /[A-Z]{2,5}/.test(tile.says),
    `and the tile says what kind of file it is (${tile.says})`,
  );
}

await finish(browser);
