/**
 * An agent node on the graph names the skills to load, by id. Issue #381.
 *
 * A `skillIds` row beside prompt and systemPrompt, written out or pointed at
 * another node's field the way the rest are; and a written id that names no
 * skill is refused at the save, in words, on the node. What the run does with
 * the ids - loads the skills before the model starts, notes the ones that name
 * nothing - is pinned in ForcedSkillsTest.
 *
 * Adds a node it never saves, so the fixture's graph is left as found; the
 * one save it presses is the refused one.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

await page.getByRole('button', { name: /add node/i }).click();
await page.waitForTimeout(300);
await page.getByRole('menuitem', { name: /^llm agent$/i }).click();
await page.waitForTimeout(800);

const row = page.locator('#node-mapping-skillIds');
const offered = await row
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(offered, 'a new agent node offers a skillIds row beside its prompt');
if (!offered) await finish(browser);

record(
  (await row.getAttribute('placeholder')) === 'No skill is loaded by force',
  `the empty row says what empty means (${JSON.stringify(await row.getAttribute('placeholder'))})`,
);

/* Written, and wrong: the save is refused on this node, in words. */
await row.fill('zz-no-such-skill');
await page.waitForTimeout(300);
await page.getByRole('button', { name: /^save\b/i }).click();
await page.waitForTimeout(2500);
const said = await page.locator('[role=alert]').allTextContents().catch(() => []);
record(
  said.some((one) => one.includes('No skill in this workspace has the id "zz-no-such-skill"')),
  `an id that names no skill is refused at the save (${JSON.stringify(said).slice(0, 160)})`,
);

/*
 * Pointed at another node: the reference mode offers the trigger's fields,
 * and a reference is not checked here, because the run decides it.
 */
const modes = page.locator('[aria-label="Reference"], button:has-text("Reference")');
record((await modes.count()) > 0, 'the row can be pointed at another node, like the rest');

/* Left unsaved on purpose: closing the browser discards the node. */
page.on('dialog', (dialog) => void dialog.accept());
await finish(browser);
