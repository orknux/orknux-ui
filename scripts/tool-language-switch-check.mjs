/**
 * A tool still holding its starter can change language in the editor.
 *
 * The language was chosen only in the Create Tool dialog, so a tool made as
 * TypeScript by somebody who did not notice the choice had no way to Python
 * short of deleting it. While the code is the starter the badge is a choice;
 * switching writes the other language's starter, keeping the parameters, and
 * Save stores the new language. Once somebody has written code it is a badge
 * again, because switching would throw their code away.
 *
 * A scratch tool, made and deleted through the API.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const NAME = `switchCheck${Date.now() % 100000}`;

const { browser, context, page } = await open({ viewport: { width: 1440, height: 900 } });

async function graphql(query, variables = {}) {
  const answer = await context.request.post(`${BASE}/graphql`, { data: { query, variables } });
  const body = await answer.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

let toolId = null;

try {
  toolId = (await graphql(
    `mutation ($w: ID!, $n: String!) { createTool(input: { workspaceId: $w, name: $n, description: "switch check" }) { id } }`,
    { w: WORKSPACE, n: NAME },
  )).createTool.id;

  await page.goto(`${BASE}/workspace/${WORKSPACE}/tools/${toolId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('text=Parameters', { timeout: 20_000 });
  await page.waitForTimeout(800);

  const control = page.getByTestId('tool-language');
  record((await control.evaluate((node) => node.tagName)) === 'BUTTON', 'a starter tool offers its language as a choice');

  await chooseOption(page, control, { value: 'PYTHON', label: 'Python' });
  await page.waitForTimeout(600);
  const firstLine = (await page.locator('.monaco-editor .view-line').first().innerText()).replace(/ /g, ' ');
  record(firstLine.startsWith('def main('), `the code became the Python starter (${JSON.stringify(firstLine)})`);
  const highlighted = await page.locator('[data-language]').first().getAttribute('data-language');
  record(highlighted === 'python', `and is highlighted as Python (${highlighted})`);

  await page.getByRole('button', { name: 'Save Changes' }).click();
  await page.waitForSelector('text=Saved.', { timeout: 20_000 });
  const stored = (await graphql(`query ($id: ID!) { tool(id: $id) { language source } }`, { id: toolId })).tool;
  record(stored.language === 'PYTHON', `the save stored Python (${stored.language})`);
  record(stored.source.startsWith('def main('), 'with the Python starter as its code');

  // Written code closes the choice.
  await page.locator('.monaco-editor .view-line').nth(1).click();
  await page.keyboard.press('End');
  await page.keyboard.type('  # mine');
  await page.waitForTimeout(500);
  record((await control.evaluate((node) => node.tagName)) !== 'BUTTON', 'once code is written the language is a badge again');
  record((await control.innerText()).trim() === 'Python', 'reading Python');

  await page.screenshot({ path: '/tmp/tool-language-switch.png' });
} catch (failure) {
  record(false, `the check threw: ${failure.message}`);
} finally {
  if (toolId !== null) {
    await graphql(`mutation ($id: ID!) { deleteTool(id: $id) }`, { id: toolId }).catch(() => undefined);
  }
}

await finish(browser);
