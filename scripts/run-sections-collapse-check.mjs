/**
 * The run page's sections, folded to their headings and kept that way.
 *
 * A run page is a summary, a graph, a log and - with a step open - its input
 * and output, and which of those somebody wants depends on what they came for.
 * Each folds by a chevron at its heading, a real button with `aria-expanded` and
 * `aria-controls`, and stays folded for every run until it is opened again.
 *
 * What is checked is what is drawn rather than what the attributes say:
 *
 *  - each toggle is a button that says whether it is open and what it controls,
 *  - pressing it takes the section's body off the screen - nothing of it is
 *    drawn - while its heading, and the things beside the heading that still
 *    mean something folded (the graph's status, the log's download), stay,
 *  - the choice survives a reload,
 *  - and the graph comes back drawn. The canvas is unmounted while folded and
 *    mounts afresh on the way back, and a React Flow canvas that mounts without
 *    its measurements draws its boxes `visibility: hidden` and its lines
 *    nowhere (#235, #242, #259). So the boxes are counted as drawn with a size,
 *    the lines as paths with length, and the boxes as inside the canvas - a
 *    graph framed against a box of nothing lands off to one side.
 *
 * Needs one run with steps joined by a line, which it finds rather than
 * starts. Changes nothing but this browser's own storage, and unfolds
 * everything again before it finishes.
 */
import { BASE, WORKSPACE, open, record, selectNode, SHOT_DIR, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

const { workspaceExecutions } = await graphql(
  `query($id: ID!) { workspaceExecutions(workspaceId: $id, page: 0, size: 25) { content { id } } }`,
  { id: WORKSPACE },
);

let runId = null;
let runLines = 0;
for (const candidate of workspaceExecutions.content) {
  const { execution } = await graphql(
    `query($id: ID!) { execution(id: $id) { id steps { key } edges { source target } } }`,
    { id: candidate.id },
  );
  const steps = new Set((execution?.steps ?? []).map((step) => step.key));
  const drawable = (execution?.edges ?? []).filter((edge) => steps.has(edge.source) && steps.has(edge.target));
  if (drawable.length > 0) {
    runId = candidate.id;
    runLines = drawable.length;
    break;
  }
}

if (runId === null) {
  record(false, 'no run in this workspace joins two of its steps, so there is no graph to fold');
  await finish(browser);
}

const where = `${BASE}/workspace/${WORKSPACE}/executions/${runId}`;

/* ------------------------------------------------------------------- tools */

/** The page's sections: the body each toggle controls, and something only that body draws. */
const SECTIONS = [
  { name: 'summary', body: 'run-summary', inside: 'dl' },
  { name: 'graph', body: 'run-graph-section', inside: '.react-flow' },
  { name: 'log', body: 'run-logs-section', inside: '#run-logs' },
];

const toggle = (body) => page.locator(`button[aria-controls="${body}"]`);

/**
 * How much of a section's body is on the screen: the largest box drawn by
 * anything inside it, so a body that is merely `display: contents` while open
 * still measures as what it holds.
 */
const drawnHeight = (body, inside) =>
  page.evaluate(
    ([id, selector]) => {
      const held = document.getElementById(id);
      if (held === null) return -1;
      const own = held.getBoundingClientRect().height;
      const within = [...held.querySelectorAll(selector)].map((one) => one.getBoundingClientRect().height);
      return Math.round(Math.max(own, 0, ...within));
    },
    [body, inside],
  );

/** What the graph draws: boxes with a size, lines with a length, and whether they sit in the canvas. */
const graphDrawing = () =>
  page.evaluate(() => {
    const canvas = document.querySelector('.react-flow')?.getBoundingClientRect() ?? null;
    const nodes = [...document.querySelectorAll('.react-flow__node')];
    const sized = nodes.filter((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && getComputedStyle(node).visibility !== 'hidden';
    });
    const inside =
      canvas === null
        ? 0
        : sized.filter((node) => {
            const box = node.getBoundingClientRect();
            const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
            return (
              middle.x >= canvas.left && middle.x <= canvas.right && middle.y >= canvas.top && middle.y <= canvas.bottom
            );
          });
    const lines = [...document.querySelectorAll('.react-flow__edge-path')].filter((path) => {
      try {
        return path.getTotalLength() > 1;
      } catch {
        return false;
      }
    });
    return {
      canvas: canvas === null ? 0 : Math.round(canvas.height),
      nodes: nodes.length,
      sized: sized.length,
      inside: inside.length,
      lines: lines.length,
    };
  });

async function land() {
  await page.goto(where, { waitUntil: 'domcontentloaded' });
  await page.locator('h2').filter({ hasText: /Logs|Dziennik/ }).first().waitFor({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

/* Starts from a browser that has folded nothing, whatever ran before it. */
await page.goto(where, { waitUntil: 'domcontentloaded' });
await page.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('orknux.fold.')) window.localStorage.removeItem(key);
  }
});
await land();

/* ------------------------------------------------------------- the toggles */

for (const section of SECTIONS) {
  const button = toggle(section.body);
  const found = (await button.count()) === 1;
  record(found, `the ${section.name} has one toggle at its heading that controls its body`);
  if (!found) continue;
  const said = {
    expanded: await button.getAttribute('aria-expanded'),
    tag: await button.evaluate((one) => one.tagName),
    inHeading: await button.evaluate((one) => one.closest('h2') !== null),
  };
  record(
    said.expanded === 'true' && said.tag === 'BUTTON' && said.inHeading,
    `the ${section.name}'s toggle is a button in its heading, and says it is open (${JSON.stringify(said)})`,
  );
  const opened = await drawnHeight(section.body, section.inside);
  console.log(`${section.name}: body drawn ${opened}px tall while open`);
  record(opened > 20, `the ${section.name} is drawn while open`);
}

if (!(await toggle('run-graph-section').count())) await finish(browser);

const before = await graphDrawing();
console.log(`graph on arrival: ${JSON.stringify(before)}, the run joins ${runLines}`);

/* ----------------------------------------------------- folded, by keyboard */

/*
 * The summary by Enter on a focused toggle, so the keyboard is the way at least
 * one of them is driven; the other two by a click.
 */
await toggle('run-summary').focus();
await page.keyboard.press('Enter');
await toggle('run-graph-section').click();
await toggle('run-logs-section').click();
await page.waitForTimeout(400);

for (const section of SECTIONS) {
  const height = await drawnHeight(section.body, section.inside);
  const expanded = await toggle(section.body).getAttribute('aria-expanded');
  console.log(`${section.name}: folded, body drawn ${height}px, aria-expanded ${expanded}`);
  record(height === 0 && expanded === 'false', `folded, the ${section.name}'s body is not drawn and its toggle says so`);
  record(await toggle(section.body).isVisible(), `folded, the ${section.name}'s heading is still there to unfold it from`);
}

record((await page.locator('.react-flow__node').count()) === 0, 'folded, the graph draws no boxes at all');
record(
  await page.getByRole('button', { name: /Download logs|Pobierz dziennik/ }).isVisible(),
  'folded, the log can still be downloaded from its heading',
);

await page.screenshot({ path: `${SHOT_DIR}/run-sections-folded.png` });

/* ------------------------------------------------------------- the reload */

await land();
for (const section of SECTIONS) {
  const height = await drawnHeight(section.body, section.inside);
  const expanded = await toggle(section.body).getAttribute('aria-expanded');
  console.log(`${section.name}: after a reload, body drawn ${height}px, aria-expanded ${expanded}`);
  record(height === 0 && expanded === 'false', `the ${section.name} is still folded after a reload`);
}

/* ------------------------------------------------- the graph, unfolded */

await toggle('run-graph-section').click();
await page.locator('.react-flow__node').first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {});
await page.waitForTimeout(800);
const after = await graphDrawing();
console.log(`graph unfolded: ${JSON.stringify(after)}`);
record(after.canvas > 100, `unfolded, the canvas has its height back (${after.canvas}px)`);
record(
  after.nodes > 0 && after.sized === after.nodes,
  `unfolded, every box is drawn with a size (${after.sized} of ${after.nodes})`,
);
record(after.inside === after.sized && after.sized > 0, `and every box sits inside the canvas (${after.inside} of ${after.sized})`);
record(after.lines >= runLines, `and every line is drawn with length (${after.lines} for ${runLines} joins)`);
record(
  (await toggle('run-summary').getAttribute('aria-expanded')) === 'false' &&
    (await toggle('run-logs-section').getAttribute('aria-expanded')) === 'false',
  'unfolding the graph leaves the summary and the log as they were',
);

/* --------------------------------------------- the node rail's payloads */

const node = page.locator('.react-flow__node').first();
if (await selectNode(page, node, 'a step on the run graph')) {
  for (const payload of [
    { name: 'input', body: 'run-step-input' },
    { name: 'output', body: 'run-step-output' },
  ]) {
    const button = toggle(payload.body);
    const there = (await button.count()) === 1;
    record(there, `the step's ${payload.name} has a toggle at its heading`);
    if (!there) continue;
    const opened = await drawnHeight(payload.body, 'pre');
    await button.click();
    await page.waitForTimeout(200);
    const folded = await drawnHeight(payload.body, 'pre');
    console.log(`${payload.name}: ${opened}px open, ${folded}px folded`);
    record(opened > 0 && folded === 0, `the step's ${payload.name} folds to its heading`);
  }
}

/* Unfolded again, so this browser opens the run page as everybody else does. */
await page.evaluate(() => {
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith('orknux.fold.')) window.localStorage.removeItem(key);
  }
});

await finish(browser);
