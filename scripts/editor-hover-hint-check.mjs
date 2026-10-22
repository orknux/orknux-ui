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
} finally {
  await sweep();
}

await finish(browser);
