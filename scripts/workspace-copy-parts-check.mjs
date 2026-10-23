/**
 * Copying a workspace asks what to take: the switches in the copy dialog decide
 * what arrives, and the choice is kept for the next copy.
 *
 * A workspace of its own with one agent and one variable is copied with only
 * Agents switched on; the copy must hold the agent and no variable.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zzCopyParts ${Date.now()}`;

const made = (await graphql('mutation ($n: String!) { createWorkspace(input: { name: $n }) { id } }', { n: NAME })).createWorkspace.id;
const copies = [];
try {
  await graphql('mutation ($w: ID!) { createAgent(input: { workspaceId: $w, name: "Helper", type: LLM }) { id } }', { w: made });
  const catalog = (await graphql('mutation ($w: ID!) { createVariableCatalog(workspaceId: $w, name: "Keys") { id } }', { w: made })).createVariableCatalog.id;
  await graphql(
    'mutation ($w: ID!, $c: ID!) { createVariable(input: { workspaceId: $w, catalogId: $c, name: "region", type: STRING, kind: VALUE, value: "eu" }) { id } }',
    { w: made, c: catalog },
  );

  await page.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
  await drawn(page, 'the workspaces');
  await page.getByRole('button', { name: `Duplicate ${NAME}`, exact: true }).click();
  const dialog = page.getByTestId('copy-workspace-dialog');
  await dialog.waitFor({ timeout: 10_000 });
  const switches = await dialog.locator('[data-copy-part]').count();
  record(switches === 14, `the dialog offers a switch per part (${switches})`);

  await dialog.getByRole('button', { name: 'None', exact: true }).click();
  await dialog.locator('[data-copy-part="AGENTS"]').check();
  // The copy commits the workspace before its parts, so its name shows before they are in it.
  const answered = page.waitForResponse(
    (response) => response.url().includes('/graphql') && (response.request().postData() ?? '').includes('duplicateWorkspace'),
    { timeout: 60_000 },
  );
  await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
  await answered;

  // The copy is named by the server; found by its name once it lands.
  let copy = null;
  for (let tries = 0; tries < 60 && copy === null; tries += 1) {
    const { workspaces } = await graphql('query { workspaces(page: 0, size: 200) { content { id name } } }');
    copy = workspaces.content.find((one) => one.name === `${NAME} copy`) ?? null;
    if (copy === null) await page.waitForTimeout(500);
  }
  record(copy !== null, `the copy is made (${copy?.name})`);
  if (copy !== null) {
    copies.push(copy.id);
    const { workspaceAgents } = await graphql('query ($w: ID!) { workspaceAgents(workspaceId: $w, size: 50) { content { name } } }', { w: copy.id });
    const { workspaceVariables } = await graphql('query ($w: ID!) { workspaceVariables(workspaceId: $w, size: 50) { content { name } } }', { w: copy.id });
    record(workspaceAgents.content.some((one) => one.name === 'Helper'), 'the agent that was switched on came');
    record(workspaceVariables.content.length === 0, `the variables that were switched off did not (${workspaceVariables.content.length})`);
  }

  // The next copy starts from the last choice.
  await page.getByRole('button', { name: `Duplicate ${NAME}`, exact: true }).click();
  await dialog.waitFor({ timeout: 10_000 });
  const ticked = await dialog.locator('[data-copy-part]:checked').evaluateAll((all) => all.map((one) => one.getAttribute('data-copy-part')));
  record(ticked.join() === 'AGENTS', `the dialog remembers the last choice (${ticked.join()})`);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(() => localStorage.removeItem('orknux.workspaceCopyParts'));
} finally {
  for (const id of [...copies, made]) await graphql('mutation ($id: ID!) { deleteWorkspace(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
