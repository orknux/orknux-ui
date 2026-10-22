/**
 * Removing a saved file or a picture asks in its own words, not a workflow's.
 *
 * Reported: both used the generic "remove" dialog, whose words are about a
 * workflow - "Remove workflow ... This will not delete the workflow
 * definition" - over a file or a picture. Only reads the dialog and cancels it:
 * nothing is deleted, and the file is checked to be still there.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const ARTIFACTS = 'query($w: ID!, $drawn: Boolean) { workspaceArtifacts(workspaceId: $w, size: 5, drawn: $drawn) { content { id filename } } }';

/** The open dialog's title and message, then Cancel, and whether it closed. */
async function readAndCancel() {
  const dialog = page.locator('dialog[open]');
  await dialog.waitFor({ timeout: 10_000 });
  const title = ((await dialog.locator('h2').first().textContent()) ?? '').trim();
  const said = ((await dialog.textContent()) ?? '').replace(/\s+/g, ' ');
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await dialog.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => undefined);
  return { title, said };
}

// A file an agent saved, on the Artifacts page.
const files = (await graphql(ARTIFACTS, { w: WORKSPACE, drawn: false })).workspaceArtifacts.content;
if (files.length === 0) {
  record(true, 'no saved file in this workspace; the file half is skipped');
} else {
  const file = files[0];
  await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
  await drawn(page, file.filename);
  await page.getByRole('button', { name: `Delete ${file.filename}` }).first().click();
  const asked = await readAndCancel();
  record(
    asked.title === 'Remove file' && asked.said.includes(file.filename) && !/workflow/i.test(asked.said),
    `removing a file asks about a file, by name, and says nothing of a workflow (${asked.title}: ${asked.said.slice(0, 120)})`,
  );
  const still = (await graphql(ARTIFACTS, { w: WORKSPACE, drawn: false })).workspaceArtifacts.content.some((one) => one.id === file.id);
  record(still, 'and Cancel leaves the file where it was');
}

// A picture on the Design page.
const pictures = (await graphql(ARTIFACTS, { w: WORKSPACE, drawn: true })).workspaceArtifacts.content;
if (pictures.length === 0) {
  record(true, 'no picture in this workspace; the picture half is skipped');
} else {
  const picture = pictures[0];
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/images/${picture.id}`, { waitUntil: 'domcontentloaded' });
  const remove = page.getByTestId('design-image-remove');
  await remove.waitFor({ timeout: 20_000 });
  await remove.click();
  const asked = await readAndCancel();
  record(
    asked.title === 'Remove picture' && !/workflow/i.test(asked.said),
    `removing a picture asks about a picture and says nothing of a workflow (${asked.title}: ${asked.said.slice(0, 120)})`,
  );
}

await finish(browser);
