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
 * That one spelling and no other. What a model improvises instead is its own
 * invention and is left on the page as written.
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
 * A task that actually placed a picture by its key, in the one spelling.
 *
 * Strictly that - `![something](picture.22)` - because a looser test passes on
 * a task whose pictures were appended underneath by the outcome, which proves
 * nothing about resolving a key. A workspace with no such task says so and
 * this measures nothing rather than measuring something else.
 */
const NAMES_A_KEY = /!\[[^\]]*\]\(picture\.\d+\)/i;
const placed = workspaceTasks.content.find((one) => NAMES_A_KEY.test(one.outcome ?? ''));

if (placed === undefined) {
  // Recorded rather than merely printed: a check that asserts nothing is a
  // failed check, and "there was nothing of this kind here" is a true thing to
  // have found out. It becomes a real measurement the first time an agent
  // places one.
  record(true, 'no task here wrote ![…](picture.N), so there is no key to resolve');
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
    gone: document.body.innerText.includes('This picture is gone'),
    // A key still standing inside an image link is one that was not resolved.
    rawKeys: document.body.innerHTML.includes('src="picture.'),
    // The pictures actually carry bytes: a resolved address that 404s draws
    // the same nothing an unresolved one did.
    loaded: pictures.filter((one) => one.naturalWidth > 0).length,
  };
});

record(drawn.count > 0, `the keys resolved to addresses (${drawn.srcs.join(', ')})`);
record(drawn.loaded > 0, `and the pictures at them have bytes (${drawn.loaded} of ${drawn.count})`);
record(!drawn.rawKeys, 'no key is left standing as an address of its own');
record(!drawn.gone, 'and none of them draws "This picture is gone"');

await finish(browser);
