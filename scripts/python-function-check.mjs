/**
 * A workspace function written in Python, made in the function editor.
 *
 * A new function's editor offers the language while the code is still its
 * stub, and a Python one starts from a `def main(...)` that takes what the
 * panel declares and follows it as parameters are added. Once code is written
 * the choice is closed. Validate asks the sandbox's Python parser, Create stores
 * the Python as both halves, the editor reopens marked Python with no imports
 * to offer, and the stored function runs as a workflow would run it.
 *
 * Makes its own function and deletes it.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const NAME = `pyCheck${Date.now() % 100000}`;
const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
let functionId = null;

const firstLine = async () => (await page.locator('.monaco-editor .view-line').first().innerText()).replace(/ /g, ' ');

try {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/functions/new`, { waitUntil: 'domcontentloaded' });
  const create = page.getByRole('button', { name: 'Create Function' });
  await create.waitFor({ timeout: 20_000 });
  await page.locator('.view-lines').first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  const picker = page.getByTestId('function-language');
  record((await picker.count()) === 1, 'a new function offers its language');
  await chooseOption(page, picker, { value: 'PYTHON', label: 'Python' });
  await page.waitForTimeout(500);
  record((await page.locator('[data-language]').first().getAttribute('data-language')) === 'python', 'the code is highlighted as Python');
  record((await firstLine()).startsWith('def main('), `the stub is a def main (${JSON.stringify(await firstLine())})`);
  record((await page.getByRole('heading', { name: 'Imports' }).count()) === 0, 'no imports are offered');

  await page.locator('#function-name').fill(NAME);
  await page.getByRole('button', { name: 'Add Parameter' }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Parameter 1 name').fill('a');
  await chooseOption(page, page.getByLabel('Parameter 1 type'), 'NUMBER');
  await page.getByRole('button', { name: 'Add Parameter' }).click();
  await page.waitForTimeout(300);
  await page.getByLabel('Parameter 2 name').fill('b');
  await chooseOption(page, page.getByLabel('Parameter 2 type'), 'NUMBER');
  await page.waitForTimeout(800);
  record((await firstLine()) === 'def main(a, b):', `the def line follows the panel (${JSON.stringify(await firstLine())})`);

  // Somebody's own line makes it theirs, and the language is fixed from then on.
  await page.locator('.monaco-editor .view-lines').first().click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('# written here');
  await page.waitForTimeout(600);
  record(await picker.isDisabled(), 'once code is written the language is closed');

  await page.getByRole('button', { name: 'Validate', exact: true }).click();
  // The server's first Python parse starts GraalPy, which takes seconds on a runner: wait for the answer, not a moment.
  await page
    .waitForFunction(
      () => /^(Valid|Not valid)/.test(document.querySelector('[data-check="validate-status"] span[title]')?.getAttribute('title') ?? ''),
      undefined,
      { timeout: 30_000 },
    )
    .catch(() => undefined);
  // Read off the status's own sentence: the strip it sits in is narrow, and the page's text cuts it short.
  const shown = await page.locator('[data-check="validate-status"] span[title]').first().getAttribute('title');
  record(shown === "Valid — the sandbox's Python parser accepts the code", `Validate asks the Python parser, and it accepts (${shown})`);

  await create.click();
  await page.waitForURL(/\/functions\/\d+/, { timeout: 20_000 });
  functionId = page.url().match(/functions\/(\d+)/)[1];
  await page.waitForTimeout(1500);
  const badge = (await page.getByTestId('function-language').innerText()).trim();
  record(badge === 'Python', `the saved function is marked Python (${badge})`);

  const stored = (await graphql('query ($id: ID!) { function(id: $id) { language source typescript signature } }', { id: functionId })).function;
  record(stored.language === 'PYTHON' && stored.source === stored.typescript, 'it is stored as Python, the same text as both halves');
  record(stored.source.startsWith('def main(a, b):') && stored.source.includes('# written here'), 'with the code as written');

  const ran = (await graphql(
    'mutation ($i: RunFunctionInput!) { runFunction(input: $i) { ok returned error } }',
    { i: { workspaceId: WORKSPACE, functionId, arguments: [{ name: 'a', json: '2' }, { name: 'b', json: '3' }] } },
  )).runFunction;
  record(ran.ok && ran.returned === '{"a": 2, "b": 3}', `and it runs (${ran.returned ?? ran.error})`);
} catch (failure) {
  record(false, `the check threw: ${failure.message}`);
} finally {
  if (functionId !== null) await graphql('mutation ($id: ID!) { deleteFunction(id: $id) }', { id: functionId }).catch(() => undefined);
}

await finish(browser);
