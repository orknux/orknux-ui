/**
 * A tool written in Python, made and edited in the browser.
 *
 * The Create Tool dialog offers the language; a Python tool opens in the editor
 * marked Python, starts from a `def main(...)` taking what it declares, and the
 * declaration follows the panel as a TypeScript one does - with names, since a
 * Python parameter list says no types. Validate asks the sandbox's Python
 * parser, a save stores the Python as both halves, and the imports a Python
 * tool cannot use are neither offered nor accepted.
 *
 * A scratch tool, made through the dialog and deleted through the API.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const NAME = `pythonCheck${Date.now() % 100000}`;

const { browser, context, page } = await open({ viewport: { width: 1440, height: 900 } });

async function graphql(query, variables = {}) {
  const answer = await context.request.post(`${BASE}/graphql`, { data: { query, variables } });
  const body = await answer.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

let toolId = null;

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/tools`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: '+ Create Tool' }).click();
  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Name').fill(NAME);
  record((await page.getByTestId('new-tool-language').count()) === 1, 'the Create Tool dialog asks which language');
  await chooseOption(page, page.getByTestId('new-tool-language'), { value: 'PYTHON', label: 'Python' });
  await dialog.getByRole('button', { name: 'Create Tool' }).click();

  await page.waitForURL(/\/tools\/\d+$/, { timeout: 20_000 });
  toolId = page.url().split('/').pop();
  await page.waitForSelector('text=Parameters', { timeout: 20_000 });
  await page.waitForTimeout(800);

  const badge = (await page.getByTestId('tool-language').innerText()).trim();
  record(badge === 'Python', `the editor says the tool is Python (${badge})`);

  let stored = (await graphql(`query ($id: ID!) { tool(id: $id) { language source typescript } }`, { id: toolId })).tool;
  record(stored.language === 'PYTHON', `the server holds it as Python (${stored.language})`);
  record(stored.source.startsWith('def main(input):'), `it starts from a main taking what it declares (${JSON.stringify(stored.source.split('\n')[0])})`);

  const highlighted = await page.locator('[data-language]').first().getAttribute('data-language');
  record(highlighted === 'python', `the code is highlighted as Python (${highlighted})`);
  record((await page.getByRole('heading', { name: 'Imports' }).count()) === 0, 'no imports are offered, since Python cannot call them');
  record((await page.getByRole('heading', { name: 'Libraries' }).count()) === 0, 'nor libraries');

  // The panel leads and the code follows, by name.
  await page.getByLabel('Parameter 1 name').fill('text');
  await chooseOption(page, page.getByLabel('Parameter 1 type'), 'STRING');
  await page.getByRole('button', { name: 'Add Parameter' }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Parameter 2 name').fill('times');
  await chooseOption(page, page.getByLabel('Parameter 2 type'), 'NUMBER');
  await page.waitForTimeout(600);
  const firstLine = (await page.locator('.monaco-editor .view-line').first().innerText()).replace(/ /g, ' ');
  record(firstLine === 'def main(text, times):', `the def line followed the panel (${JSON.stringify(firstLine)})`);

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  // The server's first Python parse starts GraalPy, which takes seconds on a runner: wait for the answer, not a moment.
  await page
    .waitForFunction(() => /Python parser accepts the code|Not valid/.test(document.body.innerText), undefined, { timeout: 30_000 })
    .catch(() => undefined);
  const said = await page.locator('body').innerText();
  record(said.includes("the sandbox's Python parser accepts the code"), 'Validate asks the Python parser, and it accepts');

  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForSelector('text=Saved.', { timeout: 20_000 });
  stored = (await graphql(`query ($id: ID!) { tool(id: $id) { language source typescript signature } }`, { id: toolId })).tool;
  record(stored.source.startsWith('def main(text, times):'), 'the save stored the new def line');
  record(stored.source === stored.typescript, 'and the same text as both halves');
  record(stored.signature === '(text: string, times: number)', `with the signature the panel says (${stored.signature})`);

  // A Python tool refuses an import the server will not run.
  const functions = await graphql(
    `query ($w: ID!) { workspaceFunctions(workspaceId: $w, page: 0, size: 5) { content { id scope } } }`,
    { w: WORKSPACE },
  ).catch(() => null);
  const own = functions?.workspaceFunctions?.content?.find((one) => one.scope === 'WORKSPACE');
  if (own !== undefined) {
    const refused = await context.request.post(`${BASE}/graphql`, {
      data: {
        query: `mutation ($id: ID!, $f: ID!) { updateTool(id: $id, input: { imports: [{ functionId: $f, name: "helper" }] }) { id } }`,
        variables: { id: toolId, f: own.id },
      },
    });
    const body = await refused.json();
    record(body.errors?.[0]?.extensions?.code === 'ToolPythonImports', 'an import added over the API is refused');
  }

  await page.screenshot({ path: '/tmp/python-tool.png' });
} catch (failure) {
  record(false, `the check threw: ${failure.message}`);
} finally {
  if (toolId !== null) {
    await graphql(`mutation ($id: ID!) { deleteTool(id: $id) }`, { id: toolId }).catch(() => undefined);
  }
}

await finish(browser);
