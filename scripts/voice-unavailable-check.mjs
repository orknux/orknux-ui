/**
 * Voice mode is always on the chat's bar. Where the workspace has no speech or
 * no transcription model it is drawn off, and hovering it says which model is
 * missing and links to where it is chosen. Checked with neither, the case a new
 * workspace is in.
 *
 * It used to vanish instead, and a button that is simply not there reads as a
 * product without voice. The workspace's answer is rewritten in the browser to
 * say it has neither model, so the check changes nothing on the server; it
 * makes one chat under a name of its own and deletes it again.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 900 } });
const PREFIX = 'zz voice unavailable';
// Whether the workspace, as the page reads it, has chosen to hide the button - flipped for the last half.
let hideVoice = false;

const sweep = async () => {
  const { workspaceChats } = await graphql(
    `query($w: ID!) { workspaceChats(workspaceId: $w, size: 200) { content { id title } } }`,
    { w: WORKSPACE },
  ).catch(() => ({ workspaceChats: { content: [] } }));
  for (const old of workspaceChats.content.filter((one) => (one.title ?? '').startsWith(PREFIX))) {
    await graphql(`mutation($id: ID!) { deleteChat(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
};

try {
  const started = await graphql(`mutation($input: StartChatInput!) { startChat(input: $input) { id } }`, {
    input: { workspaceId: WORKSPACE, title: `${PREFIX} ${Date.now()}` },
  });

  // The workspace, as this page reads it, with neither model - whatever the server holds.
  await page.route('**/graphql', async (route) => {
    const sent = route.request().postData() ?? '';
    if (!sent.includes('speechModelId')) return route.continue();
    const answered = await route.fetch();
    const body = await answered.json();
    const strip = (node) => {
      if (Array.isArray(node)) return node.forEach(strip);
      if (node === null || typeof node !== 'object') return;
      if ('speechModelId' in node) node.speechModelId = null;
      if ('transcriptionModelId' in node) node.transcriptionModelId = null;
      if ('voiceButtonHidden' in node) node.voiceButtonHidden = hideVoice;
      Object.values(node).forEach(strip);
    };
    strip(body);
    return route.fulfill({ response: answered, json: body });
  });

  await page.goto(`${BASE}/chat/${started.startChat.id}`, { waitUntil: 'domcontentloaded' });
  const off = page.getByTestId('voice-unavailable');
  const shown = await off.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
  record(shown && (await off.getAttribute('aria-disabled')) === 'true', 'with no voice models, voice mode is still on the bar, drawn off');

  await off.hover();
  const note = page.locator('#voice-why');
  await note.waitFor({ timeout: 5_000 }).catch(() => undefined);
  const says = (await note.textContent().catch(() => '')) ?? '';
  record(/transcription model and a speech model/.test(says), `hovering it names both missing models (${says.trim()})`);
  const link = note.locator('a');
  const href = (await link.count()) === 1 ? await link.getAttribute('href') : null;
  record(href !== null && href.endsWith(`/workspace/${WORKSPACE}/settings#transcription-model`), `and links to where the first is chosen (${href})`);

  // The note can be reached the way a hand reaches it: the pointer travels up from the button, across the gap, onto the link.
  const from = await off.boundingBox();
  const to = await link.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 25 });
  await page.waitForTimeout(400);
  record((await note.count()) === 1, 'moving the pointer up onto the link keeps the note open');
  await link.click();
  await page.waitForURL(/\/settings/, { timeout: 10_000 }).catch(() => undefined);
  record(page.url().includes(`/workspace/${WORKSPACE}/settings#transcription-model`), `the link opens workspace settings there (${page.url()})`);

  // A workspace that chose to hide it gets no button at all, drawn off or otherwise.
  hideVoice = true;
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByPlaceholder(/Type a message/).waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  const left = await page.getByTestId('voice-unavailable').count() + await page.getByRole('button', { name: 'Enter voice mode' }).count();
  record(left === 0, `a workspace that hides it shows no voice button (${left})`);
} finally {
  await sweep();
}

await finish(browser);
