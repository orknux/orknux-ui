/**
 * What the document editor does while somebody types: the inline suggestion,
 * and the grammar check. Both answered here, as the chat composer's check
 * answers its suggestion, since CI has no completion model and what is under
 * test is the page, not LanguageTool or a model.
 *
 * Asserted: typing at the end of a paragraph asks for a suggestion and draws
 * it grey after the caret; Tab puts it in the document; with Auto-completion
 * switched off nothing is asked at all. A paragraph with a mistake in it is
 * underlined; pressing the mark offers the replacement, which fixes the text;
 * and with Grammar switched off no check is asked for. Both switches are
 * remembered after a reload.
 *
 * Makes its own document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish, shot } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const made = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDocument(workspaceId: $w, name: $n, content: $d, pageSize: "A4") { id } }',
  {
    w: WORKSPACE,
    n: `Assist ${stamp}`,
    d: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'This has a speling mistake.' }] }, { type: 'paragraph' }] }),
  },
);
const id = made.createDocument.id;

const completions = [];
const checks = [];
await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('query DocumentCompletion(')) {
    completions.push(JSON.parse(body).variables);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { documentCompletion: ' is ready for review.' } }) });
    return;
  }
  if (body.includes('query GrammarCheck(')) {
    const { text } = JSON.parse(body).variables;
    checks.push(text);
    const at = text.indexOf('speling');
    const found = at < 0 ? [] : [{ offset: at, length: 7, message: 'Possible spelling mistake found.', shortMessage: null, replacements: ['spelling'], rule: 'STUB', spelling: true }];
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { grammarCheck: found } }) });
    return;
  }
  if (body.includes('grammarSettings')) {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { grammarSettings: { pauseMillis: 300, textMost: 20000, languages: ['en', 'pl'], server: null, serverConfigured: null } } }) });
    return;
  }
  if (body.includes('query Workspace(')) {
    const response = await route.fetch();
    const held = await response.json();
    if (held.data?.workspace) {
      held.data.workspace.completionModelId = '1';
      held.data.workspace.completionPauseMillis = 300;
    }
    await route.fulfill({ response, body: JSON.stringify(held) });
    return;
  }
  await route.continue();
});

async function opened() {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  await page.getByTestId('document-prose').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(600);
}

await opened();

// -- Grammar --
await page.getByTestId('document-grammar-mark').first().waitFor({ timeout: 8_000 }).catch(() => undefined);
const mark = page.getByTestId('document-grammar-mark').first();
const marked = ((await mark.textContent().catch(() => '')) ?? '').trim();
const wavy = await mark.evaluate((one) => getComputedStyle(one).textDecorationStyle).catch(() => null);
record(marked === 'speling' && wavy === 'wavy', `the mistake is underlined, wavy (${JSON.stringify({ marked, wavy, checks })})`);
await mark.click().catch(() => undefined);
const fix = page.getByTestId('document-grammar-replacement').first();
await fix.waitFor({ timeout: 3_000 }).catch(() => undefined);
record(((await page.getByTestId('document-grammar-card').textContent().catch(() => '')) ?? '').includes('Possible spelling mistake found.'),
  'pressing the mark says what is wrong');
// A press anywhere else closes it - on the desk beside the paper, away from the mark.
const paper = await page.getByTestId('document-paper').boundingBox();
await page.mouse.click(paper.x - 20, paper.y + 200);
await page.waitForTimeout(200);
record(await page.getByTestId('document-grammar-card').count() === 0, 'a press outside the card closes it');
// Opened again for the replacement below, once the marks have settled after the editor lost the focus.
await page.waitForTimeout(500);
await mark.click().catch(() => undefined);
await fix.waitFor({ timeout: 3_000 }).catch(() => undefined);
await fix.click().catch(() => undefined);
await page.waitForTimeout(400);
const fixed = await page.locator('[data-testid="document-prose"] > p').first().textContent().catch(() => '');
record(fixed === 'This has a spelling mistake.', `the replacement fixes the text (${fixed})`);
await page.screenshot({ path: shot('document-grammar.png') });

// -- The suggestion --
const second = page.locator('[data-testid="document-prose"] > p').nth(1);
await second.click();
await page.keyboard.type('The report', { delay: 20 });
const ghost = page.getByTestId('document-suggestion');
await ghost.waitFor({ timeout: 5_000 }).catch(() => undefined);
const ghostText = (await ghost.textContent().catch(() => '')) ?? '';
const typedBox = await second.boundingBox().catch(() => null);
const ghostBox = await ghost.boundingBox().catch(() => null);
record(ghostText === ' is ready for review.' && ghostBox !== null && typedBox !== null && ghostBox.y < typedBox.y + typedBox.height,
  `typing at the end of a paragraph draws the suggestion after the caret (${JSON.stringify({ ghostText, asked: completions.at(-1) })})`);
record(completions.at(-1)?.before?.endsWith('The report') === true && completions.at(-1)?.page === 1,
  `it is asked with the text before the caret and the page it is on (${JSON.stringify(completions.at(-1))})`);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
const taken = await second.textContent();
record(taken === 'The report is ready for review.' && (await page.getByTestId('document-suggestion').count()) === 0, `Tab puts it in the document (${taken})`);

// -- Both switched off: nothing is asked --
await page.getByTestId('document-autocomplete').click();
await page.getByTestId('document-grammar').click();
const pressed = await Promise.all(['document-autocomplete', 'document-grammar'].map((one) => page.getByTestId(one).getAttribute('aria-pressed')));
record(pressed.every((one) => one === 'false'), `the switches are off (${pressed.join(', ')})`);
record((await page.getByTestId('document-grammar-mark').count()) === 0, 'Grammar off takes the marks away');
await opened();
const remembered = await Promise.all(['document-autocomplete', 'document-grammar'].map((one) => page.getByTestId(one).getAttribute('aria-pressed')));
record(remembered.every((one) => one === 'false'), `and stay off after a reload (${remembered.join(', ')})`);
const askedBefore = completions.length;
const checkedBefore = checks.length;
await page.locator('[data-testid="document-prose"] > p').first().click();
await page.keyboard.press('End');
await page.keyboard.type(' A speling again', { delay: 20 });
await page.waitForTimeout(1500);
record(completions.length === askedBefore && (await page.getByTestId('document-suggestion').count()) === 0,
  `with Auto-completion off no suggestion is asked for (${completions.length - askedBefore})`);
record(checks.length === checkedBefore && (await page.getByTestId('document-grammar-mark').count()) === 0,
  `with Grammar off no check is asked for (${checks.length - checkedBefore})`);

// Back on for whoever comes next.
await page.getByTestId('document-autocomplete').click();
await page.getByTestId('document-grammar').click();
await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id });
await finish(browser);
