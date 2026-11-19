/**
 * Code from GitHub and Jira issues in a diagram, and what came with them.
 *
 * A code shape shows lines of a GitHub file, highlighted, and a Jira shape an
 * issue's card, read through the GitHub and Jira plugins - here stand-ins
 * keyed `github` and `jira`, loaded for the run and unloaded after, since no
 * check reaches GitHub or Jira. Where a real one is loaded under that key the
 * reading steps are skipped and said to be: the check never unloads somebody's
 * plugin. Reading is lazy: a diagram opens on the copies the server
 * kept, reads only the stale shapes in view once it is drawn, and reads none on
 * a reload while its copies are fresh. Refresh reads one again regardless.
 *
 * Alongside: a pasted address becomes the shape that shows it, a shape set to
 * fit its text writes it as large as fits, the text size field steps from the
 * size it shows faintly, and a line on its own can be cut and pasted back.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const NAME = `zzSources ${Date.now()}`;
const FILE = 'https://github.com/acme/shop/blob/main/src/Pay.kt#L2-L4';
const FAR = 'https://github.com/acme/shop/blob/main/src/Far.kt';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 950 } });

const settingsBefore = (await graphql('query ($w: ID!) { workspace(id: $w) { diagramJiraConnectionId diagramFetchMinutes } }', { w: WORKSPACE })).workspace;
let id = null;

const GITHUB = `export default class GitHub extends OrknuxPlugin {
  id() { return 'github'; }
  apiVersion() { return 1; }
  parameters() { return [new OrknuxParameter({ name: 'answer', type: 'string', required: false })]; }
  functions() {
    return [new OrknuxFunction({
      name: 'openFile', description: 'Reads a file.',
      params: [{ name: 'owner', type: 'string' }, { name: 'repo', type: 'string' }, { name: 'path', type: 'string' }, { name: 'ref', type: 'string' }],
      returnType: 'string',
      run: (owner, repo, path, ref) => (this.settings.answer ?? '').replace(/~/g, '\\n'),
    })];
  }
}`;
const JIRA = `export default class Jira extends OrknuxPlugin {
  id() { return 'jira'; }
  apiVersion() { return 1; }
  connectionTypes() { return [{ name: 'jira', label: 'Jira', description: 'A Jira site.' }]; }
  parameters() { return [new OrknuxParameter({ name: 'jira', type: 'connection', connectionType: 'jira', required: false })]; }
  functions() {
    return [new OrknuxFunction({
      name: 'openIssue', description: 'Opens an issue.',
      params: [{ name: 'key', type: 'string' }],
      returnType: 'map',
      run: (key) => ({ key, summary: 'Pay twice for one order', status: 'In Progress', type: 'Bug', assignee: 'alice' }),
    })];
  }
}`;

/** The stand-ins this run loaded, to unload after; none where a plugin of that key was already loaded. */
const loaded = [];
let jiraConnection = null;
const loadedKeys = async () => (await graphql('{ plugins { id key } }')).plugins;
async function standIn(key, source) {
  if ((await loadedKeys()).some((one) => one.key === key)) return false;
  const answer = await page.request.post(`${BASE}/api/plugins`, { multipart: { file: { name: `${key}.js`, mimeType: 'text/javascript', buffer: Buffer.from(source) } } });
  if (!answer.ok()) throw new Error(`could not load the ${key} stand-in: ${await answer.text()}`);
  loaded.push((await loadedKeys()).find((one) => one.key === key).id);
  return true;
}
const pluginId = async (key) => (await loadedKeys()).find((one) => one.key === key)?.id;
const setting = async (key, name, literal) =>
  graphql('mutation ($w: ID!, $p: ID!, $n: String!, $l: String) { setPluginParameter(workspaceId: $w, pluginId: $p, name: $n, literal: $l) { missing } }', { w: WORKSPACE, p: await pluginId(key), n: name, l: literal });

/** Every fetchDiagramSource the page sends, by source, from now on. */
const fetches = [];
page.on('request', (request) => {
  if (!request.url().includes('/graphql')) return;
  const body = request.postData() ?? '';
  if (body.includes('fetchDiagramSource')) fetches.push(JSON.parse(body).variables?.source);
});

const arrive = async () => {
  // Opened on the top left at full size, as a person left it: fitted to the whole diagram, the far shape would pull the near ones out of view.
  await page.goto(`${BASE}/workspace/${WORKSPACE}`, { waitUntil: 'domcontentloaded' });
  await page.evaluate((key) => window.localStorage.setItem(key, JSON.stringify({ x: 40, y: 40, zoom: 1 })), `orknux.diagram.view.${id}`);
  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="code"]').waitFor({ timeout: 20_000 });
  if ((await page.getByTestId('diagram-mode-edit').getAttribute('aria-checked')) !== 'true') await page.getByTestId('diagram-mode-edit').click();
};

try {
  const ours = (await standIn('github', GITHUB)) && (await standIn('jira', JIRA));
  if (ours) {
    await setting('github', 'answer', 'package shop~fun pay(total: Int): String {~  return "paid" // done~}~');
    jiraConnection = (
      await graphql('mutation ($i: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $i) { id } }', {
        i: { workspaceId: WORKSPACE, name: `zzJira ${Date.now()}`, type: 'HTTP', pluginType: 'jira/jira', url: 'https://jira.example.test', authType: 'BEARER_TOKEN', secret: 'token' },
      })
    ).createWorkspaceConnection.id;
    await graphql('mutation ($w: ID!, $j: ID) { setWorkspaceDiagramSources(workspaceId: $w, jiraConnectionId: $j, fetchMinutes: 60) { id } }', { w: WORKSPACE, j: jiraConnection });
  } else {
    record(true, 'NOTE: a real GitHub or Jira plugin is loaded here, so the steps that read through one are skipped');
  }

  id = (
    await graphql('mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }', {
      w: WORKSPACE,
      n: NAME,
      d: JSON.stringify({
        nodes: [
          { id: 'code', kind: 'code', label: '', x: 0, y: 0, w: 480, h: 200, source: FILE },
          { id: 'jira', kind: 'jira', label: '', x: 540, y: 0, source: 'OKO-4385' },
          { id: 'far', kind: 'code', label: '', x: 30000, y: 30000, source: FAR },
          { id: 'fit', kind: 'box', label: 'Big', x: 0, y: 260, w: 400, h: 200, textFit: true },
          { id: 'fitd', kind: 'diamond', label: 'New node', x: 440, y: 260, w: 330, h: 210, textFit: true },
          { id: 'a', kind: 'box', label: 'A', x: 0, y: 500 },
          { id: 'b', kind: 'box', label: 'B', x: 0, y: 700 },
        ],
        edges: [{ id: 'ab', from: 'a', to: 'b' }],
      }),
    })
  ).createDiagram.id;

  if (ours) {
    await arrive();
    await page.getByTestId('diagram-code-lines').waitFor({ timeout: 15_000 });
    const lines = await page.locator('.react-flow__node[data-id="code"] [data-testid="diagram-code-lines"]').innerText();
    record(lines.includes('fun pay') && lines.includes('"paid"') && !lines.includes('package shop'), `a code shape shows the lines its address asks for (${JSON.stringify(lines.slice(0, 60))})`);
    const spans = await page.locator('.react-flow__node[data-id="code"] [class*="hljs-"]').count();
    record(spans >= 3, `and highlights them (${spans} highlighted pieces)`);
    const numbers = await page.locator('.react-flow__node[data-id="code"] [data-testid="diagram-code-lines"] > span').first().innerText();
    record(numbers.trim().startsWith('2'), 'numbered from the first line asked for');
    await page.getByTestId('diagram-jira-summary').filter({ hasText: 'Pay twice' }).waitFor({ timeout: 10_000 });
    record((await page.getByTestId('diagram-jira-status').innerText()).toLowerCase().includes('in progress'), 'a Jira shape shows the issue’s summary and status');
    record(!fetches.includes(FAR), 'a shape out of view is not read');

    fetches.length = 0;
    await arrive();
    await page.getByTestId('diagram-code-lines').waitFor({ timeout: 10_000 });
    await page.waitForTimeout(1500);
    record(fetches.filter((one) => one !== FAR).length === 0, `reopened while its copies are fresh, nothing is read again (${JSON.stringify(fetches)})`);

    // The file changes; the copy stands until Refresh.
    await setting('github', 'answer', 'package shop~fun refund(total: Int) {~  return~}~');
    await page.locator('.react-flow__node[data-id="code"]').click();
    await page.getByTestId('diagram-node-source-refresh').click();
    await page.locator('.react-flow__node[data-id="code"] [data-testid="diagram-code-lines"]').filter({ hasText: 'refund' }).waitFor({ timeout: 10_000 });
    record(true, 'Refresh reads it again');
    record((await page.getByTestId('diagram-node-source-said').innerText()).includes('acme/shop'), 'and the panel says which file it reads');
  } else {
    await arrive();
  }

  // A fitted label is drawn larger than the usual fourteen pixels in a big box.
  const fitted = await page.locator('.react-flow__node[data-id="fit"] [data-testid="diagram-node-label-text"]').evaluate((one) => parseFloat(getComputedStyle(one).fontSize));
  record(fitted > 40, `a shape set to fit its text writes it as large as fits (${fitted}px)`);

  // The size field, empty, steps from the size it shows faintly.
  await page.locator('.react-flow__node[data-id="a"]').click();
  const field = page.getByTestId('diagram-node-text-size');
  await field.focus();
  await page.keyboard.press('ArrowUp');
  record((await field.inputValue()) === '15', `Up in the empty size field starts from the usual 14 (${await field.inputValue()})`);
  await field.fill('');
  await field.evaluate((one) => one.blur());
  // And its buttons do the same - the browser's own arrows started from the field's least, 6.
  await page.getByTestId('diagram-node-text-size-down').click();
  record((await field.inputValue()) === '13', `the step-down button in the empty size field starts from the usual 14 too (${await field.inputValue()})`);
  await field.fill('');
  await field.evaluate((one) => one.blur());

  // Fitted in a diamond, the words stay inside its slanted sides rather than filling the box round it.
  const diamondBox = await page.locator('.react-flow__node[data-id="fitd"]').boundingBox();
  const diamondWords = await page.locator('.react-flow__node[data-id="fitd"] [data-testid="diagram-node-label-text"]').evaluate((one) => {
    const range = document.createRange();
    range.selectNodeContents(one);
    const rect = range.getBoundingClientRect();
    return { x: rect.x, y: rect.y, w: rect.width, h: rect.height, size: parseFloat(getComputedStyle(one).fontSize) };
  });
  // Every corner of the words' box inside the diamond: |dx|/(w/2) + |dy|/(h/2) <= 1.
  const inside = [[diamondWords.x, diamondWords.y], [diamondWords.x + diamondWords.w, diamondWords.y + diamondWords.h], [diamondWords.x, diamondWords.y + diamondWords.h], [diamondWords.x + diamondWords.w, diamondWords.y]].every(
    ([x, y]) => Math.abs(x - (diamondBox.x + diamondBox.width / 2)) / (diamondBox.width / 2) + Math.abs(y - (diamondBox.y + diamondBox.height / 2)) / (diamondBox.height / 2) <= 1.02,
  );
  record(inside && diamondWords.size > 20, `fitted words stay inside a diamond (${JSON.stringify({ ...diamondWords, inside })})`);

  // A line alone, cut and pasted, is put back between the boxes it joined.
  await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
  // Pressed halfway between the two boxes, on the line itself.
  const upper = await page.locator('.react-flow__node[data-id="a"]').boundingBox();
  const lower = await page.locator('.react-flow__node[data-id="b"]').boundingBox();
  await page.mouse.click(upper.x + upper.width / 2, (upper.y + upper.height + lower.y) / 2);
  await page.waitForTimeout(200);
  await page.keyboard.press('Control+x');
  await page.waitForTimeout(300);
  record((await page.locator('.react-flow__edge').count()) === 0, 'a line on its own is cut');
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(300);
  const back = await page.locator('.react-flow__edge').count();
  record(back === 1, `and pasted back between the same boxes (${back} line)`);

  // Space held is looking: a click on a shape picks nothing, and a drag over one moves the view, not the shape.
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  const shape = page.locator('.react-flow__node[data-id="a"]');
  const before = await shape.boundingBox();
  const storedBefore = JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document).nodes.find((node) => node.id === 'a');
  await page.keyboard.down('Space');
  await page.mouse.click(before.x + before.width / 2, before.y + before.height / 2);
  record(!(await shape.getAttribute('class')).includes('selected'), 'with Space held, a click on a shape selects nothing');
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 10, before.y + before.height / 2 + 5);
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Space');
  const after = await shape.boundingBox();
  await page.waitForTimeout(2500);
  const storedAfter = JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document).nodes.find((node) => node.id === 'a');
  record(Math.abs(after.x - before.x) > 40 && storedAfter.x === storedBefore.x && storedAfter.y === storedBefore.y, `and a drag over one moves the view, leaving the shape where it was in the diagram (moved ${Math.round(after.x - before.x)}px on screen)`);

  // A pasted address makes the shape that shows it.
  const pasteAt = async (text) => {
    // Nothing selected and nothing focused, as a paste onto the canvas finds it.
    await page.keyboard.press('Escape');
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
    // The address was copied somewhere else: leaving the page is what tells the editor its own clipboard is no longer the newest.
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.evaluate((said) => {
      const data = new DataTransfer();
      data.setData('text/plain', said);
      document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
    }, text);
    await page.waitForTimeout(400);
  };
  await pasteAt('https://jira.example.com/browse/ABC-12');
  await pasteAt('https://github.com/acme/shop/blob/main/README.md');
  await pasteAt('https://example.com/docs');
  await page.waitForTimeout(3000);
  const kept = JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document).nodes;
  record(kept.some((node) => node.kind === 'jira' && node.source === 'ABC-12'), 'a pasted Jira address becomes a Jira shape');
  record(kept.some((node) => node.kind === 'code' && node.source === 'https://github.com/acme/shop/blob/main/README.md'), 'a pasted GitHub file address becomes a code shape');
  record(kept.some((node) => node.kind === 'link' && node.link === 'https://example.com/docs'), 'any other address becomes a link card');
} catch (error) {
  record(false, `stopped part-way: ${String(error?.message ?? error).split('\n')[0]}`);
  console.log(await page.locator('.react-flow__node[data-id="code"]').innerHTML().catch(() => 'no node'));
}

await graphql('mutation ($w: ID!, $j: ID, $m: Int) { setWorkspaceDiagramSources(workspaceId: $w, jiraConnectionId: $j, fetchMinutes: $m) { id } }', {
  w: WORKSPACE,
  j: settingsBefore?.diagramJiraConnectionId ?? null,
  m: settingsBefore?.diagramFetchMinutes ?? null,
}).catch(() => undefined);
if (jiraConnection !== null) await graphql('mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }', { id: jiraConnection }).catch(() => undefined);
for (const plugin of loaded) await graphql('mutation ($id: ID!) { unloadPlugin(id: $id) }', { id: plugin }).catch(() => undefined);
if (id !== null) await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
// Deleted things are kept in the workspace's bin, and a check's own are nobody's to restore.
const binned = await graphql('query ($w: ID!) { recycleBin(workspaceId: $w, size: 200) { content { id name } } }', { w: WORKSPACE })
  .then((data) => data.recycleBin.content)
  .catch(() => []);
for (const entry of binned.filter((one) => one.name === NAME || one.name.startsWith('zzJira'))) {
  await graphql('mutation ($id: ID!) { purgeRecycleBinEntry(id: $id) }', { id: entry.id }).catch(() => undefined);
}

await finish(browser);
