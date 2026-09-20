/**
 * An image node's prompt survives being saved.
 *
 * This bug arrived three times. The panel drew the row, the value was typed,
 * the save reported it back, and reopening the page showed "this action takes
 * no parameters" - so every run skipped the node for having no prompt and the
 * graph looked like it went straight past it.
 *
 * Both halves are driven here because the fix has two, in two repositories: the
 * panel seeds the row whenever the node is opened rather than only when it is
 * made (a mapping with a blank expression does not survive a save, so the row
 * vanished the first time the graph was stored), and the server keeps what an
 * image node sends (`mappingsFor` handled every kind but this one, and an image
 * node fell through to the action branch, which reads an actionId it does not
 * have and kept nothing).
 *
 * Driven through the interface rather than against the API because the API half
 * has its own test: what was never covered is that the two agree - which is
 * exactly where it broke, twice with a green server suite.
 */
import { BASE, WORKSPACE, WORKFLOW, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const PROMPT = 'a hen in a hat, oil on canvas';
/** What this check's node answers with, kept off the name the fixture's uses. */
const OUTPUT = 'checkedImage';

await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, {
  waitUntil: 'domcontentloaded',
});
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

/* An image node of this check's own, so it cannot disturb the fixture's graph. */
await page.getByRole('button', { name: /add node/i }).click();
await page.waitForTimeout(300);
await page.getByRole('menuitem', { name: /^image model$/i }).click();
await page.waitForTimeout(800);

/*
 * Named apart from the one already on this graph.
 *
 * Both image nodes answer with `image` by default, and the save refuses a
 * graph where two nodes produce the same name - correctly, since a reference
 * to it could not say which was meant. Without this the save was rejected and
 * the check went on to read the *other* image node, which holds a reference
 * rather than a typed value, so it read an empty box and called the bug
 * unfixed.
 */
await page.locator('#node-output-name').fill(OUTPUT);
await page.waitForTimeout(300);

/*
 * The row's own box, by the id its label points at rather than by being the
 * first text box in the panel - the node's name is one too, and picking by
 * position finds that one.
 */
const box = page.locator('#node-mapping-prompt');
record((await box.count()) > 0, 'the panel offers the prompt row on a new image node');
await box.fill(PROMPT);
await page.waitForTimeout(300);

/*
 * By the start of its label, not the whole of it: the toolbar's buttons carry
 * their keystroke in the accessible name ("Save (Ctrl+S)"), so an anchored
 * match finds nothing.
 */
await page.getByRole('button', { name: /^save\b/i }).click();
await page.waitForTimeout(2500);

/*
 * The save has to have been accepted, or everything after this reads a graph
 * the server refused - which is how a rejected save first read as a lost
 * prompt.
 */
const refused = await page.locator('[role=alert]').allTextContents().catch(() => []);
record(refused.length === 0, `the graph saves (${JSON.stringify(refused).slice(0, 120)})`);

// Reopened from the server, which is where it went missing.
await page.reload({ waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ state: 'attached', timeout: 30_000 });
await page.waitForTimeout(1500);

// By what it answers with, which is this check's own: `/image/i` matched the
// graph's other image node, and read its empty reference box as a lost prompt.
await page.locator('.react-flow__node', { hasText: OUTPUT }).first().click();
await page.waitForTimeout(800);

const kept = await page.locator('#node-mapping-prompt').inputValue().catch(() => '');

record(kept === PROMPT, `the prompt is still there after a reload (${JSON.stringify(kept)})`);

/*
 * And the panel does not claim the node takes nothing. That sentence is what
 * somebody actually saw, and it is drawn from a different branch than the row
 * is - so a fix that seeds the row without the server keeping it shows the row
 * empty, while one that keeps it without seeding shows this line instead.
 */
const denial = await page.getByText(/takes no parameters/i).count();
record(denial === 0, 'and the panel does not say the node takes no parameters');

await finish(browser);
