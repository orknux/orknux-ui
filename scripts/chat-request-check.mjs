/**
 * A question an agent put to the person is drawn in the chat, with a button
 * for each of its options, and gives way to its outcome once answered.
 *
 * The first kind is a port an agent asked to expose - nothing opens until
 * somebody presses Allow - but the card is drawn from the request's own
 * options, so what is asserted is that: the buttons are the options, pressing
 * one sends that option, and the outcome replaces the buttons. A request that
 * was settled somewhere else, on the session page, shows that outcome too.
 *
 * Stubbed: the chat is a real one, given a session to hold the request, and the
 * request and its answer are answered here - no model has to ask anything.
 */
import { BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

/*
 * The conversation the requests sit in: a question, then an answer written
 * after both requests were asked. A request goes where it was asked - above that
 * answer - and not under the newest line for ever, which is where an answered
 * one used to stay.
 */
const T0 = new Date(Date.now() - 120_000).toISOString();
const ASKED = new Date(Date.now() - 60_000).toISOString();
const ANSWER = 'The port is open; here is what I found after it.';
const MESSAGES = [
  { role: 'user', content: 'Expose me a running instance.', actor: null, takes: [], thinking: null, thinkingMillis: null, at: T0 },
  // Undated, as the answer a page is still writing is: the present, after anything asked during it.
  { role: 'assistant', content: ANSWER, actor: 'Builder', takes: [], thinking: null, thinkingMillis: null, at: null },
];
let requests = [
  {
    id: '51',
    kind: 'box.port',
    askedBy: 'Builder',
    question: 'Builder wants to expose port 3000 of box session 7 on remote: the dev UI',
    options: [
      { id: 'allow', label: 'Allow', style: 'primary' },
      { id: 'reject', label: 'Reject', style: 'danger' },
    ],
    chosen: null,
    chosenBy: null,
    chosenAt: null,
    outcome: null,
    createdAt: ASKED,
  },
  {
    id: '52',
    kind: 'box.port',
    askedBy: 'Builder',
    question: 'Builder wants to expose port 8080 of box session 7 on remote',
    options: [
      { id: 'allow', label: 'Allow', style: 'primary' },
      { id: 'reject', label: 'Reject', style: 'danger' },
    ],
    chosen: 'settled',
    chosenBy: 'alice',
    chosenAt: ASKED,
    outcome: 'Disabled',
    createdAt: ASKED,
  },
];
const sent = [];

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('answerRequest(')) {
    const variables = JSON.parse(body).variables ?? {};
    sent.push(variables);
    requests = requests.map((one) =>
      one.id === variables.id
        ? { ...one, chosen: variables.option, chosenBy: 'alice', outcome: 'Allowed - http://localhost:49153/' }
        : one,
    );
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { answerRequest: requests.find((one) => one.id === variables.id) } }),
    });
  }
  if (body.includes('chatMessages(')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { chatMessages: MESSAGES } }) });
  }
  if (body.includes('sessionRequests(')) {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: { sessionRequests: requests } }) });
  }
  if (body.includes('chatSessions(')) {
    // A real chat, given a session to hold the requests in.
    const response = await route.fetch();
    const json = await response.json();
    for (const chat of json?.data?.chatSessions ?? []) if (chat.llmSessionId === null) chat.llmSessionId = '9100';
    return route.fulfill({ response, json });
  }
  return route.continue();
});

await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-interaction="51"]', { timeout: 20_000 }).catch(() => {});

const card = await page.evaluate(() => {
  const one = document.querySelector('[data-interaction="51"]');
  return one === null
    ? null
    : {
        question: one.querySelector('p')?.textContent ?? '',
        options: [...one.querySelectorAll('[data-interaction-option]')].map((button) => button.textContent?.trim()),
      };
});
record(card !== null && card.question.includes('wants to expose port 3000'), `the question is drawn in the chat (${card?.question})`);
record(card?.options.join('/') === 'Allow/Reject', `with a button per option (${card?.options?.join('/')})`);

const settled = (await page.locator('[data-interaction="52"] [data-interaction-outcome]').innerText().catch(() => '')).trim();
record(
  settled.startsWith('Disabled') && (await page.locator('[data-interaction="52"] [data-interaction-option]').count()) === 0,
  `one settled on the session page shows that outcome and no buttons (${settled})`,
);

/* Placed by when it was asked: below the question, above the answer written after it. */
const order = await page.evaluate((answer) => {
  const top = (element) => (element === null ? null : Math.round(element.getBoundingClientRect().top));
  const said = [...document.querySelectorAll('p, li, div')].find((one) => one.childElementCount === 0 && (one.textContent ?? '').includes(answer));
  return { answered: top(document.querySelector('[data-interaction="52"]')), answer: top(said ?? null) };
}, ANSWER);
record(
  order.answered !== null && order.answer !== null && order.answered < order.answer,
  `an answered request sits where it was asked, above the answer that came after it (${JSON.stringify(order)})`,
);

await page.click('[data-interaction="51"] [data-interaction-option="allow"]');
await page.waitForTimeout(600);
record(sent[0]?.id === '51' && sent[0]?.option === 'allow', `Allow sends that option (${JSON.stringify(sent[0])})`);
const outcome = (await page.locator('[data-interaction="51"] [data-interaction-outcome]').innerText().catch(() => '')).trim();
record(outcome.startsWith('Allowed - http://localhost:49153/'), `and the outcome replaces the buttons (${outcome})`);
record((await page.locator('[data-interaction="51"] [data-interaction-option]').count()) === 0, 'no button is left to press twice');

await finish(browser);
