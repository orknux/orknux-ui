/**
 * An agent's Tool Rounds is a number box with its unit, showing the
 * installation's number when it has none of its own.
 *
 * It was a borderless field the width of the form whose placeholder was a
 * sentence, "Follows the installation", and it read as a text field that
 * would not take typing. Now it is drawn as Admin -> Settings draws the
 * installation's own, and empty it shows what it follows.
 */
import { BASE, WORKSPACE, open, record, shot, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 1000 } });
const { installationSettings } = await graphql('query { installationSettings { chatMaxRounds } }');
const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 1) { content { id maxRounds } } }',
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0];

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
const box = page.locator('#agent-max-rounds');
await box.waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

const drawn = await box.evaluate((one) => {
  const style = getComputedStyle(one);
  return { width: one.getBoundingClientRect().width, border: style.borderTopWidth, placeholder: one.placeholder };
});
record(drawn.width < 160, `it is a number's width, not the form's (${drawn.width}px)`);
record(drawn.border !== '0px', `with a box of its own (border ${drawn.border})`);
if (agent.maxRounds === null) {
  record(drawn.placeholder === String(installationSettings.chatMaxRounds), `empty, it shows the installation's number (${drawn.placeholder})`);
}
const unit = (await box.locator('xpath=following-sibling::span').first().textContent())?.trim() ?? '';
record(unit.startsWith('rounds'), `with its unit beside it (${unit})`);
// And Tools carried at once, laid out the same way.
const tools = await page.locator('#agent-max-tools').evaluate((one) => ({
  width: one.getBoundingClientRect().width,
  border: getComputedStyle(one).borderTopWidth,
}));
record(tools.width < 160 && tools.border !== '0px', `Tools carried at once is boxed the same (${tools.width}px, ${tools.border})`);
await box.scrollIntoViewIfNeeded();
await page.screenshot({ path: shot('agent-rounds-field.png') });

await finish(browser);
