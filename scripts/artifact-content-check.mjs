/**
 * An artifact's /content address opens the artifact alone, with nothing of
 * Orknux around it, and keeps doing so as the artifact is replaced.
 *
 * Read off the workspace's newest artifact that has a page to show.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { workspaceArtifacts } = await graphql(
  `query($w: ID!) { workspaceArtifacts(workspaceId: $w, page: 0, size: 50) { content { id previewUrl } } }`,
  { w: WORKSPACE },
).catch(() => ({ workspaceArtifacts: { content: [] } }));
const artifact = (workspaceArtifacts?.content ?? []).find((one) => one.previewUrl);
record(artifact !== undefined, `an artifact with a page to show (${artifact?.id})`);

if (artifact !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/${artifact.id}/content`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname.includes('/preview'), { timeout: 20_000 }).catch(() => {});
  const there = new URL(page.url()).pathname;
  record(there === new URL(artifact.previewUrl, BASE).pathname, `it opens the artifact itself (${there})`);
  const shell = await page.locator('[class*="_attributionBar_"], [class*="_launcher_"]').count();
  record(shell === 0, `with nothing of Orknux around it (${shell})`);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/SAVED-0/content`, { waitUntil: 'domcontentloaded' });
const said = await page.getByTestId('artifact-content').textContent({ timeout: 10_000 }).catch(() => '');
record(/no such artifact/i.test(said ?? ''), `an unknown one says so (${said})`);

await finish(browser);
