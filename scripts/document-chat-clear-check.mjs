/**
 * The document editor's conversation can be cleared, and keeps a compaction.
 *
 * The chat down the right of a document only ever grew: there was no way to
 * start it again short of closing the tab, and it was sent up whole each time,
 * so a long one grew until the model refused it. Now the server compacts it as
 * the workspace's chats are compacted and says so, and the editor keeps the
 * shorter conversation. Asserted on what is drawn:
 *
 *  - a compaction leaves the summary, marked as one, and the turns kept - and
 *    the next question is sent with the summary rather than the older turns;
 *  - Clear conversation empties it, back to the welcome, and it stays empty
 *    after a reload.
 *
 * The model is stood in for by routes, so nothing is asked. Makes its own
 * document and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';
import { standInForDocumentAsks } from './suite/editor-asks.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 900 } });
const stamp = Date.now().toString(36);
const STUB = {
  id: '97001', providerId: '1', workspaceId: WORKSPACE, providerName: 'Stub', name: 'Stub chat', modelId: 'stub-chat', kind: 'CHAT', enabled: true,
  contextWindow: null, maxOutput: null, parallelToolCalls: null,
};

const made = await graphql('mutation ($w: ID!, $n: String!) { createDocument(workspaceId: $w, name: $n) { id } }', { w: WORKSPACE, n: `Clear chat ${stamp}` });
const id = made.createDocument.id;
const sent = [];

try {
  await standInForDocumentAsks(page, (body) => {
    sent.push(body.messages ?? []);
    // The third question is the one the server compacts: the two before it go to a summary.
    const compacted = sent.length === 3 ? { summary: 'They agreed on a launch note in three parts.', replaced: 4, kept: 1 } : null;
    return { answer: `Answer ${sent.length}.`, compacted };
  });
  await page.route('**/graphql', async (route) => {
    const body = route.request().postDataJSON() ?? {};
    const query = body.query ?? '';
    if (query.includes('models(')) {
      const json = await (await route.fetch()).json();
      const list = json?.data?.models;
      if (Array.isArray(list) && !list.some((one) => one.kind === 'CHAT' && one.enabled !== false)) list.push(STUB);
      return route.fulfill({ json });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/workspace/${WORKSPACE}/design/documents/${id}`, { waitUntil: 'domcontentloaded' });
  const input = page.getByTestId('document-chat-input');
  await input.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  const answers = page.locator('[data-testid="document-chat-message"][data-role="assistant"]');
  for (const [n, question] of ['First question', 'Second question', 'Third question'].entries()) {
    await input.fill(question);
    await page.getByTestId('document-chat-send').click();
    await page.getByText(`Answer ${n + 1}.`).waitFor({ timeout: 10_000 });
  }

  const turns = page.getByTestId('document-chat-message');
  const drawn = await turns.allTextContents();
  record(
    (await page.getByTestId('document-chat-summarised').count()) === 1,
    'a compaction is drawn as a summary, marked as standing in for older messages',
  );
  record(
    drawn.length === 3 && drawn[0].includes('They agreed on a launch note') && drawn[1].includes('Third question') && drawn[2].includes('Answer 3.'),
    `the summary, the turn kept and the answer are what is left (${drawn.length} turns)`,
  );
  record(!drawn.join(' ').includes('First question'), 'the older turns are gone from the conversation');

  await input.fill('Fourth question');
  await page.getByTestId('document-chat-send').click();
  await page.getByText('Answer 4.').waitFor({ timeout: 10_000 });
  const fourth = sent[3]?.map((one) => one.content) ?? [];
  record(
    fourth[0] === 'They agreed on a launch note in three parts.' && !fourth.includes('First question') && fourth.length === 4,
    `the next question goes up with the summary instead of the older turns (${fourth.length} turns)`,
  );

  const clear = page.getByTestId('document-chat-clear');
  record(await clear.isVisible().catch(() => false), 'Clear conversation is offered over a conversation');
  await clear.click();
  record((await turns.count()) === 0, 'pressing it empties the conversation');
  record(await page.getByTestId('document-welcome').isVisible().catch(() => false), 'back to the welcome');
  record((await clear.count()) === 0, 'and the button goes with it');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await input.waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  record((await turns.count()) === 0, 'it stays cleared after a reload');
  record((await answers.count()) === 0, 'with no answer left over');
} finally {
  await graphql('mutation ($id: ID!) { deleteDocument(id: $id) }', { id }).catch(() => undefined);
}
await finish(browser);
