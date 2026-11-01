/**
 * An artifact's /content address opens the artifact alone, with nothing of
 * Orknux around it, and keeps doing so as the artifact is replaced.
 *
 * Uploads an artifact of its own to read this off, and deletes it: the suite's
 * fixture holds none since the manual's chapters stopped seeding it (v1.2.3).
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const uploaded = await context.request.post(`${BASE}/api/workspaces/${WORKSPACE}/artifacts`, {
  multipart: {
    file: { name: 'zz-artifact-content.html', mimeType: 'text/html', buffer: Buffer.from('<!doctype html><title>zz</title><p>A report.</p>') },
    description: 'Made by artifact-content-check',
  },
});
record(uploaded.ok(), `an artifact is uploaded to open (${uploaded.status()})`);

const { workspaceArtifacts } = await graphql(
  `query($w: ID!) { workspaceArtifacts(workspaceId: $w, page: 0, size: 50, search: "zz-artifact-content") { content { id filename previewUrl } } }`,
  { w: WORKSPACE },
);
const mine = (workspaceArtifacts?.content ?? []).filter((one) => one.filename === 'zz-artifact-content.html');
const artifact = mine.find((one) => one.previewUrl);
record(artifact !== undefined, `with a page to show (${artifact?.id})`);

if (artifact !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/${artifact.id}/content`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname.includes('/preview'), { timeout: 20_000 }).catch(() => {});
  const there = new URL(page.url()).pathname;
  record(there === new URL(artifact.previewUrl, BASE).pathname, `it opens the artifact itself (${there})`);
  const shell = await page.locator('[class*="_attributionBar_"], [class*="_launcher_"]').count();
  record(shell === 0, `with nothing of Orknux around it (${shell})`);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts/SAVED-0/content`, { waitUntil: 'domcontentloaded' });
// It says "Opening…" until the server has answered, so what is waited for is the answer.
const refusal = page.getByTestId('artifact-content').filter({ hasText: /no such artifact/i });
record(await refusal.waitFor({ timeout: 10_000 }).then(() => true).catch(() => false), `an unknown one says so (${await page.getByTestId('artifact-content').textContent().catch(() => null)})`);

for (const one of mine) await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id: one.id }).catch(() => undefined);

await finish(browser);
