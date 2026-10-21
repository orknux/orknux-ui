/**
 * Workspace sharing: one workspace lends another a variable catalog, from the
 * Sharing card of its settings, and an agent in the other is offered it among
 * its own catalogs - under who lends it - and a grant of it saves. Stopping the
 * share takes it back.
 *
 * Builds two workspaces of its own and removes them after, so it lends nothing
 * of anybody's.
 */
import { BASE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const stamp = Date.now();
const made = async (name) =>
  (await graphql('mutation ($n: String!) { createWorkspace(input: { name: $n }) { id } }', { n: name })).createWorkspace.id;
const lender = await made(`zzLender ${stamp}`);
const borrower = await made(`zzBorrower ${stamp}`);
const CATALOG = `Shared keys ${stamp}`;

try {
  await graphql('mutation ($w: ID!, $n: String!) { createVariableCatalog(workspaceId: $w, name: $n) { id } }', { w: lender, n: CATALOG });
  const agent = (
    await graphql('mutation ($w: ID!) { createAgent(input: { workspaceId: $w, name: "Borrowing", type: LLM }) { id } }', { w: borrower })
  ).createAgent;

  /* ---- lending it, from the lender's settings ---- */

  await page.goto(`${BASE}/workspace/${lender}/settings`, { waitUntil: 'domcontentloaded' });
  const card = page.getByTestId('workspace-sharing');
  await card.waitFor({ timeout: 15_000 });
  record((await card.locator('h2#sharing').textContent()) === 'Sharing', 'the settings have a Sharing card');

  await card.getByTestId('share-component').selectOption({ label: CATALOG });
  await card.getByTestId('share-workspace').selectOption({ label: `zzBorrower ${stamp}` });
  await card.getByRole('button', { name: 'Share', exact: true }).click();
  const given = card.getByTestId('share-given');
  await given.first().waitFor({ timeout: 10_000 });
  const line = (await given.first().innerText()).replace(/\s+/g, ' ');
  record(line.includes(CATALOG) && line.includes(`zzBorrower ${stamp}`), `the share is listed with what and with whom (${line})`);

  // The three pickers and the press on one row, level at their foot.
  const feet = await card.evaluate((el) =>
    [...el.querySelectorAll('select'), [...el.querySelectorAll('button')].find((one) => one.textContent === 'Share')]
      .map((one) => Math.round(one?.getBoundingClientRect().bottom ?? -1)),
  );
  record(feet.every((one) => Math.abs(one - feet[0]) <= 2), `the pickers and Share sit on one line (${feet.join(', ')})`);

  /* ---- every workspace at once ---- */

  const visible = (await graphql('query { workspaces(page: 0, size: 200) { content { id } } }')).workspaces.content.length - 1;
  await card.getByTestId('share-component').selectOption({ label: CATALOG });
  await card.getByTestId('share-workspace').selectOption({ label: 'All workspaces' });
  await card.getByRole('button', { name: 'Share', exact: true }).click();
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="share-given"]').length === n, visible, { timeout: 20_000 }).catch(() => {});
  const all = await card.getByTestId('share-given').count();
  record(all === visible, `All workspaces shares with every other workspace, once each (${all} of ${visible})`);
  const { workspaceSharesGiven: lentOut } = await graphql('query ($w: ID!) { workspaceSharesGiven(workspaceId: $w) { id granteeWorkspaceId } }', { w: lender });
  for (const one of lentOut.filter((share) => share.granteeWorkspaceId !== borrower)) {
    await graphql('mutation ($id: ID!) { removeWorkspaceShare(id: $id) }', { id: one.id });
  }

  /* ---- using it, from the borrower's agent ---- */

  await page.goto(`${BASE}/workspace/${borrower}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
  await drawn(page, "the agent's settings");
  const secretList = page.locator('[data-grants="secret catalogs"]');
  const lent = secretList.locator(`[data-grant-name="${CATALOG}"]`);
  await lent.waitFor({ timeout: 15_000 }).catch(() => {});
  record((await lent.count()) === 1, "the borrower's agent is offered the lent catalog");
  const said = (await lent.innerText().catch(() => '')).replace(/\s+/g, ' ');
  record(said.includes(`from zzLender ${stamp}`), `and says which workspace lends it (${said})`);

  await lent.locator('input[type="checkbox"]').click();
  await page.getByRole('button', { name: /^Save/ }).first().click();
  await page.waitForTimeout(1500);
  const { agent: saved } = await graphql('query ($id: ID!) { agent(id: $id) { secretCatalogs } }', { id: agent.id });
  record(saved.secretCatalogs.some((one) => one.startsWith('share:')), `the grant saves, by the share (${saved.secretCatalogs.join(', ')})`);

  /* ---- taking it back ---- */

  await page.goto(`${BASE}/workspace/${lender}/settings`, { waitUntil: 'domcontentloaded' });
  await card.waitFor({ timeout: 15_000 });
  await card.getByTestId('share-given').first().getByRole('button', { name: 'Stop sharing' }).click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="share-given"]').length === 0, null, { timeout: 10_000 }).catch(() => {});
  record((await card.getByTestId('share-given').count()) === 0, 'Stop sharing takes the row away');
  const { agent: after } = await graphql('query ($id: ID!) { agent(id: $id) { secretCatalogs } }', { id: agent.id });
  record(after.secretCatalogs.length === 0, `and the grant from the borrower's agent (${after.secretCatalogs.join(', ')})`);
} finally {
  for (const id of [borrower, lender]) await graphql('mutation ($id: ID!) { deleteWorkspace(id: $id) }', { id }).catch(() => {});
}

await finish(browser);
