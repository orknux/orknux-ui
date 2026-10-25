/**
 * A saved artifact's file can be replaced from the viewer on the Artifacts
 * page: a Replace beside Open in a tab picks a file, an in-page confirmation
 * says the link stays, and the viewer then shows the new content at the same
 * address - where every re-publish used to be a new SAVED-n and the old link
 * kept the old file. Uploads its own file and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 900 } });
const stamp = Date.now().toString(36);
const name = `replace-check-${stamp}.txt`;
const OLD = `the old words ${stamp}`;
const NEW = `the new words ${stamp}`;

await page.goto(`${BASE}/workspace/${WORKSPACE}/artifacts`, { waitUntil: 'domcontentloaded' });
await page.getByTestId('artifacts-upload').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.getByTestId('artifacts-upload-file').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(OLD) });
await page.getByText(name).first().waitFor({ timeout: 10_000 }).catch(() => undefined);

const found = await graphql('query ($w: ID!) { workspaceArtifacts(workspaceId: $w, page: 0, size: 50) { content { id filename } } }', { w: WORKSPACE });
const id = found.workspaceArtifacts.content.find((one) => one.filename === name)?.id ?? null;
record(id !== null, `the file to replace is uploaded (${id})`);

/** What the viewer's frame shows, read from inside it. */
async function shown() {
  const frame = page.frameLocator('iframe[title]');
  return (await frame.locator('body').textContent({ timeout: 5_000 }).catch(() => '')) ?? '';
}

if (id !== null) {
  const address = `${BASE}/workspace/${WORKSPACE}/artifacts/${id}`;
  await page.goto(address, { waitUntil: 'domcontentloaded' });
  await page.locator('iframe[title]').waitFor({ timeout: 15_000 }).catch(() => undefined);
  record((await shown()).includes(OLD), 'the viewer shows the first file');

  const replace = page.locator('[data-reading-replace]');
  record(await replace.count() === 1, 'the viewer has a Replace beside Open in a tab');
  if (await replace.count() === 1) {
    await page.locator('[data-reading-replace-file]').setInputFiles({ name, mimeType: 'text/plain', buffer: Buffer.from(NEW) });
    const dialog = page.locator('dialog[open]');
    await dialog.waitFor({ timeout: 5_000 }).catch(() => undefined);
    const said = (await dialog.textContent().catch(() => '')) ?? '';
    record(said.includes(name) && /link/i.test(said), `an in-page confirmation names the file and says the link stays (${said.slice(0, 120)})`);
    await dialog.getByRole('button', { name: /^(Replace|Zamień)$/ }).click().catch(() => undefined);
    await dialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => undefined);
    // The frame is sandboxed, so it is read through Playwright rather than contentDocument, until it changes.
    for (let tries = 0; tries < 20 && !(await shown()).includes(NEW); tries += 1) await page.waitForTimeout(500);
    record((await shown()).includes(NEW), 'the viewer then shows the new file');
    record(page.url() === address, `at the same address (${page.url()})`);

    // From cold, the address somebody was sent shows the new file and not the browser's copy of the old one.
    await page.goto(address, { waitUntil: 'domcontentloaded' });
    await page.locator('iframe[title]').waitFor({ timeout: 15_000 }).catch(() => undefined);
    await page.waitForTimeout(500);
    const cold = await shown();
    record(cold.includes(NEW) && !cold.includes(OLD), 'opened again, the same address shows the new file');

    const after = await graphql('query ($w: ID!) { workspaceArtifacts(workspaceId: $w, page: 0, size: 50) { content { id filename } } }', { w: WORKSPACE });
    record(after.workspaceArtifacts.content.filter((one) => one.filename === name).map((one) => one.id).join() === id, 'and it is still the one artifact, under its key');
  }
  await graphql('mutation ($id: ID!) { deleteArtifact(id: $id) }', { id }).catch(() => undefined);
}
await finish(browser);
