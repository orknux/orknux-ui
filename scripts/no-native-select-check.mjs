/**
 * No screen draws a native select; every choice opens the application's own list.
 *
 * The operating system draws a native select's menu, in its own font and
 * colours, outside the theme - on Windows a pale highlight on a dark page. So
 * every one became `Select`, and this walks a spread of the screens that held
 * them and counts what is drawn: a `<select>` anywhere is one that came back.
 *
 * Then it drives one by the keyboard alone, the way somebody without a mouse
 * would: the arrows open it, Home and End reach the ends, a letter jumps,
 * Enter takes, Escape leaves without changing anything. Nothing is saved.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BASE, WORKSPACE, WORKFLOW, open, record, drawn, selectNode, finish } from './suite/harness.mjs';

/*
 * One chevron per control. `Select` draws its own, and a page that already drew
 * one beside the old select passes `chevron={false}` - a call site that does
 * neither shows two. Read off the source first, where every call site is,
 * whether or not a page below happens to draw it.
 */
const files = (from) =>
  readdirSync(from, { withFileTypes: true }).flatMap((one) =>
    one.isDirectory() ? files(join(from, one.name)) : one.name.endsWith('.tsx') ? [join(from, one.name)] : [],
  );
const doubled = [];
for (const path of files('src')) {
  const src = readFileSync(path, 'utf8');
  for (const found of src.matchAll(/<Select[\s>]/g)) {
    // The opening tag ends at the first `>` outside braces.
    let end = found.index;
    for (let depth = 0; end < src.length; end += 1) {
      if (src[end] === '{') depth += 1;
      else if (src[end] === '}') depth -= 1;
      else if (src[end] === '>' && depth === 0) break;
    }
    const close = src.indexOf('</Select>', end);
    if (close === -1) continue;
    const own = !src.slice(found.index, end).includes('chevron={false}');
    const beside = /^[\s]*<img[\s/>]/.test(src.slice(close + '</Select>'.length));
    if (own && beside) doubled.push(`${path}:${src.slice(0, found.index).split(String.fromCharCode(10)).length}`);
  }
}
record(doubled.length === 0, `no Select draws its own chevron beside one the page draws (${doubled.join(', ') || 'none'})`);

/** Every drawn control whose box holds other than one chevron: its own, or one the page laid over it. */
const chevronsWrong = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('[role="combobox"][data-select]')]
      .filter((one) => one.getClientRects().length > 0)
      .map((one) => {
        const box = one.getBoundingClientRect();
        const inside = [...one.querySelectorAll('img')].length;
        // A page's own chevron sits right after the control, over its end or just beside it.
        const next = one.nextElementSibling?.tagName === 'IMG' ? one.nextElementSibling : null;
        const over = [...(one.parentElement?.querySelectorAll('img') ?? [])].filter((img) => {
          if (one.contains(img)) return false;
          if (img === next) return true;
          const at = img.getBoundingClientRect();
          const x = at.left + at.width / 2;
          const y = at.top + at.height / 2;
          return at.width > 0 && x > box.left && x < box.right && y > box.top && y < box.bottom;
        }).length;
        return { name: one.getAttribute('aria-label') ?? one.id ?? '', count: inside + over };
      })
      .filter((one) => one.count !== 1),
  );

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });

const { workspaceAgents } = await graphql(
  'query($w: ID!) { workspaceAgents(workspaceId: $w, page: 0, size: 1) { content { id chattiness } } }',
  { w: WORKSPACE },
);
const agent = workspaceAgents.content[0];
const { modelProviders } = await graphql('query($w: ID!) { modelProviders(workspaceId: $w) { id } }', { w: WORKSPACE });
const provider = modelProviders[0];

const pages = [
  ['workspace settings', `/workspace/${WORKSPACE}/settings`],
  ['variables', `/workspace/${WORKSPACE}/variables`],
  ['issues', `/workspace/${WORKSPACE}/issues`],
  ['admin settings', '/admin/settings'],
  ['admin reports', '/admin/reports'],
  ['admin audit', '/admin/audit'],
  ...(agent === undefined ? [] : [['agent form', `/workspace/${WORKSPACE}/agents/${agent.id}/settings`]]),
  ...(provider === undefined ? [] : [['provider page', `/workspace/${WORKSPACE}/models/providers/${provider.id}`]]),
];
record(agent !== undefined, 'the workspace has an agent whose form can be opened');
record(provider !== undefined, 'the workspace has a model provider whose page can be opened');

const selects = () => page.locator('select').count();
const ours = () => page.locator('[role="combobox"][data-select]').count();

for (const [name, path] of pages) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' });
  if (!(await drawn(page, name, { where: 'main' }))) continue;
  const native = await selects();
  record(native === 0, `${name}: no native select is drawn (${native})`);
  const wrong = await chevronsWrong();
  record(wrong.length === 0, `${name}: every control draws one chevron (${JSON.stringify(wrong)})`);
  if (name !== 'admin audit' && name !== 'issues') continue;
  record((await ours()) > 0, `${name}: its choices are the application's own (${await ours()})`);
}

// The workflow editor's side panel, with a node chosen.
await page.goto(`${BASE}/workspace/${WORKSPACE}/workflows/${WORKFLOW}/editor`, { waitUntil: 'domcontentloaded' });
await page.locator('.react-flow__node').first().waitFor({ timeout: 20_000 }).catch(() => undefined);
const { workflowGraph } = await graphql(
  'query($w: ID!, $f: ID!) { workflowGraph(workspaceId: $w, workflowId: $f) { nodes { name kind } } }',
  { w: WORKSPACE, f: WORKFLOW },
);
const node = workflowGraph.nodes.find((one) => one.kind === 'AGENT') ?? workflowGraph.nodes[0];
if (node !== undefined && (await selectNode(page, page.locator('.react-flow__node').filter({ hasText: node.name }).first(), node.name))) {
  await page.waitForTimeout(800);
  const native = await selects();
  record(native === 0, `the editor's panel for ${node.name} draws no native select (${native})`);
}

// One driven by the keyboard alone: the agent's progress messages level.
if (agent !== undefined) {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
  const level = page.locator('#agent-chattiness-level');
  await level.waitFor({ timeout: 20_000 }).catch(() => undefined);
  record((await level.getAttribute('role').catch(() => null)) === 'combobox', 'the level is a combobox');
  const listbox = page.locator('[role="listbox"][data-select-menu]');
  await level.focus().catch(() => undefined);
  await page.keyboard.press('ArrowDown');
  const opened = await listbox.waitFor({ timeout: 3000 }).then(() => true).catch(() => false);
  record(opened, 'ArrowDown on the closed control opens its list');
  record((await level.getAttribute('aria-expanded').catch(() => null)) === 'true', 'and the control says it is expanded');
  const ticked = await listbox.locator('[role="option"][aria-selected="true"]').getAttribute('data-value').catch(() => null);
  record(ticked === agent.chattiness, `the chosen row is the one marked selected (${ticked})`);
  const fits = await listbox.evaluate((one) => {
    const box = one.getBoundingClientRect();
    return box.top >= 0 && box.left >= 0 && box.bottom <= window.innerHeight && box.right <= window.innerWidth;
  }).catch(() => false);
  record(fits, 'the open list is drawn wholly on the screen');
  const at = () => level.getAttribute('aria-activedescendant').then((id) => (id === null ? null : page.locator(`[id="${id}"]`).getAttribute('data-value'))).catch(() => null);
  await page.keyboard.press('End');
  record((await at()) === 'HIGH', `End reaches the last row (${await at()})`);
  await page.keyboard.press('Home');
  record((await at()) === 'NONE', `Home reaches the first (${await at()})`);
  await page.keyboard.press('m');
  record((await at()) === 'MEDIUM', `a letter jumps to the row it begins (${await at()})`);
  await page.keyboard.press('Escape');
  const closed = await listbox.waitFor({ state: 'detached', timeout: 3000 }).then(() => true).catch(() => false);
  record(closed, 'Escape closes it');
  record((await level.getAttribute('data-value').catch(() => null)) === agent.chattiness, 'and changes nothing');
  record(await level.evaluate((one) => one === document.activeElement).catch(() => false), 'with the keys left on the control');
  const other = agent.chattiness === 'LOW' ? 'NONE' : 'LOW';
  await page.keyboard.press('ArrowDown');
  await listbox.waitFor({ timeout: 3000 }).catch(() => undefined);
  await page.keyboard.press(other === 'LOW' ? 'l' : 'n');
  await page.keyboard.press('Enter');
  record((await listbox.count()) === 0, 'Enter takes the row and closes the list');
  record((await level.getAttribute('data-value').catch(() => null)) === other, `the control now holds it (${await level.getAttribute('data-value').catch(() => null)})`);
  await level.click().catch(() => undefined);
  await listbox.waitFor({ timeout: 3000 }).catch(() => undefined);
  await page.mouse.click(5, 5);
  record(await listbox.waitFor({ state: 'detached', timeout: 3000 }).then(() => true).catch(() => false), 'a click elsewhere closes it');
}

// At phone width the list still fits the screen.
await page.setViewportSize({ width: 375, height: 720 });
await page.goto(`${BASE}/admin/audit`, { waitUntil: 'domcontentloaded' });
if (await drawn(page, 'admin audit at phone width', { where: 'main' })) {
  const control = page.locator('[role="combobox"][data-select]').last();
  await control.scrollIntoViewIfNeeded().catch(() => undefined);
  await control.click().catch(() => undefined);
  const menu = page.locator('[role="listbox"][data-select-menu]');
  await menu.waitFor({ timeout: 3000 }).catch(() => undefined);
  const fits = await menu.evaluate((one) => {
    const box = one.getBoundingClientRect();
    return { ok: box.left >= 0 && box.right <= window.innerWidth && box.top >= 0 && box.bottom <= window.innerHeight, box: [box.left, box.right].map(Math.round) };
  }).catch(() => ({ ok: false, box: null }));
  record(fits.ok, `at 375px the open list stays on the screen (${JSON.stringify(fits.box)})`);
}

await finish(browser);
