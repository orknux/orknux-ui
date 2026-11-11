/**
 * The quick chat's conversation is the server's, not the page's.
 *
 * The panel held what was said in the page and waited on one request for the
 * answer, so a reload, a closed tab or a server restart lost both: the panel
 * opened empty and the answer being worked out went nowhere. Now each question
 * is kept and answered on the server, and the panel opens on what it keeps -
 * so what is asserted is what is drawn when the page comes back:
 *
 *  - the conversation the server holds, question and answer;
 *  - a question still being answered, waited for again and its answer drawn
 *    when it comes, with nobody asking it a second time;
 *  - and New conversation, which puts it away on the server too.
 *
 * The server's half - answered with nobody waiting, asked again after a
 * restart - is the suite's (QuickChatAsksTest). Here the server is stood in for
 * by routes, so no model is asked and nothing alice has said is touched.
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
/* What the server keeps: a question answered, and a second one still being answered. */
let thread = {
  messages: [
    { role: 'user', content: 'Which workflow failed?' },
    { role: 'assistant', content: 'The nightly sync, at two.' },
    { role: 'user', content: 'Why did it fail?' },
  ],
  pending: '77',
};
let asksSent = 0;
let cleared = 0;
let answerNow = false;

try {
  await page.route('**/quick-chat/thread', (route) => {
    if (route.request().method() === 'DELETE') {
      cleared++;
      thread = { messages: [] };
      return route.fulfill(json({ cleared: true }));
    }
    return route.fulfill(json(thread));
  });
  await page.route('**/quick-chat/asks', (route) => {
    asksSent++;
    return route.abort();
  });
  await page.route('**/quick-chat/asks/77?**', (route) =>
    route.fulfill(json(answerNow ? { id: '77', status: 'ANSWERED', answer: 'Its token had expired.' } : { id: '77', status: 'WAITING' })));

  await page.goto(`${BASE}/workspace/${WORKSPACE}/agents`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ask AI' }).last().click();
  const panel = page.getByTestId('quick-chat-panel');
  await panel.getByText('Why did it fail?').waitFor({ timeout: 5_000 }).catch(() => undefined);

  const drawn = async () => ((await panel.textContent()) ?? '');
  const first = await drawn();
  record(
    first.includes('Which workflow failed?') && first.includes('The nightly sync, at two.') && first.includes('Why did it fail?'),
    'the panel opens on the conversation the server keeps, question and answer',
  );
  record(await panel.getByTestId('quick-chat-welcome').count() === 0, 'rather than on the greeting of an empty one');
  record(
    await panel.getByRole('button', { name: 'Stop', exact: true }).isVisible().catch(() => false),
    'the question still being answered is waited for again, with Stop offered',
  );

  answerNow = true;
  await panel.getByText('Its token had expired.').waitFor({ timeout: 35_000 }).catch(() => undefined);
  record((await drawn()).includes('Its token had expired.'), 'and its answer is drawn when the server has it');
  record(asksSent === 0, `without the question being asked again (${asksSent} sent)`);

  await panel.getByTestId('quick-chat-new').click();
  await panel.getByTestId('quick-chat-welcome').waitFor({ timeout: 5_000 }).catch(() => undefined);
  record(cleared === 1, `New conversation puts it away on the server (${cleared} cleared)`);
  record(await panel.getByTestId('quick-chat-welcome').count() === 1 && !(await drawn()).includes('nightly sync'), 'and the panel starts afresh');
} finally {
  await graphql(SET, { w: WORKSPACE, id: had }).catch(() => undefined);
}
await finish(browser);
