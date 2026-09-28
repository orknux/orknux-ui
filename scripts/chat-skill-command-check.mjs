/**
 * A skill command typed in a chat is offered as it is typed.
 *
 * The server reads every word of a message that starts with the workspace's
 * command marker as a skill to switch on, anywhere in the message. Nobody
 * remembers the ids, so the composer offers them the way a slash offers the
 * chat's own commands - but after whatever marker this workspace uses, which
 * is a setting, so this check asks for it rather than assuming one.
 *
 * What is measured: typing the marker and part of a built-in skill's id in the
 * middle of a sentence draws a menu with that skill on it, Tab completes the
 * word in place and nothing else, and a plain word draws no menu.
 *
 * Makes a chat of its own and deletes it; changes no setting.
 */
import { BASE, WORKSPACE, open, drawn, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const { workspace, installationSettings } = await graphql(
  `query($w: ID!) {
     workspace(id: $w) { commandMarker commandMarkerDefault }
     installationSettings { commandMarker }
   }`,
  { w: WORKSPACE },
);
const MARKER = workspace?.commandMarker ?? workspace?.commandMarkerDefault ?? installationSettings.commandMarker;
console.log(`the marker here is ${JSON.stringify(MARKER)}`);

const started = await graphql('mutation($input: StartChatInput!) { startChat(input: $input) { id title } }', {
  input: { workspaceId: WORKSPACE, title: `zzSkillCommand ${Date.now()}` },
});
const CHAT = started.startChat.id;
console.log(`made chat ${started.startChat.title} (#${CHAT})`);

const clean = async () => {
  await graphql('mutation($id: ID!) { deleteChat(id: $id) }', { id: CHAT }).catch(() => undefined);
  await finish(browser);
};

await page.goto(`${BASE}/chat/${CHAT}`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, 'the chat'), 'the chat is on screen');

const box = page.locator('#chat-composer');
const there = await box
  .waitFor({ timeout: 20_000 })
  .then(() => true)
  .catch(() => false);
record(there, 'it has a box to type in');
if (!there) await clean();

const menu = page.locator('[role="listbox"][aria-label="Skills"]');

/* ------------------------------------------- a plain word opens nothing --- */

await box.click();
await box.fill('please talk like a cav');
await page.waitForTimeout(1_000);
record((await menu.count()) === 0, 'a word without the marker opens no menu');

/* ------------------------------------- the marker mid-sentence opens one -- */

const HEAD = 'please ';
const TAIL = ' about this';
await box.fill(`${HEAD}${TAIL}`);
// The caret goes between the two halves, so the word is typed in the middle.
await box.evaluate((node, at) => node.setSelectionRange(at, at), HEAD.length);
await box.pressSequentially(`${MARKER}cav`, { delay: 30 });

const opened = await menu
  .waitFor({ timeout: 10_000 })
  .then(() => true)
  .catch(() => false);
record(opened, 'the marker starting a word mid-sentence opens the skills');
if (!opened) await clean();

const rows = await menu.locator('[role="option"]').allInnerTexts();
console.log(`offered: ${JSON.stringify(rows)}`);
record(
  rows.some((one) => one.includes(`${MARKER}caveman`)),
  `with a row for the built-in caveman, written ${MARKER}caveman`,
);
const box1 = await menu.boundingBox();
record(box1 !== null && box1.height > 0, `and the menu is drawn (${box1?.height ?? 0}px tall)`);

/* ------------------------------------------------ Tab completes in place - */

await box.press('Tab');
const completed = await box.inputValue();
console.log(`after Tab: ${JSON.stringify(completed)}`);
record(
  completed === `${HEAD}${MARKER}caveman${TAIL}`,
  `Tab writes ${MARKER}caveman in place of the word and leaves the rest alone`,
);
const caret = await box.evaluate((node) => node.selectionStart);
record(
  caret === `${HEAD}${MARKER}caveman `.length,
  `and the caret is after the completed word (${caret})`,
);
record((await menu.count()) === 0, 'and the menu is gone');
record(
  await box.evaluate((node) => document.activeElement === node),
  'and the box still has the focus, so Tab did not move it away',
);

await clean();
