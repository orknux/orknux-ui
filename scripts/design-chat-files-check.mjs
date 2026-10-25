/**
 * Files dropped on the chat down the right of an editor are attached and sent
 * with the turn, in the document, wireframe and diagram editors alike.
 *
 * The three chats took words only, so a file dragged onto one was the
 * browser's to handle: it opened the file in place of the editor. Now
 * dragging files over the conversation says it will take them, letting go
 * uploads them into a chip above the box - which can be taken off again - and
 * Send carries their ids in the ask mutation, after which the chip moves into
 * the sent message. Dropping or picking a file puts the focus in the text box,
 * caret at the end, so the words about it come next.
 *
 * The upload and the model's answer are answered here, the installation is
 * said to allow attachments and the workspace is given a chat model where it
 * has none, so the check needs no model and stores no file. Makes its own
 * document, wireframe and diagram and removes them.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });
const stamp = Date.now().toString(36);

const made = {
  document: (await graphql('mutation ($w: ID!, $n: String!) { createDocument(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `zzChatFiles ${stamp}` })).createDocument.id,
  wireframe: (await graphql('mutation ($w: ID!, $n: String!) { createWireframe(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `zzChatFiles ${stamp}` })).createWireframe.id,
  diagram: (await graphql('mutation ($w: ID!, $n: String!) { createDiagram(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `zzChatFiles ${stamp}` })).createDiagram.id,
};
const addresses = {
  document: `${BASE}/workspace/${WORKSPACE}/design/documents/${made.document}`,
  wireframe: `${BASE}/workspace/${WORKSPACE}/design/wireframes/${made.wireframe}`,
  diagram: `${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.diagram}`,
};
const mutations = { document: 'askDocument', wireframe: 'askWireframe', diagram: 'askDiagram' };

/** Whether the editor's chat box has the focus, and where its caret is. */
const focused = (editor) => page.getByTestId(`${editor}-chat-input`).evaluate((field) => ({
  focused: document.activeElement === field,
  caret: field.selectionStart === field.selectionEnd ? field.selectionStart : -1,
}));

let uploaded = 0;
/** What each ask mutation was sent, by editor. */
const asked = {};

try {
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    const editor = Object.keys(mutations).find((one) => query.includes(`${mutations[one]}(`));
    if (editor !== undefined) {
      asked[editor] = body.variables;
      return route.fulfill({ json: { data: { [mutations[editor]]: { answer: 'Read them.', changed: false, [editor]: null } } } });
    }
    if (!query.includes('attachmentsEnabled') && !query.includes('query Models(')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const allow = (node) => {
      if (node === null || typeof node !== 'object') return;
      if ('attachmentsEnabled' in node) node.attachmentsEnabled = true;
      Object.values(node).forEach(allow);
    };
    allow(json);
    const models = json?.data?.models;
    if (Array.isArray(models) && !models.some((one) => one.kind === 'CHAT' && one.enabled !== false)) {
      models.push({ id: 'design-chat-files-model', name: 'Stub', providerName: 'Check', kind: 'CHAT', enabled: true });
    }
    return route.fulfill({ response: answered, json });
  });
  await page.route(`**/api/workspaces/${WORKSPACE}/attachments`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    uploaded += 1;
    const names = [...(route.request().postData() ?? '').matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
    return route.fulfill({
      json: { attachments: names.map((name, at) => ({ id: `${uploaded}0${at}`, filename: name, contentType: name.endsWith('.png') ? 'image/png' : 'text/plain', sizeBytes: 4 })) },
    });
  });

  for (const editor of ['document', 'wireframe', 'diagram']) {
    await page.goto(addresses[editor], { waitUntil: 'domcontentloaded' });
    const input = page.getByTestId(`${editor}-chat-input`);
    await input.waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1000);

    const transfer = await page.evaluateHandle((name) => {
      const data = new DataTransfer();
      data.items.add(new File(['the notes'], name, { type: 'text/plain' }));
      return data;
    }, `${editor}-notes.txt`);
    await input.dispatchEvent('dragenter', { dataTransfer: transfer });
    await input.dispatchEvent('dragover', { dataTransfer: transfer });
    await page.waitForTimeout(150);
    record((await page.getByTestId(`${editor}-chat-drop-zone`).count()) === 1, `${editor}: dragging a file over the chat says it will take it`);

    // Something already typed, and the focus elsewhere, so the drop has to bring it back with the caret at the end.
    await input.fill('Read these');
    await input.evaluate((field) => field.blur());
    const before = uploaded;
    await input.dispatchEvent('drop', { dataTransfer: transfer });
    await page.getByTestId(`${editor}-chat-attachment`).first().waitFor({ timeout: 5_000 }).catch(() => undefined);
    record(uploaded === before + 1, `${editor}: letting go uploads it (${uploaded - before} upload)`);
    const chips = page.getByTestId(`${editor}-chat-attachment`);
    record((await chips.count()) === 1 && (await chips.first().innerText()).includes(`${editor}-notes.txt`), `${editor}: it waits in a chip above the box`);
    record((await page.getByTestId(`${editor}-chat-drop-zone`).count()) === 0, `${editor}: the drop zone goes`);
    record(page.url() === addresses[editor], `${editor}: the page is still the editor, not the dropped file`);
    const focusAfterDrop = await focused(editor);
    record(focusAfterDrop.focused && focusAfterDrop.caret === 'Read these'.length, `${editor}: the drop focuses the text box with the caret at the end (${JSON.stringify(focusAfterDrop)})`);

    // A second file picked with the paperclip, and taken off again.
    if (!record((await page.getByTestId(`${editor}-chat-attach`).count()) === 1, `${editor}: the composer has an attach button`)) continue;
    await input.evaluate((field) => field.blur());
    await page.getByTestId(`${editor}-chat-file-input`).setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: Buffer.from([137, 80, 78, 71]) });
    await page.waitForTimeout(600);
    record((await chips.count()) === 2, `${editor}: a file picked with the attach button is a second chip (${await chips.count()})`);
    const focusAfterPick = await focused(editor);
    record(focusAfterPick.focused && focusAfterPick.caret === 'Read these'.length, `${editor}: a picked file focuses the text box too (${JSON.stringify(focusAfterPick)})`);
    await chips.filter({ hasText: 'second.png' }).getByTestId(`${editor}-chat-attachment-remove`).click();
    record((await chips.count()) === 1, `${editor}: removing a chip takes it off`);

    const kept = (await page.getByTestId(`${editor}-chat-attachment`).first().innerText()).trim();
    await input.fill('What do these notes say?');
    if (await page.getByTestId(`${editor}-chat-send`).isDisabled()) {
      record(false, `${editor}: Send is held back (${await page.getByTestId(`${editor}-chat-model`).textContent()})`);
      continue;
    }
    await page.getByTestId(`${editor}-chat-send`).click();
    await page.getByText('Read them.').first().waitFor({ timeout: 10_000 }).catch(() => undefined);
    const last = asked[editor]?.messages?.at(-1);
    record(
      last !== undefined && last.content === 'What do these notes say?' && JSON.stringify(last.attachmentIds) === JSON.stringify([`${before + 1}00`]),
      `${editor}: the ask carries the file's id with the turn (${JSON.stringify(last)})`,
    );
    record((await chips.count()) === 0, `${editor}: the chip leaves the composer once sent`);
    const sent = page.getByTestId(`${editor}-chat-message-file`);
    record((await sent.count()) === 1 && (await sent.first().innerText()).includes(kept.replace(/×$/, '').trim()), `${editor}: and is shown under the message it went with`);
  }
} finally {
  await page.unroute('**/graphql').catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id: made.document }).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteWireframe(id: $id) }', { id: made.wireframe }).catch(() => undefined);
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.diagram }).catch(() => undefined);
}

await finish(browser);
