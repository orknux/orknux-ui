/**
 * A file dropped on the chat is attached, as the attach button attaches one.
 *
 * The chat had no drop handling, so a dropped file was the browser's: it
 * opened the picture in place of the chat, and in the desktop app replaced the
 * whole window with it. Now dragging files over the conversation says it will
 * take them, and letting go uploads them beside the message being written.
 *
 * The upload is answered here and the installation is said to allow
 * attachments, so the check needs neither; it makes one chat of its own and
 * deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz chat drop';

const sweep = async () => {
  const { workspaceChats } = await graphql(
    `query($w: ID!) { workspaceChats(workspaceId: $w, size: 200) { content { id title } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceChats: { content: [] } }));
  for (const old of workspaceChats.content.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

let uploaded = 0;
/** The names each upload carried, read off the multipart body. */
const carried = [];
try {
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
  });

  await page.route('**/graphql', async (route) => {
    const sent = route.request().postData() ?? '';
    if (!sent.includes('attachmentsEnabled')) return route.continue();
    const answered = await route.fetch();
    const json = await answered.json();
    const allow = (node) => {
      if (node === null || typeof node !== 'object') return;
      if ('attachmentsEnabled' in node) node.attachmentsEnabled = true;
      Object.values(node).forEach(allow);
    };
    allow(json);
    return route.fulfill({ response: answered, json });
  });
  await page.route(`**/api/workspaces/${WORKSPACE}/attachments`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    uploaded += 1;
    const names = [...(route.request().postData() ?? '').matchAll(/filename="([^"]+)"/g)].map((match) => match[1]);
    carried.push(names);
    const types = { 'dropped.png': 'image/png', 'notes.pdf': 'application/pdf', 'log.txt': 'text/plain' };
    return route.fulfill({
      json: { attachments: names.map((name, at) => ({ id: `dropped-${uploaded}-${at}`, filename: name, contentType: types[name] ?? 'application/octet-stream', sizeBytes: 4 })) },
    });
  });

  await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Type a message/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);

  // A drag carrying a file, as the operating system hands one to the page.
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'dropped.png', { type: 'image/png' }));
    return data;
  });
  const chat = page.locator('[data-testid="chat-drop-zone"]');
  const target = page.getByPlaceholder(/Type a message/);
  await target.dispatchEvent('dragenter', { dataTransfer: transfer });
  await target.dispatchEvent('dragover', { dataTransfer: transfer });
  await page.waitForTimeout(150);
  record((await chat.count()) === 1, 'dragging a file over the chat says it will take it');

  await target.dispatchEvent('drop', { dataTransfer: transfer });
  await page.waitForTimeout(800);
  record(uploaded === 1, `letting go uploads it (${uploaded} upload)`);
  record((await page.getByTitle('Open dropped.png').count()) >= 1, 'and it waits beside the message, as an attached file does');
  record((await chat.count()) === 0, 'and the drop zone goes');
  record(page.url().includes(`/chat/${started.startChat.id}`), 'the page is still the chat, not the dropped file');

  // Any kind of file, and several at once: a PDF and a text file in one drop.
  const documents = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.items.add(new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }));
    data.items.add(new File(['started'], 'log.txt', { type: 'text/plain' }));
    return data;
  });
  await target.dispatchEvent('dragover', { dataTransfer: documents });
  await target.dispatchEvent('drop', { dataTransfer: documents });
  await page.waitForTimeout(800);
  record(
    uploaded === 2 && JSON.stringify(carried[1]) === JSON.stringify(['notes.pdf', 'log.txt']),
    `a PDF and a text file dropped together go up in one upload (${JSON.stringify(carried[1])})`,
  );
  const composer = page.locator('form').filter({ has: page.getByPlaceholder(/Type a message/) });
  const shown = await composer.innerText();
  record(/notes\.pdf/.test(shown) && /log\.txt/.test(shown) && /dropped\.png/.test(shown), 'all three wait beside the message');
} finally {
  await sweep();
}

await finish(browser);
