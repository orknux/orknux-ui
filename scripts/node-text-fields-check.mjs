/**
 * A node's written values are typed where they are, and read as what they are.
 *
 * Five things, each asserted on its own:
 *
 *   1. The description and every written value are textareas dragged taller by
 *      their corner - no Expand, no box opened somewhere else - and dragging
 *      one never pushes the panel sideways.
 *   2. Typing `{{` in a value offers the fields that could fill it; Enter puts
 *      `{{ field }}` in at the caret, Escape puts the list away, and the focus
 *      never leaves the field.
 *   3. A placeholder is lit as it is typed: in the reference green when the
 *      graph answers it, in the error red when nothing does - and the layer
 *      drawing that lies exactly under the text, scrolled with it.
 *   4. A `{{field}}` written in a value draws the dependency line from the node
 *      producing the field, as a reference would.
 *   5. The lines a run travels move; a dependency line is still. And for
 *      somebody who asked for less motion, nothing moves.
 *
 * Makes a scheduled trigger carrying `user`, a function, an action and a
 * workflow - the trigger wired to the action, and an object node wired to
 * nothing - and removes them.
 */
import { BASE, WORKSPACE, open, drawn, record, finish, selectNode } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const STAMP = Date.now();
const made = { workflowId: null, functionId: null, actionId: null, triggerId: null };

try {
  made.triggerId = (await graphql(
    `mutation($input: CreateTriggerInput!) { createTrigger(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `zz text fields clock ${STAMP}`, type: 'SCHEDULED', cron: '0 2 * * *', payload: '{"user":"alice"}' } },
  )).createTrigger.id;
  const fname = `zzTextFields${STAMP}`;
  made.functionId = (await graphql(
    `mutation($input: CreateFunctionInput!) { createFunction(input: $input) { id } }`,
    { input: {
      workspaceId: WORKSPACE, name: fname, returnType: 'STRING', params: [{ name: 'order', type: 'STRING' }],
      typescript: `export default function ${fname}(order: string): string {\n  return order;\n}\n`,
      source: `export default function ${fname}(order) {\n  return order;\n}\n`,
    } },
  )).createFunction.id;
  made.actionId = (await graphql(
    `mutation($input: CreateActionInput!) { createAction(input: $input) { id } }`,
    { input: { workspaceId: WORKSPACE, name: `Text fields ${STAMP}`, type: 'EXECUTE', subtype: 'FUNCTION', functionId: made.functionId } },
  )).createAction.id;
  made.workflowId = (await graphql(
    `mutation($input: CreateWorkflowInput!) { createWorkflow(input: $input) { workflowId } }`,
    { input: { workspaceId: WORKSPACE, name: `zz text fields ${STAMP}` } },
  )).createWorkflow.workflowId;
  await graphql(
    `mutation($w: ID!, $f: ID!, $input: WorkflowGraphInput!) { saveWorkflowGraph(workspaceId: $w, workflowId: $f, input: $input) { workflowId } }`,
    { w: WORKSPACE, f: made.workflowId, input: {
      nodes: [
        { key: 'clock', kind: 'TRIGGER', name: 'Nightly', triggerId: made.triggerId, x: 100, y: 120 },
        { key: 'use', kind: 'ACTION', name: 'Greet', actionId: made.actionId, x: 500, y: 120 },
        { key: 'keep', kind: 'OBJECT', name: 'Holder', x: 300, y: 420,
          mappings: [{ name: 'note', expression: 'hello', mode: 'VALUE' }] },
      ],
      edges: [{ source: 'clock', target: 'use' }],
    } },
  );

  await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${made.workflowId}/editor`, { waitUntil: 'domcontentloaded' });
  record(await drawn(page, 'the workflow editor'), 'the editor opens');
  await selectNode(page, page.locator('.react-flow__node', { hasText: 'Holder' }).first(), 'the object node');
  await page.waitForTimeout(800);

  const note = page.locator('#node-mapping-note');
  const DEPENDENCY = '[data-testid="rf__edge-reads:clock->keep"]';

  // ---- 1. dragged taller, where they are ----
  const shape = await page.evaluate(() => {
    const read = (id) => {
      const one = document.getElementById(id);
      return one === null ? null : { tag: one.tagName, resize: getComputedStyle(one).resize };
    };
    return { note: read('node-mapping-note'), description: read('node-description') };
  });
  record(shape.note?.tag === 'TEXTAREA' && shape.note.resize === 'vertical',
    `a written value is a textarea dragged taller (${JSON.stringify(shape.note)})`);
  record(shape.description?.tag === 'TEXTAREA' && shape.description.resize === 'vertical',
    `the description is a textarea dragged taller (${JSON.stringify(shape.description)})`);
  const expands = await page.locator('aside button', { hasText: /^Expand$/ }).count();
  record(expands === 0, `the panel carries no Expand any more (${expands})`);

  const before = await note.boundingBox();
  await page.mouse.move(before.x + before.width - 3, before.y + before.height - 3);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width - 3, before.y + before.height + 80, { steps: 8 });
  await page.mouse.up();
  const after = await note.boundingBox();
  const sideways = await page.evaluate(() => {
    const panel = document.getElementById('node-mapping-note')?.closest('aside');
    return panel === null || panel === undefined ? null : panel.scrollWidth - panel.clientWidth;
  });
  record(after.height >= before.height + 60 && Math.abs(after.width - before.width) < 1,
    `dragging its corner makes it taller and no wider (${Math.round(before.height)}x${Math.round(before.width)} -> ${Math.round(after.height)}x${Math.round(after.width)})`);
  record(sideways === 0, `and the panel does not scroll sideways (${sideways}px over)`);

  // Before anything is written into the value, nothing joins the two.
  record((await page.locator(DEPENDENCY).count()) === 0, 'no dependency line before a placeholder is written');

  // ---- 2. suggestions after {{ ----
  await note.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('Hi {{us');
  const menu = page.getByTestId('placeholder-suggestions');
  await menu.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  const offered = await menu.locator('[role="option"]').evaluateAll((all) => all.map((one) => one.getAttribute('data-expression')))
    .catch(() => []);
  record(offered.includes('trigger.user'), `typing {{us offers trigger.user (${JSON.stringify(offered)})`);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(200);
  const taken = await note.evaluate((one) => ({ value: one.value, caret: one.selectionStart, focused: document.activeElement === one }));
  record(taken.value === 'Hi {{ trigger.user }}', `Enter puts {{ trigger.user }} in (${JSON.stringify(taken.value)})`);
  record(taken.caret === taken.value.length && taken.focused, `with the caret after it and the focus still in the field (${JSON.stringify(taken)})`);
  record((await menu.count()) === 0, 'and the list goes away');

  await page.keyboard.type(' {{');
  await menu.waitFor({ state: 'visible', timeout: 3000 }).catch(() => {});
  const reopened = await menu.count();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  const escaped = { menu: await menu.count(), focused: await note.evaluate((one) => document.activeElement === one) };
  record(reopened === 1 && escaped.menu === 0 && escaped.focused,
    `Escape puts the list away and leaves the focus in the field (open ${reopened}, after ${JSON.stringify(escaped)})`);

  // ---- 3. placeholders lit, in the right colours, under the right letters ----
  await note.fill('Hi {{ trigger.user }} and {{ nowhere }}');
  await page.waitForTimeout(300);
  const lit = await page.evaluate(() => {
    const colour = (value) => {
      const probe = document.createElement('span');
      probe.style.color = value;
      document.body.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const area = document.getElementById('node-mapping-note');
    const layer = area.parentElement.querySelector('[data-testid="placeholder-highlight"]');
    if (layer === null) return { marks: [], green: null, red: null, textHidden: false, sameMetrics: ['no lit layer at all'], sameBox: false };
    const marks = [...layer.querySelectorAll('mark')].map((one) => ({
      text: one.textContent, kind: one.getAttribute('data-mark'), colour: getComputedStyle(one).color,
    }));
    const a = getComputedStyle(area);
    const l = getComputedStyle(layer);
    const metric = ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingLeft', 'whiteSpace', 'overflowWrap', 'letterSpacing'];
    const ar = area.getBoundingClientRect();
    const lr = layer.getBoundingClientRect();
    return {
      marks,
      green: colour('var(--color-accent-brand)'),
      red: colour('var(--color-danger-solid)'),
      textHidden: a.color === 'rgba(0, 0, 0, 0)',
      sameMetrics: metric.filter((name) => a[name] !== l[name]),
      sameBox: [ar.left - lr.left, ar.top - lr.top, ar.width - lr.width, ar.height - lr.height].every((d) => Math.abs(d) < 0.5),
    };
  });
  const answered = lit.marks.find((one) => one.text === '{{ trigger.user }}');
  const unanswered = lit.marks.find((one) => one.text === '{{ nowhere }}');
  record(answered?.kind === 'answered' && answered.colour === lit.green,
    `an answered placeholder is lit green (${JSON.stringify(answered)} vs ${lit.green})`);
  record(unanswered?.kind === 'unanswered' && unanswered.colour === lit.red,
    `one nothing answers is lit red (${JSON.stringify(unanswered)} vs ${lit.red})`);
  record(lit.textHidden && lit.sameMetrics.length === 0 && lit.sameBox,
    `the lit layer lies exactly under the field's own text (transparent ${lit.textHidden}, differing ${JSON.stringify(lit.sameMetrics)}, same box ${lit.sameBox})`);

  await note.fill(`${'a line\n'.repeat(40)}{{ trigger.user }}`);
  await note.evaluate((one) => { one.scrollTop = one.scrollHeight; one.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(200);
  const scrolled = await note.evaluate((one) => ({
    field: one.scrollTop,
    layer: one.parentElement.querySelector('[data-testid="placeholder-highlight"]')?.scrollTop ?? null,
  }));
  record(scrolled.field > 0 && Math.abs(scrolled.field - scrolled.layer) < 1,
    `scrolled, the lit layer scrolls with it (${JSON.stringify(scrolled)})`);

  // ---- 4. a placeholder draws the dependency line ----
  await note.fill('Hi {{ trigger.user }}');
  await page.waitForTimeout(800);
  const dependency = await page.evaluate((selector) => {
    const edge = document.querySelector(selector);
    if (edge === null) return null;
    return {
      dashed: getComputedStyle(edge.querySelector('.react-flow__edge-path')).strokeDasharray,
      says: [...document.querySelectorAll('.react-flow__edgelabel-renderer *')].some((one) => one.textContent?.includes('trigger.user')),
    };
  }, DEPENDENCY);
  record(dependency !== null && dependency.dashed !== 'none',
    `a {{trigger.user}} in Holder's value draws the dashed line from the trigger (${JSON.stringify(dependency)})`);
  record(dependency?.says === true, 'and the line says the field it carries');

  // ---- 5. the run's lines move; dependencies do not ----
  const motion = async () => page.evaluate((selector) => {
    const flowEdge = [...document.querySelectorAll('[data-testid^="rf__edge-"]')]
      .find((one) => !one.getAttribute('data-testid').includes(':'));
    const overlay = flowEdge?.querySelector('path[data-flow]');
    const still = document.querySelector(selector);
    return {
      flow: overlay === null || overlay === undefined ? null : {
        animation: getComputedStyle(overlay).animationName,
        display: getComputedStyle(overlay).display,
      },
      dependencyMoves: still === null ? null : [...still.querySelectorAll('path')]
        .some((one) => one.hasAttribute('data-flow') || getComputedStyle(one).animationName !== 'none'),
    };
  }, DEPENDENCY);
  const moving = await motion();
  record(moving.flow !== null && moving.flow.animation !== 'none' && moving.flow.display !== 'none',
    `the line the run travels moves (${JSON.stringify(moving.flow)})`);
  record(moving.dependencyMoves === false, `the dependency line is still (${moving.dependencyMoves})`);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.waitForTimeout(200);
  const calmed = await motion();
  record(calmed.flow === null || calmed.flow.display === 'none' || calmed.flow.animation === 'none',
    `asked for less motion, nothing moves (${JSON.stringify(calmed.flow)})`);
} finally {
  if (made.workflowId !== null) await graphql(`mutation($id: ID!) { removeWorkflow(id: $id) }`, { id: made.workflowId }).catch(() => undefined);
  if (made.actionId !== null) await graphql(`mutation($id: ID!) { deleteAction(id: $id) }`, { id: made.actionId }).catch(() => undefined);
  if (made.triggerId !== null) await graphql(`mutation($id: ID!) { deleteTrigger(id: $id) }`, { id: made.triggerId }).catch(() => undefined);
  if (made.functionId !== null) await graphql(`mutation($id: ID!) { deleteFunction(id: $id) }`, { id: made.functionId }).catch(() => undefined);
}

await finish(browser);
