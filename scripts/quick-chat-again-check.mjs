/**
 * A quick chat question that went unanswered can be sent again with one click.
 *
 * When the model could not be reached, or the question was stopped, the
 * conversation ended on the question and an error, and the only way to ask it
 * again was to type it out a second time. Now a Send again button sits under
 * it. What is asserted is what is drawn and what is sent:
 *
 *  - the button is there under an unanswered question, and not under an answer;
 *  - pressing it sends that same question, in its own place rather than as a
 *    second copy under the first;
 *  - and once it is answered the button goes, and the question is drawn once.
 *
 * The server is stood in for by routes, so no model is asked and nothing alice
 * has said is touched.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const SET = 'mutation($w: ID!, $id: ID) { setWorkspaceQuickChatModel(workspaceId: $w, modelId: $id) { id } }';

const { models } = await graphql('query($w: ID!) { models(workspaceId: $w) { id kind } }', { w: WORKSPACE });
const chat = models.find((one) => one.kind === 'CHAT');
record(chat !== undefined, 'the workspace has a chat model to point the panel at');
if (chat === undefined) await finish(browser);
const had = (await graphql('query($w: ID!) { workspace(id: $w) { quickChatModelId } }', { w: WORKSPACE })).workspace.quickChatModelId;
await graphql(SET, { w: WORKSPACE, id: chat.id });

const json = (body) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
/* What the server keeps: an answered question, then one that failed. */
const thread = {
  messages: [
    { role: 'user', content: 'Which workflow failed?' },
    { role: 'assistant', content: 'The nightly sync, at two.' },
    { role: 'user', content: 'hi' },
  ],
  pending: null,
  error: 'Could not reach the model.',
};
const sent = [];

try {
  await page.route('**/quick-chat/thread', (route) => route.fulfill(json(thread)));
  await page.route('**/quick-chat/asks', (route) => {
    sent.push(route.request().postDataJSON());
    return route.fulfill(json({ id: '91', status: 'WAITING' }));
  });
  await page.route('**/quick-chat/asks/91?**', (route) =>
    route.fulfill(json({ id: '91', status: 'ANSWERED', answer: 'Hello! What can I look up?' })));

  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask AI' }).last().click();
  const panel = page.getByTestId('quick-chat-panel');
  await panel.getByText('Could not reach the model.').waitFor({ timeout: 5_000 }).catch(() => undefined);

  const again = panel.getByTestId('quick-chat-send-again');
  record(await again.isVisible().catch(() => false), 'Send again is offered under the question that went unanswered');
  const below = async () => {
    const question = await panel.getByText('hi', { exact: true }).boundingBox();
    const button = await again.boundingBox();
    return question !== null && button !== null && button.y > question.y;
  };
  record(await below(), 'below the question, not somewhere else in the panel');

  await again.click();
  await panel.getByText('Hello! What can I look up?').waitFor({ timeout: 10_000 }).catch(() => undefined);
  const messages = sent[0]?.messages ?? [];
  record(sent.length === 1, `pressing it asks once (${sent.length} sent)`);
  record(
    messages.length === 3 && messages[2].role === 'user' && messages[2].content === 'hi',
    `the same question, in its own place (${messages.map((one) => one.content).join(' | ')})`,
  );
  record(await panel.getByText('hi', { exact: true }).count() === 1, 'the question is drawn once, not twice');
  record(await panel.getByText('Hello! What can I look up?').isVisible().catch(() => false), 'its answer is drawn');
  record(await again.count() === 0, 'and Send again goes once it is answered');
  record(await panel.getByText('Could not reach the model.').count() === 0, 'with the error');
} finally {
  await graphql(SET, { w: WORKSPACE, id: had }).catch(() => undefined);
}
await finish(browser);
