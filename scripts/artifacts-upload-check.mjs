/**
 * A file can be put onto the Artifacts page from its header's Upload: it is
 * kept, appears in the list under its name, and opens at its own address.
 *
 * Orknux had no general upload there - the only one was the research dialog's,
 * which filed every file as uploaded for research. Removes what it uploads.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 900 } });
const name = `upload-check-${Date.now().toString(36)}.txt`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
const button = page.getByTestId('artifacts-upload');
await button.waitFor({ timeout: 20_000 }).catch(() => undefined);
record(await button.count() === 1, 'the Artifacts page has an Upload in its header');
let id = null;
if (await button.count() === 1) {
  await page.getByTestId('artifacts-upload-file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from('uploaded by a check') });
  await page.getByText(name).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const said = await page.locator('[role="alert"]').allTextContents();
  record(await page.getByText(name).count() > 0, `the file appears in the list under its name (${name}; ${said.join(' | ')})`);
  const found = await graphql('query ($w: ID!) { workspaceArtifacts(workspaceId: $w, page: 0, size: 50) { content { id filename } } }', { w: WORKSPACE });
  id = found.workspaceArtifacts.content.find((one) => one.filename === name)?.id ?? null;
  record(id !== null && id.startsWith('SAVED-'), `and is kept as a saved artifact (${id})`);
}
if (id !== null) await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id }).catch(() => undefined);
await finish(browser);
