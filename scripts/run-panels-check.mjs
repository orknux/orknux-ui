/**
 * The run detail's three panels, dragged.
 *
 * A run page is three windows onto things much bigger than the window: the
 * graph in 332px, the log in 340px with lines long enough to need all of it, and
 * the node rail in 390px holding a step's JSON and a picture it drew. All three
 * can be dragged now - the graph and the log by their bottom edge, the rail by
 * its left edge - and this drives each one and checks the four things that can
 * go wrong:
 *
 *  - the panel actually changes size, and for the rail the main column gives way
 *    rather than the page growing a horizontal scrollbar,
 *  - the floor and the ceiling hold, so a panel cannot be dragged to nothing or
 *    past the screen,
 *  - each size survives a reload, per panel, because it is meant to be a
 *    preference and not a gesture,
 *  - the handles answer the keyboard, for somebody who cannot hold a pointer
 *    down.
 *
 * The graph is the one with something underneath it: React Flow does not read
 * its size from the DOM on its own schedule fast enough to be trusted, so what
 * is measured is that the flow's own pane is the size of the box after the drag
 * rather than the size it was before - a clipped graph is the bug whether or not
 * the frame after it recovers.
 */
import { BASE, WORKSPACE, open, record, selectNode, SHOT_DIR, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

/* ----------------------------------------------------------------- fixture */

/**
 * A run whose graph has something in it.
 *
 * A run with no steps draws a sentence instead of a canvas, and there would be
 * no graph handle to take hold of and no node to open the rail with.
 */
const { workspaceExecutions } = await graphql(
  `query($id: ID!) { workspaceExecutions(workspaceId: $id, page: 0, size: 25) { content { id } } }`,
  { id: WORKSPACE },
);

let runId = null;
for (const candidate of workspaceExecutions.content) {
  const { execution } = await graphql(`query($id: ID!) { execution(id: $id) { id steps { key } } }`, {
    id: candidate.id,
  });
  if ((execution?.steps ?? []).length > 0) {
    runId = candidate.id;
    break;
  }
}

if (runId === null) {
  record(false, 'no run in this workspace recorded any steps, so there is no graph to drag');
  await finish(browser);
}

const where = `${BASE}/workspace/${WORKSPACE}/executions/${runId}`;

/* ------------------------------------------------------------------- tools */

const graphHandle = page.locator('[role="separator"][aria-controls="run-graph"]');
const logsHandle = page.locator('[role="separator"][aria-controls="run-logs"]');
const railHandle = page.locator('[role="separator"][aria-controls="run-node-details"]');

/** The drawn size of one of the three, or null while it is not on the page. */
async function sizeOf(id, side) {
  return page.evaluate(
    ([held, which]) => {
      const box = document.getElementById(held)?.getBoundingClientRect();
      return box === undefined ? null : Math.round(which === 'height' ? box.height : box.width);
    },
    [id, side],
  );
}

/**
 * Drags a handle by `by` pixels along the axis it moves.
 *
 * Scrolled to first: making the graph taller pushes the log's handle towards the
 * fold, and a drag that begins at a point below the window begins nowhere. In
 * steps, so the page sees a drag rather than a teleport and anything that only
 * redraws on `pointermove` is actually exercised.
 */
async function drag(handle, by, axis = 'y') {
  await handle.scrollIntoViewIfNeeded();
  const box = await handle.boundingBox();
  /*
   * Pressed in the middle of the part of the handle that is on the screen, not
   * the middle of the handle.
   *
   * The rail's handle runs the whole height of the row, and by the time the graph
   * and the log have been dragged taller that row is half again the window: its
   * own middle is hundreds of pixels below the fold, and a press there is a press
   * at a point the mouse cannot be put.
   */
  const view = page.viewportSize();
  const middle = (low, high, size) => (Math.max(low, 8) + Math.min(low + size, high - 8)) / 2;
  const from = {
    x: middle(box.x, view.width, box.width),
    y: middle(box.y, view.height, box.height),
  };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  const to = axis === 'y' ? { x: from.x, y: from.y + by } : { x: from.x + by, y: from.y };
  await page.mouse.move(to.x, to.y, { steps: 20 });
  await page.mouse.up();
  await page.waitForTimeout(350);
}

async function land() {
  await page.goto(where, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.waitForTimeout(1200);
}

await land();

/* -------------------------------------------------------- the graph's height */

const graphOpened = await sizeOf('run-graph', 'height');
await drag(graphHandle, 260);
const graphTaller = await sizeOf('run-graph', 'height');
console.log(`graph: opened ${graphOpened}, dragged to ${graphTaller}`);
record(graphTaller > graphOpened + 200, 'the graph card is dragged taller by its bottom edge');

/*
 * And the graph inside it followed. React Flow fills the box it is given, so the
 * pane being the height of the box is the whole of "not clipped"; the page's own
 * ResizeObserver is what reframes the picture into it.
 */
const pane = await page.evaluate(() => {
  const box = document.querySelector('.react-flow')?.getBoundingClientRect();
  return box === undefined ? null : Math.round(box.height);
});
console.log(`react-flow pane: ${pane} against a card of ${graphTaller}`);
record(pane !== null && Math.abs(pane - graphTaller) <= 4, 'the graph fills the height it was dragged to');

/* Dragged to nothing, which the floor refuses. */
await drag(graphHandle, -2000);
const graphFloor = await sizeOf('run-graph', 'height');
const said = {
  min: Number(await graphHandle.getAttribute('aria-valuemin')),
  max: Number(await graphHandle.getAttribute('aria-valuemax')),
  now: Number(await graphHandle.getAttribute('aria-valuenow')),
};
console.log(`graph floor: ${graphFloor}, and the handle says min ${said.min} now ${said.now} max ${said.max}`);
record(graphFloor === said.min && graphFloor > 0, 'the graph stops at its floor rather than at nothing');

/* And past the bottom of the screen, which the ceiling refuses. */
await drag(graphHandle, 3000);
const graphCeiling = await sizeOf('run-graph', 'height');
console.log(`graph ceiling: ${graphCeiling} against a window of 1000 and a stated max of ${said.max}`);
record(graphCeiling === said.max && graphCeiling < 1000, 'the graph stops short of the window rather than running past it');

/* --------------------------------------------------------- the log's height */

const logsOpened = await sizeOf('run-logs', 'height');
await drag(logsHandle, 240);
const logsTaller = await sizeOf('run-logs', 'height');
console.log(`log: opened ${logsOpened}, dragged to ${logsTaller}`);
record(logsTaller > logsOpened + 180, 'the log is dragged taller by its bottom edge');
/* One panel at a time: making the log tall must not have moved the graph. */
record((await sizeOf('run-graph', 'height')) === graphCeiling, 'dragging the log leaves the graph where it was');

await page.screenshot({ path: `${SHOT_DIR}/run-panels-dragged.png` });

/* ----------------------------------------------------------- the node rail */

const node = page.locator('.react-flow__node').first();
if (!(await selectNode(page, node, 'a step on the run graph'))) await finish(browser);
await railHandle.waitFor({ state: 'visible', timeout: 10_000 });
await page.waitForTimeout(400);

const railOpened = await sizeOf('run-node-details', 'width');
const columnOpened = await sizeOf('run-graph', 'width');
await drag(railHandle, -180, 'x');
const railWider = await sizeOf('run-node-details', 'width');
const columnNarrower = await sizeOf('run-graph', 'width');
console.log(`rail: ${railOpened} -> ${railWider}, column beside it ${columnOpened} -> ${columnNarrower}`);
record(railWider > railOpened + 140, 'the rail is dragged wider by its left edge');
record(columnNarrower < columnOpened - 140, 'the main column gives way rather than the page growing wider');

/* The page itself did not grow: a rail that widens by scrolling the page is not what was asked for. */
const overflowed = await page.evaluate(
  () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
);
record(!overflowed, 'nothing runs off the side of the page');

/* And the rail has a floor too. */
await drag(railHandle, 900, 'x');
const railFloor = await sizeOf('run-node-details', 'width');
const railMin = Number(await railHandle.getAttribute('aria-valuemin'));
console.log(`rail floor: ${railFloor}, stated min ${railMin}`);
record(railFloor === railMin, 'the rail stops at its floor rather than closing');
await drag(railHandle, -180, 'x');
const railKept = await sizeOf('run-node-details', 'width');

/* -------------------------------------------------------------- the reload */

const stored = await page.evaluate(() => ({
  graph: window.localStorage.getItem('orknux.run.graph-height'),
  logs: window.localStorage.getItem('orknux.run.logs-height'),
  rail: window.localStorage.getItem('orknux.run.panel-width'),
}));
console.log(`stored: graph ${stored.graph}, logs ${stored.logs}, rail ${stored.rail}`);

await land();
const reloaded = {
  graph: await sizeOf('run-graph', 'height'),
  logs: await sizeOf('run-logs', 'height'),
};
console.log(`reloaded: graph ${reloaded.graph} (was ${graphCeiling}), log ${reloaded.logs} (was ${logsTaller})`);
record(
  reloaded.graph === graphCeiling && reloaded.logs === logsTaller,
  'the graph and the log open at the sizes they were dragged to',
);

/* The rail is only on the page with a node open, so it is opened again to read. */
if (!(await selectNode(page, page.locator('.react-flow__node').first(), 'a step, again'))) await finish(browser);
await railHandle.waitFor({ state: 'visible', timeout: 10_000 });
const railReloaded = await sizeOf('run-node-details', 'width');
console.log(`reloaded: rail ${railReloaded} (was ${railKept})`);
record(Math.abs(railReloaded - railKept) <= 2, 'the rail opens at the width it was dragged to');

/* ------------------------------------------------------------ the keyboard */

await graphHandle.scrollIntoViewIfNeeded();
await graphHandle.focus();
const focused = await page.evaluate(() => ({
  role: document.activeElement?.getAttribute('role'),
  label: document.activeElement?.getAttribute('aria-label'),
  controls: document.activeElement?.getAttribute('aria-controls'),
}));
console.log(`focused: role ${focused.role}, labelled "${focused.label}", controls ${focused.controls}`);
record(
  focused.role === 'separator' && focused.controls === 'run-graph' && (focused.label ?? '') !== '',
  'the graph handle takes focus as a labelled separator',
);

const beforeKeys = await sizeOf('run-graph', 'height');
for (let press = 0; press < 4; press += 1) await page.keyboard.press('ArrowUp');
await page.waitForTimeout(300);
const afterKeys = await sizeOf('run-graph', 'height');
console.log(`arrows: ${beforeKeys} -> ${afterKeys}`);
record(afterKeys < beforeKeys - 60, 'arrow keys resize the graph');

/* Escape puts it back where the page opens, which is the way out of a bad drag. */
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
const reset = await sizeOf('run-graph', 'height');
console.log(`after Escape: ${reset}`);
record(reset === 332, 'Escape puts the graph back to the height the page opens at');

await finish(browser);
