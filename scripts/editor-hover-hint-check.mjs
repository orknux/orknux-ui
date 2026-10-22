/**
 * A line's and a joint's hint in the workflow editor is the application's own,
 * drawn beside the pointer, not the browser's native title.
 *
 * Reported: "the joint hint should be our own stylized, not native", and "also
 * add hint on hover".
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const PREFIX = 'zzHoverHint';
const { browser, page, graphql } = await open({ viewport: { width: 1400, height: 900 } });

const sweep = async () => {
  const { workspaceWorkflows } = await graphql(
    `query($w: ID!) { workspaceWorkflows(workspaceId: $w, page: 0, size: 200) { content { id name } } }`,
    { w: WORKSPACE },
  );
  for (const old of workspaceWorkflows.content.filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};
await sweep();

try {
  const WORKFLOW = (
    await graphql(`mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`, {
      input: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}` },
    })
  ).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    {
      w: WORKSPACE,
      f: WORKFLOW,
      input: {
        nodes: [
          { key: 'start', kind: 'TRIGGER', name: 'Start', x: 0, y: 0 },
          { key: 'make', kind: 'OBJECT', name: 'Make', x: 500, y: 250, mappings: [] },
        ],
        edges: [{ source: 'start', target: 'make' }],
      },
    },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.react-flow__node', { timeout: 30_000 });
  await drawn(page, 'the editor', { within: 30_000, still: 0 });
  await page.waitForTimeout(800);

  const titles = await page.evaluate(() => ({
    svg: document.querySelectorAll('path[data-edge-hit] title').length,
    points: [...document.querySelectorAll('[data-point]')].filter((one) => one.hasAttribute('title')).length,
  }));
  record(titles.svg === 0 && titles.points === 0, `no line or joint carries a native title (${JSON.stringify(titles)})`);

  // The middle of the line, as the pointer would find it.
  const hit = page.locator('path[data-edge-hit]').first();
  const middle = await hit.evaluate((path) => {
    const length = path.getTotalLength();
    const at = path.getPointAtLength(length * 0.3);
    const matrix = path.getScreenCTM();
    return { x: at.x * matrix.a + at.y * matrix.c + matrix.e, y: at.x * matrix.b + at.y * matrix.d + matrix.f };
  });
  await page.mouse.move(middle.x - 30, middle.y - 30);
  await page.mouse.move(middle.x, middle.y, { steps: 4 });
  const hint = page.locator('[data-hover-hint]');
  const appeared = await hint.waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
  const said = appeared ? ((await hint.textContent()) ?? '').trim() : '';
  record(appeared && /point|joint/i.test(said), `resting on a line shows the application's hint ("${said}")`);
  if (appeared) {
    const look = await hint.evaluate((box) => {
      const style = getComputedStyle(box);
      return { background: style.backgroundColor, radius: style.borderRadius, position: style.position };
    });
    record(look.position === 'fixed' && look.background !== 'rgba(0, 0, 0, 0)' && look.radius !== '0px', `drawn as a styled box beside the pointer (${JSON.stringify(look)})`);
  }
  await page.mouse.move(5, 5);
  await page.waitForTimeout(200);
  record((await hint.count()) === 0, 'and it goes when the pointer leaves');

  const point = page.locator('[data-point]').first();
  await point.hover();
  const onPoint = await hint.waitFor({ timeout: 2000 }).then(() => true).catch(() => false);
  record(onPoint && /drag/i.test((await hint.textContent()) ?? ''), `resting on a joint shows its hint too (${onPoint ? await hint.textContent() : 'none'})`);

  /*
   * A ghost joint on the line where one would go.
   *
   * Reported: "I want to show the icon on line where the joint would be
   * placed". Drawn on the line, under the pointer's nearest point of it, so
   * what a click or a double-click will put down is visible before it is put.
   */
  const ghost = page.locator('[data-joint-preview]');
  // A place `fraction` along the line, nudged off it by `off` screen pixels - still inside its hit stroke.
  const along = (fraction, off) =>
    hit.evaluate(
      (path, [fraction, off]) => {
        const at = path.getPointAtLength(path.getTotalLength() * fraction);
        const m = path.getScreenCTM();
        return { x: at.x * m.a + at.y * m.c + m.e + off, y: at.x * m.b + at.y * m.d + m.f + off };
      },
      [fraction, off],
    );
  // The point of the line nearest a place on the screen, on the screen.
  const nearest = (to) =>
    hit.evaluate((path, to) => {
      const m = path.getScreenCTM();
      const screen = (at) => ({ x: at.x * m.a + at.y * m.c + m.e, y: at.x * m.b + at.y * m.d + m.f });
      const length = path.getTotalLength();
      let best = null;
      for (let at = 0; at <= length; at += 0.25) {
        const on = screen(path.getPointAtLength(at));
        const away = Math.hypot(on.x - to.x, on.y - to.y);
        if (best === null || away < best.away) best = { ...on, away };
      }
      return best;
    }, to);
  const centreOf = async (locator) => {
    const box = await locator.boundingBox();
    return box === null ? null : { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  };
  const zoom = await page.evaluate(() => {
    const viewport = document.querySelector('.react-flow__viewport');
    return viewport === null ? null : new DOMMatrix(getComputedStyle(viewport).transform).a;
  });

  await page.mouse.move(5, 5);
  const first = await along(0.25, 4);
  await page.mouse.move(first.x, first.y, { steps: 4 });
  await page.waitForTimeout(150);
  const shownFirst = await ghost.count();
  const ghostFirst = shownFirst === 1 ? await centreOf(ghost) : null;
  const aimFirst = await nearest(first);
  const offFirst = ghostFirst === null ? Infinity : Math.hypot(ghostFirst.x - aimFirst.x, ghostFirst.y - aimFirst.y);
  record(
    shownFirst === 1 && offFirst <= 3,
    `resting on a line draws a ghost joint on it, under the pointer (${shownFirst} drawn, ${offFirst.toFixed(1)}px from the line's nearest point, zoom ${zoom?.toFixed(2)})`,
  );
  if (shownFirst === 1) {
    const events = await ghost.evaluate((one) => getComputedStyle(one).pointerEvents);
    record(events === 'none', `and it takes no pointer events (${events})`);
  }

  const second = await along(0.4, -3);
  await page.mouse.move(second.x, second.y, { steps: 6 });
  await page.waitForTimeout(150);
  const ghostSecond = (await ghost.count()) === 1 ? await centreOf(ghost) : null;
  const aimSecond = await nearest(second);
  const offSecond = ghostSecond === null ? Infinity : Math.hypot(ghostSecond.x - aimSecond.x, ghostSecond.y - aimSecond.y);
  const moved = ghostFirst === null || ghostSecond === null ? 0 : Math.hypot(ghostSecond.x - ghostFirst.x, ghostSecond.y - ghostFirst.y);
  record(offSecond <= 3 && moved > 10, `it follows the pointer along the line (${offSecond.toFixed(1)}px off, moved ${moved.toFixed(0)}px)`);

  await page.mouse.move(5, 5, { steps: 4 });
  await page.waitForTimeout(150);
  record((await ghost.count()) === 0, 'and it goes when the pointer leaves the line');

  // With the Joint tool on, one click puts the real joint exactly where the ghost was.
  await page.locator('.react-flow__pane').click({ position: { x: 20, y: 20 } });
  await page.keyboard.press('j');
  const third = await along(0.7, 4);
  await page.mouse.move(third.x, third.y, { steps: 4 });
  await page.waitForTimeout(150);
  const ghostThird = (await ghost.count()) === 1 ? await centreOf(ghost) : null;
  record(ghostThird !== null, 'with the Joint tool on the ghost is drawn too');
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(300);
  const joints = await page.evaluate(() =>
    [...document.querySelectorAll('button[data-point]')].map((one) => {
      const box = one.getBoundingClientRect();
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    }),
  );
  const landed = ghostThird === null ? Infinity : Math.min(...joints.map((one) => Math.hypot(one.x - ghostThird.x, one.y - ghostThird.y)));
  record(landed <= 3, `a click puts the real joint where the ghost was (${landed.toFixed(1)}px away)`);
  record((await ghost.count()) === 0, 'and leaves no ghost behind');
  await page.keyboard.press('j');
} finally {
  await sweep();
}

await finish(browser);
