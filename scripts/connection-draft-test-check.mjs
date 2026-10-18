/**
 * The Add Connection dialog tests a connection before it is added, and shows a
 * plugin's setup guide as the document it is.
 *
 * Test used to exist only on a connection's own page, so the one moment
 * somebody most wants to know whether an address and a key work - before
 * saving them - was the one moment there was no way to ask. The dialog now
 * sends what is typed to `testNewWorkspaceConnection`, which stores nothing, and
 * prints what came back over the buttons; changing the address takes the old
 * answer away.
 *
 * The guide was drawn with the chat's line breaks, so a guide wrapped at eighty
 * columns broke mid-sentence, and under the fields it made the dialog taller
 * than the window. It now joins wrapped lines, and a kind with a guide widens
 * the dialog and puts the guide beside the form, as tall as the form is.
 *
 * Canned: the kinds are answered here with one whose guide is hand-wrapped, and
 * the test mutation is captured and answered here, so what the dialog sends can
 * be read exactly. Nothing reaches the database.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 900 } });

const GUIDE = [
  '## Setting up',
  '',
  'Install the add-on and keep the app running. In the add-on\'s config, choose an',
  'API key as this connection\'s authentication and paste the same key here.',
  '',
  ...Array.from({ length: 30 }, (_, at) => `- Step ${at + 1} of a long list`),
].join('\n');

const KIND = {
  id: 'cards/deck', name: 'deck', label: 'Deck server', description: null,
  urlPlaceholder: 'http://localhost:8765', guide: GUIDE, checks: true,
  pluginKey: 'cards', pluginName: 'Cards',
};

/** A kind with an address of its own, so its URL may be left empty. */
const LOCAL = {
  id: 'cards/local', name: 'local', label: 'Local deck', description: null,
  urlPlaceholder: 'http://localhost:8765', defaultUrl: 'http://localhost:8765', guide: null, checks: true,
  pluginKey: 'cards', pluginName: 'Cards',
};

const sent = [];
let created = 0;
let answer = { status: 'CONNECTED', message: 'Deck server 6' };

await page.route('**/graphql', async (route) => {
  const body = route.request().postDataJSON() ?? {};
  const query = body.query ?? '';
  if (query.includes('pluginConnectionTypes')) {
    const answered = await route.fetch();
    const json = await answered.json();
    if (json.data) json.data.pluginConnectionTypes = [KIND, LOCAL];
    return route.fulfill({ response: answered, json });
  }
  if (query.includes('testNewWorkspaceConnection')) {
    sent.push(body.variables?.input);
    return route.fulfill({ json: { data: { testNewWorkspaceConnection: answer } } });
  }
  if (query.includes('createWorkspaceConnection')) created += 1;
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations`, { waitUntil: 'domcontentloaded' });
await page.locator('button', { hasText: /^\+ Add Connection$/ }).click();
await page.waitForSelector('#workspace-connection-name', { timeout: 20_000 });
const dialog = page.locator('dialog[open]');
await page.waitForTimeout(800);
const narrow = (await dialog.boundingBox()).width;
await dialog.locator('#workspace-connection-type').selectOption('cards/deck');
await page.waitForTimeout(300);

// The guide: open, beside the form in a wider dialog rather than under it, and as tall as the form.
const guide = dialog.getByTestId('connection-guide');
await guide.waitFor({ timeout: 5_000 });
record(await guide.evaluate((element) => element.open), 'the guide starts open in the dialog');
const wide = (await dialog.boundingBox()).width;
const form = await dialog.locator('#workspace-connection-name').boundingBox();
const beside = await guide.boundingBox();
const fields = await dialog.locator('#workspace-connection-url').boundingBox();
record(wide > narrow + 300, `a kind with a guide widens the dialog (${Math.round(narrow)} -> ${Math.round(wide)}px)`);
record(beside.x >= form.x + form.width && Math.abs(beside.y - form.y) < 40, 'the guide sits beside the form, level with its top');
const viewport = page.viewportSize();
record((await dialog.boundingBox()).height <= viewport.height, `the dialog fits the window (${Math.round((await dialog.boundingBox()).height)}px of ${viewport.height})`);
record(beside.y + beside.height >= fields.y, 'the guide runs down beside the fields, not just a strip at the top');
// Its text stays inside it, scrolling there - not running out of the box and over the buttons below.
const contained = await guide.evaluate((element) => {
  const box = element.getBoundingClientRect();
  const text = element.querySelector('div').getBoundingClientRect();
  return { scrolls: element.scrollHeight > element.clientHeight && getComputedStyle(element).overflowY === 'auto', boxBottom: box.bottom, textBottom: text.bottom };
});
const buttons = await dialog.getByRole('button', { name: 'Test Connection' }).boundingBox();
record(contained.scrolls && beside.y + beside.height <= buttons.y, `a long guide scrolls inside its box, which ends above the buttons (${JSON.stringify(contained)})`);
const formColumn = await dialog.locator('#workspace-connection-name').evaluate((input) => input.closest('form').querySelector('div[class*="fields"]').getBoundingClientRect().height);
record(Math.abs(beside.height - formColumn) < 4, `it starts as tall as the form beside it (${Math.round(beside.height)} vs ${Math.round(formColumn)}px)`);
const gap = async () => (await dialog.getByText('Custom Headers').boundingBox()).y - (await dialog.locator('#workspace-connection-name').boundingBox()).y;
const headersBefore = await gap();
// And its corner drags it taller, for somebody who wants more of it on screen at once.
await page.mouse.move(beside.x + beside.width - 3, beside.y + beside.height - 3);
await page.mouse.down();
await page.mouse.move(beside.x + beside.width - 3, beside.y + beside.height + 120, { steps: 10 });
await page.mouse.up();
const dragged = (await guide.boundingBox()).height;
record(dragged > beside.height + 80, `dragging its corner makes it taller (${Math.round(beside.height)} -> ${Math.round(dragged)}px)`);
// Dragged up, it stops at the form's height: it only grows.
const grown = await guide.boundingBox();
await page.mouse.move(grown.x + grown.width - 3, grown.y + grown.height - 3);
await page.mouse.down();
await page.mouse.move(grown.x + grown.width - 3, grown.y + 150, { steps: 10 });
await page.mouse.up();
const shrunk = (await guide.boundingBox()).height;
record(Math.abs(shrunk - beside.height) < 4, `dragged up, it stops at the form's height (${Math.round(shrunk)} vs ${Math.round(beside.height)}px)`);
const headersAfter = await gap();
// Measured from the Name box, since a taller dialog is centred again in the window.
record(Math.abs(headersAfter - headersBefore) < 2, `the form stays as it was beside it - Custom Headers did not move down (${Math.round(headersBefore)} -> ${Math.round(headersAfter)}px below Name)`);
const shape = await guide.evaluate((element) => {
  const paragraph = [...element.querySelectorAll('p')].find((p) => p.textContent.includes('add-on'));
  return { breaks: paragraph ? paragraph.querySelectorAll('br').length : -1 };
});
record(shape.breaks === 0, `the guide's wrapped lines are one paragraph (${shape.breaks} breaks)`);

// Test: off until there is an address, then asks with what is typed.
const test = dialog.getByRole('button', { name: 'Test Connection' });
record(await test.isDisabled(), 'Test waits for an address');
await dialog.locator('#workspace-connection-url').fill('http://localhost:8765');
record(await test.isEnabled(), 'with an address and no name yet, Test can be pressed');
await test.click();
const result = dialog.getByTestId('connection-draft-check');
await result.waitFor({ timeout: 5_000 }).catch(() => undefined);
record(
  sent.length === 1 && sent[0]?.pluginType === 'cards/deck' && sent[0]?.url === 'http://localhost:8765' && sent[0]?.type === 'HTTP',
  `Test sends the connection as typed (${JSON.stringify(sent[0])})`,
);
record(/Connected: Deck server 6/.test((await result.textContent().catch(() => '')) ?? ''), 'and says what the check found');

// A failure reads as one, and editing the address takes an answer away that no longer describes the form.
answer = { status: 'FAILED', message: 'that is a login page, not a deck server' };
await test.click();
await page.waitForTimeout(300);
const failed = await result.evaluate((element) => ({ text: element.textContent, colour: getComputedStyle(element).color }));
const passedColour = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--color-success').trim());
record(/Failed: that is a login page/.test(failed.text) && failed.colour !== passedColour, `a failed check reads as failed (${failed.text})`);
await dialog.locator('#workspace-connection-url').fill('http://localhost:8766');
await page.waitForTimeout(200);
record((await result.count()) === 0, 'changing the address clears the old answer');
record(created === 0, 'testing added nothing');

// A kind with a default address: the URL is marked optional, and Test asks with it left empty for the server to fill.
await dialog.locator('#workspace-connection-type').selectOption('cards/local');
await dialog.locator('#workspace-connection-url').fill('');
const urlLabel = (await dialog.locator('label[for="workspace-connection-url"]').innerText()).trim();
record(/optional/i.test(urlLabel), `the URL is marked optional where the kind has an address of its own (${urlLabel})`);
await page.waitForTimeout(150);
record(await test.isEnabled(), 'with the URL left empty, Test can be pressed');
await test.click();
await page.waitForTimeout(300);
record(sent.at(-1)?.pluginType === 'cards/local' && sent.at(-1)?.url === '', `and sends it empty, for the server to fill (${JSON.stringify(sent.at(-1))})`);
// The browser must not refuse the empty box either: Add is a form submit, and a required field stops it before any code runs.
const valid = await dialog.locator('#workspace-connection-url').evaluate((input) => input.checkValidity());
record(valid, 'the empty URL passes the form validation, so Add Connection is not stopped by the browser');

await finish(browser);
