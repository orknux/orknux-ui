/**
 * The agent form's Model picker offers a way to make a model.
 *
 * "None - this agent cannot run" left somebody on the form with nowhere to go:
 * the models are made on another page they had to know about. Under the picker
 * a link now opens that page in a new tab - so the agent being edited is not
 * lost - with Add Model already open, and says "No models yet" where the
 * workspace has none an agent can answer on.
 *
 * Opens an agent this workspace already has and changes nothing.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, context, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspaceAgents } = await graphql(
  `query($w: ID!) { workspaceAgents(workspaceId: $w, size: 1) { content { id } } }`,
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0]?.id;
if (agent === undefined) {
  record(false, 'the workspace has an agent to open');
  await finish(browser);
}

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent}/settings`, { waitUntil: 'domcontentloaded' });
const link = page.getByTestId('agent-add-model');
await link.waitFor({ timeout: 20_000 }).catch(() => undefined);
record((await link.count()) === 1, 'under the Model picker there is a link to make a model');
const href = await link.getAttribute('href').catch(() => null);
record(href === `/workspace/${WORKSPACE}/models?add=model`, `it goes to the Models page, asking for Add Model (${href})`);
record((await link.getAttribute('target').catch(() => null)) === '_blank', 'in a new tab, so the agent being edited is kept');
const said = ((await link.textContent().catch(() => '')) ?? '').trim();
record(said === 'Add a model' || said === 'No models yet - add one', `in one short line (${said})`);

// On the Model label's row, at its end: left of the jump to the chosen model, or the end itself when none is chosen.
const placed = async () => page.evaluate(() => {
  const add = document.querySelector('[data-testid="agent-add-model"]')?.getBoundingClientRect();
  const label = document.querySelector('label[for="agent-model"]')?.getBoundingClientRect();
  const row = document.querySelector('label[for="agent-model"]')?.parentElement?.getBoundingClientRect();
  const jump = document.querySelector('a[aria-label^="Open the model"]')?.getBoundingClientRect() ?? null;
  return {
    sameRow: Math.abs(add.top + add.height / 2 - (label.top + label.height / 2)) < 6,
    leftOfJump: jump === null ? null : add.right <= jump.left,
    atEnd: Math.round(row.right - (jump ?? add).right),
  };
});
const model = page.locator('#agent-model');
const before = await model.inputValue();
const firstModel = await model.locator('option').nth(1).getAttribute('value').catch(() => null);
if (firstModel !== null) {
  await model.selectOption(firstModel);
  const chosen = await placed();
  record(chosen.sameRow && chosen.leftOfJump === true && chosen.atEnd <= 2, `with a model chosen it sits on the label row, left of the model's link (${JSON.stringify(chosen)})`);
}
await model.selectOption('');
const none = await placed();
record(none.sameRow && none.leftOfJump === null && none.atEnd <= 2, `with none chosen it takes the row's end (${JSON.stringify(none)})`);
await model.selectOption(before);

// Followed: the Models page, with Add Model open, and the question taken off the address.
const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
await opened.waitForLoadState('domcontentloaded');
const dialog = opened.locator('dialog[open]').filter({ has: opened.getByRole('heading', { name: 'Add Model' }) });
const shown = await dialog.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
record(shown, 'following it lands on the Models page with Add Model open');
record(new URL(opened.url()).pathname === `/workspace/${WORKSPACE}/models` && !opened.url().includes('add='), `and a reload would not open it again (${opened.url()})`);

await finish(browser);
