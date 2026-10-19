/**
 * A run of a version of its workflow since replaced says so, loudly, above the
 * graph - and a run of the version on screen says nothing.
 *
 * The run page draws the graph the run kept, which reads as the workflow the
 * editor shows; a run of an older publication looked exactly like one of the
 * current. The version is answered here over a real run of the workspace.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { workspaceExecutions: executions } = await graphql(
  `query($w: ID!) { workspaceExecutions(workspaceId: $w, page: 0, size: 1) { content { id } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceExecutions: { content: [] } }));
const id = executions?.content?.[0]?.id;
record(id !== undefined, `the workspace has a run to look at (${id})`);

let version = null;
await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  if (!(body.query ?? '').includes('execution(id')) return route.continue();
  const answered = await route.fetch();
  const json = await answered.json();
  if (json?.data?.execution) json.data.execution.version = version;
  return route.fulfill({ response: answered, json });
});

const banner = page.locator('[data-old-version]');
async function look(given) {
  version = given;
  await page.goto(`${BASE}/workspace/${WORKSPACE}/executions/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
}

const base = { draft: false, publicationId: '3', publishedAt: '2026-10-12T14:02:00+02:00', publishedBy: 'alice', newestPublishedAt: null };

await look({ ...base, current: false, editedSince: false, newestPublishedAt: '2026-10-18T09:00:00+02:00' });
const replaced = await banner.innerText().catch(() => '');
record(/published again since/.test(replaced), `a run of a replaced publication says so (${JSON.stringify(replaced)})`);
const box = await banner.boundingBox().catch(() => null);
record(box !== null && box.height > 20 && box.y < 300, `and says it above the graph, where it is seen first (${JSON.stringify(box)})`);
const text = await banner.evaluate((el) => {
  const range = document.createRange();
  range.selectNodeContents(el);
  return range.getBoundingClientRect().width;
}).catch(() => 0);
record(box !== null && box.width < text + 80, `and is as wide as what it says, not the whole page (${Math.round(box?.width ?? 0)}px for ${Math.round(text)}px of text)`);

await look({ ...base, current: true, editedSince: true });
record(/unpublished changes/.test(await banner.innerText().catch(() => '')), 'a run of the published version with a draft edited since says so');

await look({ ...base, current: true, editedSince: false });
record((await banner.count()) === 0, 'a run of the version on screen says nothing');

await look({ draft: true, publicationId: null, publishedAt: null, publishedBy: null, current: true, editedSince: false, newestPublishedAt: null });
record((await banner.count()) === 0, 'nor does a run of the draft');

await finish(browser);
