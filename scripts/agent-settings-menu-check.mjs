/**
 * An agent's settings have a menu down the side, as the workspace and admin
 * settings do. The form is one long card of fields rather than headed
 * sections, so the menu lists its named fields - Model, Tools, Connections,
 * Boxes - and the cards under it; pressing one brings it to the top, the menu
 * stays put while the page scrolls, and its search narrows the page to the
 * fields that match.
 *
 * Makes a scratch agent and deletes it again.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const NAME = `zzAgentMenu_${Date.now()}`;

const agent = (
  await graphql(`mutation ($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id } }`, {
    w: WORKSPACE,
    n: NAME,
  })
).createAgent;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, "the agent's settings"), "the agent's settings open");
  const menu = page.getByTestId('section-menu');
  record(await menu.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false), 'there is a menu beside the form');

  const entries = (await menu.locator('a').allTextContents()).map((one) => one.trim());
  const wanted = ['General', 'System Prompt', 'Model', 'Tools', 'Connections', 'Boxes', 'History', 'Danger Zone'];
  const missing = wanted.filter((one) => !entries.includes(one));
  record(missing.length === 0, `it lists the form's fields and the cards under it (missing: ${missing.join(', ') || 'none'}; ${entries.length} entries)`);
  record(entries.indexOf('General') < entries.indexOf('Tools') && entries.indexOf('Tools') < entries.indexOf('Danger Zone'), 'in the order they are on the page');

  // Pressing an entry brings its field to the top of the frame, and the menu stays in view.
  const menuBefore = await menu.boundingBox();
  await menu.locator('a', { hasText: /^Boxes$/ }).click();
  await page.waitForTimeout(600);
  const boxes = await page.locator('#agent-grants-boxes').boundingBox();
  const frame = await page.locator('main').first().boundingBox();
  const menuAfter = await menu.boundingBox();
  record(boxes !== null && frame !== null && Math.abs(boxes.y - frame.y) < 80, `pressing Boxes brings it to the top (${boxes ? Math.round(boxes.y - frame.y) : '?'}px under it)`);
  // Sticky, as on the other settings pages: it settles under the top of the frame and stays in view however far the page went.
  record(menuBefore !== null && menuAfter !== null && frame !== null && menuAfter.y >= frame.y && menuAfter.y - frame.y < 60, `the menu stays in view while the page scrolls (${Math.round(menuAfter.y - frame.y)}px under the frame's top)`);
  const current = (await menu.locator('a[aria-current="location"]').textContent().catch(() => ''))?.trim();
  record(current === 'Boxes', `and marks Boxes as where the reader is (${current})`);

  // The search narrows the page to the fields that match, and the menu with it.
  await page.getByTestId('settings-search').fill('box');
  await page.waitForTimeout(300);
  const boxesShown = await page.locator('#agent-grants-boxes').isVisible();
  const modelShown = await page.locator('#agent-model-field').isVisible();
  const listed = (await menu.locator('a').allTextContents()).map((one) => one.trim());
  record(boxesShown && !modelShown && listed.includes('Boxes') && !listed.includes('Model'), `searching "box" keeps Boxes and hides Model (${listed.join(', ')})`);
  await page.getByTestId('settings-search').fill('');
  await page.waitForTimeout(300);
  record(await page.locator('#agent-model-field').isVisible(), 'clearing it brings everything back');
} finally {
  await graphql(`mutation ($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => {});
}

await finish(browser);
