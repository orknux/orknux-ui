/**
 * A picture named by its key, in the middle of what an agent wrote, is drawn.
 *
 * A tool that draws answers with a key - `picture.22` - and never a link,
 * because a key is what another tool takes to *deliver* the picture and a link
 * handed to a model is a link pasted into a chat that cannot resolve it. But an
 * agent asked to put pictures inside its text has to name them somehow, and the
 * key is the only name it has: it wrote `![a tower](picture.22)`, and before
 * this that was an address pointing at nothing - four broken-image lines in a
 * poem, and "This picture is gone" under each stanza.
 *
 * So the key is resolved where the pictures are known to live rather than
 * handed out as a URL. This measures the resolving, on a task that actually
 * drew something; a workspace whose agents have never drawn has nothing to
 * measure and says so.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });

const { workspaceTasks } = await graphql(
  `query ($w: ID!) {
     workspaceTasks(workspaceId: $w, page: 0, size: 50) { content { id outcome } }
   }`,
  { w: WORKSPACE },
);

/**
 * A task that named a picture by its key at all.
 *
 * By the outcome, because that is the only part of a task the API hands back -
 * the transcript, where an agent usually does the placing, is read from the
 * page. A task whose summary talks about `picture.22` is a task that drew
 * and named them, which is the one this check wants; what it placed and where
 * is then measured on the page itself.
 */
const NAMES_A_KEY = /picture\.\d+/i;
const placed = workspaceTasks.content.find((one) => NAMES_A_KEY.test(one.outcome ?? ''));

if (placed === undefined) {
  console.log('NOTE: no task here placed a picture by its key, so there is nothing to resolve');
  await finish(browser);
}

record(true, `a task that placed a picture by key: #${placed.id}`);

await page.goto(`${BASE}/workspace/${WORKSPACE}/tasks/${placed.id}`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('img[src*="/api/task-pictures/"]', { timeout: 20_000 });
await page.waitForTimeout(800);

const drawn = await page.evaluate(() => {
  const pictures = [...document.querySelectorAll('img[src*="/api/task-pictures/"]')];
  return {
    count: pictures.length,
    srcs: [...new Set(pictures.map((one) => one.getAttribute('src')))].slice(0, 6),
    // What the reader sees where a picture failed to resolve, in both of the
    // ways it used to fail.
    placeholders: document.body.innerText.includes('[Image: picture.'),
    gone: document.body.innerText.includes('This picture is gone'),
    rawKeys: /\]\(picture\.\d+\)/.test(document.body.innerText),
    // The pictures actually carry bytes: a resolved address that 404s draws
    // the same nothing an unresolved one did.
    loaded: pictures.filter((one) => one.naturalWidth > 0).length,
  };
});

record(drawn.count > 0, `the keys resolved to addresses (${drawn.srcs.join(', ')})`);
record(drawn.loaded > 0, `and the pictures at them have bytes (${drawn.loaded} of ${drawn.count})`);
record(!drawn.placeholders, 'nothing is left as [Image: picture.N] for somebody to read');
record(!drawn.rawKeys, 'and no key is left standing in a link');
record(!drawn.gone, 'and none of them draws "This picture is gone"');

await finish(browser);
