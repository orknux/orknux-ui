/**
 * An arrow's ends can be pinned to a side of their box, and dragged to another.
 *
 * A line used to float: each end found the side of its box facing the other,
 * wherever the boxes were. Now an end can be pinned to a side - it leaves there
 * and stays there - and an end dragged onto another box re-points the line to
 * it. This measures what the server keeps and what the canvas draws: a pinned
 * end leaves from the pinned side, not the side facing the other box; each end
 * of a line a person points at or selects has a grip that can be seen; and a
 * grip dragged moves its end - the start as well as the end - to another side
 * or another box.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const NAME = `zzAttach ${Date.now()}`;

const id = (
  await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
    w: WORKSPACE,
    n: NAME,
    d: JSON.stringify({
      nodes: [
        { id: 'a', kind: 'box', label: 'first', x: 0, y: 0, w: 160, h: 60 },
        { id: 'b', kind: 'box', label: 'second', x: 360, y: 260, w: 160, h: 60 },
        { id: 'c', kind: 'box', label: 'third', x: 360, y: 0, w: 160, h: 60 },
      ],
      // Pinned to the top of a and the bottom of b, where a floating line would take neither.
      edges: [{ id: 'e', from: 'a', to: 'b', kind: 'arrow', fromSide: 'top', toSide: 'bottom' }],
    }),
  })
).createDiagram.id;

const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const edgeOf = (drawing) => drawing.edges.find((one) => one.id === 'e');
const waitSaved = () => page.waitForTimeout(2500);

try {
  // The server keeps the pinned sides through its edge rows, its document and back.
  const first = edgeOf(await stored());
  record(first?.fromSide === 'top' && first?.toSide === 'bottom', `the pinned sides are kept (${first?.fromSide}, ${first?.toSide})`);

  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="a"]').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  // The line leaves the top of a, where it is pinned - a floating end would leave the
  // side facing b, well below the top - so its start sits near a's top-centre in the
  // drawing's own coordinates (a is 160 by 60 at the origin: top-centre is 80, 0).
  const d = await page.locator('.react-flow__edge[data-id="e"] path.react-flow__edge-path').getAttribute('d');
  const start = /M\s*([\d.-]+)[\s,]+([\d.-]+)/.exec(d ?? '');
  const sy = start === null ? NaN : Number(start[2]);
  record(Number.isFinite(sy) && sy < 20, `the pinned end leaves the top of its box (y=${Number.isFinite(sy) ? Math.round(sy) : 'none'} in the drawing)`);

  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') {
    await page.getByTestId('diagram-mode-edit').click();
  }

  /*
   * An end is taken hold of by a grip, and the grip has to be there to be seen.
   * React Flow's own reconnect anchors were what moved an end before, and they
   * draw nothing, lie under the boxes - so at a line's end the pointer met the
   * handle a new line starts from - and the one for a floating end sits at its
   * box's first handle rather than on the line. A person found no way to move
   * a line's start at all, and its end only by knowing where to press. So this
   * measures the grips where a person looks for them: drawn, on the line's own
   * two ends, on top of whatever else is there, and saying "drag" by the cursor.
   */
  const grip = (end) => page.locator(`[data-testid="diagram-end-${end}"][data-edge="e"]`);
  const middleOf = async (locator) => {
    const box = await locator.boundingBox().catch(() => null);
    return box === null ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2, w: box.width, h: box.height };
  };
  // The line as it is drawn: where it starts, its middle and where it ends, on the screen.
  const drawn = () =>
    page.evaluate(() => {
      const path = document.querySelector('.react-flow__edge[data-id="e"] path.react-flow__edge-path');
      const m = path.getScreenCTM();
      const at = (length) => {
        const p = path.getPointAtLength(length);
        return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
      };
      const total = path.getTotalLength();
      return { start: at(0), middle: at(total / 2), end: at(total) };
    });
  // A point of the drawing on the screen, worked out from where the first box is drawn (160 wide at the origin).
  const screenOf = async (fx, fy) => {
    const box = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
    const zoom = box.width / 160;
    return { x: box.x + fx * zoom, y: box.y + fy * zoom };
  };
  const within = (one, two, by) => one !== null && Math.hypot(one.x - two.x, one.y - two.y) <= by;

  // Nothing selected and the pointer elsewhere: a canvas of lines is not a canvas of dots.
  const aside = await screenOf(40, 420);
  await page.mouse.click(aside.x, aside.y);
  await page.waitForTimeout(200);
  const mark = (end) => page.locator(`[data-testid="diagram-end-mark-${end}"][data-edge="e"]`);
  record(
    (await grip('from').count()) === 0 && (await grip('to').count()) === 0 && (await mark('from').count()) === 0 && (await mark('to').count()) === 0,
    'a line left alone draws no grips, and no marks',
  );

  /*
   * A selected box lights its lines, in the colour the box itself is outlined
   * in - so the one place a lit line could not be followed was where it met
   * that outline. Each end of a lit line is marked, over the boxes. A mark and
   * not a grip: this line leaves the top handle of its box, and a selected box
   * has to go on offering that handle to draw a new line from.
   */
  const inA = await screenOf(20, 48);
  await page.mouse.click(inA.x, inA.y);
  await page.mouse.move(aside.x, aside.y, { steps: 4 });
  await page.waitForTimeout(250);
  let lit = await drawn();
  const markStart = await middleOf(mark('from'));
  const markEnd = await middleOf(mark('to'));
  record(
    within(markStart, lit.start, 2.5) && within(markEnd, lit.end, 2.5),
    `a selected box's line is marked where it is attached, at both ends (${markStart === null ? 'none' : Math.round(Math.hypot(markStart.x - lit.start.x, markStart.y - lit.start.y))}px and ${markEnd === null ? 'none' : Math.round(Math.hypot(markEnd.x - lit.end.x, markEnd.y - lit.end.y))}px off)`,
  );
  record(markStart !== null && Math.min(markStart.w, markStart.h) >= 9, `a mark is big enough to see (${markStart === null ? 'none' : Math.round(markStart.w)}px)`);
  // Drawn over the box - and a selected box is raised above everything else on the canvas, so under it half of a mark was not drawn at all.
  const stack = markStart === null ? null : await page.evaluate(() => ({
    mark: Number(getComputedStyle(document.querySelector('[data-testid="diagram-end-mark-from"][data-edge="e"]')).zIndex),
    box: Number(getComputedStyle(document.querySelector('.react-flow__node[data-id="a"]')).zIndex),
  }));
  record(stack !== null && stack.mark > stack.box, `and it is drawn over the selected box it is on (${stack === null ? 'none' : `${stack.mark} over ${stack.box}`})`);
  const under = markStart === null ? 'nothing' : await page.evaluate((at) => document.elementFromPoint(at.x, at.y)?.className?.toString() ?? 'nothing', markStart);
  record(/handle/i.test(under) && (await grip('from').count()) === 0, `the box's handle under a mark is still what the pointer meets, and no grip is in its way (${under.slice(0, 60)})`);
  await page.screenshot({ path: '/tmp/look/attach-marks.png' });
  // Pointed at, a lit line trades its marks for grips, and they too are over the selected box.
  await page.mouse.move(lit.middle.x, lit.middle.y, { steps: 4 });
  await page.waitForTimeout(250);
  const litGrip = await middleOf(grip('from'));
  const onTop = litGrip === null ? 'nothing' : await page.evaluate((at) => document.elementFromPoint(at.x, at.y)?.getAttribute('data-testid') ?? 'something else', litGrip);
  record(onTop === 'diagram-end-from' && (await mark('from').count()) === 0, `pointed at, the line of a selected box has grips instead, over the box (${onTop})`);
  await page.mouse.move(aside.x, aside.y, { steps: 4 });
  await page.mouse.click(aside.x, aside.y);
  await page.waitForTimeout(200);
  record((await mark('from').count()) === 0, 'and the marks go with the selection');

  // The pointer on the line is enough to show them.
  let line = await drawn();
  await page.mouse.move(line.middle.x, line.middle.y, { steps: 4 });
  await page.waitForTimeout(250);
  record((await grip('from').count()) === 1 && (await grip('to').count()) === 1, `the pointer on a line shows a grip on each end (${await grip('from').count()}, ${await grip('to').count()})`);

  // And selecting it keeps them, wherever the pointer goes next.
  await page.mouse.click(line.middle.x, line.middle.y);
  await page.mouse.move(aside.x, aside.y, { steps: 4 });
  await page.waitForTimeout(250);
  line = await drawn();
  const atStart = await middleOf(grip('from'));
  const atEnd = await middleOf(grip('to'));
  record(
    within(atStart, line.start, 2.5) && within(atEnd, line.end, 2.5),
    `a selected line has a grip on its start and on its end, where the line is drawn (${atStart === null ? 'none' : Math.round(Math.hypot(atStart.x - line.start.x, atStart.y - line.start.y))}px and ${atEnd === null ? 'none' : Math.round(Math.hypot(atEnd.x - line.end.x, atEnd.y - line.end.y))}px off)`,
  );
  record(atStart !== null && atEnd !== null && Math.min(atStart.w, atStart.h, atEnd.w, atEnd.h) >= 12, `a grip is big enough to see and to hit (${atStart === null ? 'none' : Math.round(atStart.w)}px)`);
  // On top: this line starts at the top handle of its box, and it is the grip the pointer has to meet there.
  const met = await page.evaluate(
    ({ a, b }) => [a, b].map((at) => (at === null ? 'nothing' : (document.elementFromPoint(at.x, at.y)?.getAttribute('data-testid') ?? document.elementFromPoint(at.x, at.y)?.className?.toString() ?? 'nothing'))),
    { a: atStart, b: atEnd },
  );
  record(met[0] === 'diagram-end-from' && met[1] === 'diagram-end-to', `the grips are what the pointer meets at the line's ends, over the boxes (${met.join(', ')})`);
  const cursor = (await grip('from').count()) === 0 ? 'none' : await grip('from').evaluate((element) => getComputedStyle(element).cursor);
  const filled = (await grip('from').count()) === 0 ? 'none' : await grip('from').evaluate((element) => getComputedStyle(element).backgroundColor);
  record(cursor === 'grab', `a grip says it is dragged by its cursor (${cursor})`);
  record(filled !== 'none' && filled !== 'rgba(0, 0, 0, 0)' && filled !== 'transparent', `and it is drawn, not only there (${filled})`);

  /** Drags one end's grip to a point on the screen; [during] is asked while it is held there. */
  async function drag(end, to, during) {
    if ((await grip(end).count()) === 0) {
      const now = await drawn();
      await page.mouse.click(now.middle.x, now.middle.y);
      await page.waitForTimeout(200);
    }
    const from = await middleOf(grip(end));
    if (from === null) return false;
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.waitForTimeout(120);
    if (during !== undefined) await during();
    await page.mouse.up();
    await waitSaved();
    return true;
  }
  const point = (box, across, down) => ({ x: box.x + box.width * across, y: box.y + box.height * down });
  const boxOf = (node) => page.locator(`.react-flow__node[data-id="${node}"]`).boundingBox();

  // The end dragged onto another box re-points the line there; on the box's middle it floats (no side).
  let shown = { aim: 0, landing: 0 };
  await drag('to', point(await boxOf('c'), 0.5, 0.5), async () => {
    shown = { aim: await page.getByTestId('diagram-end-aim').count(), landing: await page.getByTestId('diagram-end-landing').count() };
  });
  record(shown.aim === 1 && shown.landing === 1, `an end being dragged shows where it would land (line ${shown.aim}, mark ${shown.landing})`);
  const moved = edgeOf(await stored());
  record(moved?.to === 'c', `an end dragged onto another box re-points the line to it (to=${moved?.to})`);
  record(moved?.toSide === undefined, `and dropping it on the box's middle floats that end again (toSide=${moved?.toSide ?? 'none'})`);

  // Dropped on a side of a box - anywhere on it, not only the tiny centre handle - the end pins
  // to the side it fell toward. Onto b's left at a third of its height: between the side handles,
  // where capturing only an exact handle hit left the end floating.
  await drag('to', point(await boxOf('b'), 0.15, 0.4));
  const pinned = edgeOf(await stored());
  record(
    pinned?.to === 'b' && pinned?.toSide === 'left',
    `an end dropped on a box's side pins there, anywhere on the side (to=${pinned?.to}, toSide=${pinned?.toSide ?? 'none'})`,
  );

  // The start is an end too. Pinned to its box's top, it is dragged to the same box's right side...
  await drag('from', point(await boxOf('a'), 0.9, 0.5));
  const turned = edgeOf(await stored());
  record(
    turned?.from === 'a' && turned?.fromSide === 'right',
    `a line's start dragged to another side of its box pins there (from=${turned?.from}, fromSide=${turned?.fromSide ?? 'none'})`,
  );
  line = await drawn();
  const right = await screenOf(160, 30);
  record(within(line.start, right, 3), `and the line is drawn leaving from there (${Math.round(Math.hypot(line.start.x - right.x, line.start.y - right.y))}px off the middle of that side)`);
  // ...and onto another box, which re-points the line's start and leaves its end where it was.
  await drag('from', point(await boxOf('c'), 0.5, 0.9));
  const started = edgeOf(await stored());
  record(
    started?.from === 'c' && started?.fromSide === 'bottom' && started?.to === 'b' && started?.toSide === 'left',
    `a line's start dragged onto another box starts there, and its end is untouched (from=${started?.from}/${started?.fromSide ?? 'none'}, to=${started?.to}/${started?.toSide ?? 'none'})`,
  );

  // Let go of over empty canvas, or pressed and not moved, an end stays exactly as it was.
  await drag('from', aside);
  const held = await middleOf(grip('to'));
  if (held !== null) await page.mouse.click(held.x, held.y);
  await waitSaved();
  const kept = edgeOf(await stored());
  record(
    kept?.from === 'c' && kept?.fromSide === 'bottom' && kept?.to === 'b' && kept?.toSide === 'left',
    `an end dropped on empty canvas, or only clicked, is left as it was (from=${kept?.from}/${kept?.fromSide ?? 'none'}, to=${kept?.to}/${kept?.toSide ?? 'none'})`,
  );
  await page.screenshot({ path: '/tmp/look/attach-grips.png' }).catch(() => undefined);

  // Viewing changes nothing, so it offers nothing to drag.
  await page.getByTestId('diagram-mode-view').click();
  line = await drawn();
  await page.mouse.click(line.middle.x, line.middle.y);
  await page.waitForTimeout(250);
  record((await grip('from').count()) === 0 && (await grip('to').count()) === 0, 'a diagram being viewed draws no grips');
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
  // A deleted diagram is kept in the workspace's bin now, and a check's own is nobody's to restore.
  const kept = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id kind name } } }', { w: WORKSPACE })
    .then((data) => data.recycleBin.content)
    .catch(() => []);
  for (const entry of kept.filter((one) => one.kind === 'DIAGRAM' && one.name === NAME)) {
    await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
  }
}

await finish(browser);
