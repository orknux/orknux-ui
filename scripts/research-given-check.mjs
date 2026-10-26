/**
 * A research's "What it was given" puts each value close beside its label:
 * the labels' column is as wide as the longest label, where a fixed 160px left
 * "Images" a long way from "On".
 *
 * Read off the workspace's newest research, shown as given images and no web search.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
// Any workspace's research will do: the fixture's own may have none.
let research;
let where = WORKSPACE;
const { workspaces: listed } = await graphql('query { workspaces(page: 0, size: 200) { content { id } } }').catch(() => ({ workspaces: { content: [] } }));
const workspaces = listed?.content ?? [];
for (const id of [WORKSPACE, ...(workspaces ?? []).map((one) => one.id)]) {
  const { researches } = await graphql(
    'query ($w: ID!) { researches(workspaceId: $w, page: 0, size: 1) { content { id } } }',
    { w: id },
  ).catch(() => ({ researches: { content: [] } }));
  research = researches?.content?.[0];
  if (research !== undefined) {
    where = id;
    break;
  }
}
record(research !== undefined, `a research to open (${research?.id} in workspace ${where})`);

// Given images and no web search, whatever it was really given: two short labels, so the gap is plain to see.
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (!body.includes('query Research(')) return route.continue();
  const response = await route.fetch().catch(() => null);
  if (response === null) return;
  const json = await response.json().catch(() => null);
  if (json?.data?.research) Object.assign(json.data.research, { includeImages: true, useWebSearch: false });
  await route.fulfill({ response, json }).catch(() => {});
});

if (research !== undefined) {
  await page.goto(`${BASE}/workspace/${where}/explore/research/${research.id}`, { waitUntil: 'domcontentloaded' });
  const list = page.locator('section[aria-label="What it was given"] dl');
  await list.waitFor({ timeout: 20_000 });
  const rows = await list.evaluate((dl) => [...dl.querySelectorAll('dt')].map((term) => {
    const value = term.nextElementSibling;
    const words = document.createRange();
    words.selectNodeContents(term);
    return { label: term.textContent.trim(), gap: Math.round(value.getBoundingClientRect().left - words.getBoundingClientRect().right) };
  }));
  const widest = Math.max(...rows.map((one) => one.gap));
  const shortest = rows.reduce((least, one) => (one.label.length < least.label.length ? one : least), rows[0]);
  // The shortest label's value stands no further than the column's gap plus the longest label's extra words.
  record(rows.length > 0 && rows.some((one) => one.gap <= 20), `the longest label's value stands close beside it (${JSON.stringify(rows)})`);
  record(rows.length === 1 ? rows[0].gap <= 20 : shortest.gap < 160 - 40, `and no value is held 160px out by a fixed column (widest gap ${widest}px)`);
}

await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
await finish(browser);
