/**
 * The ports an agent asked to expose: a panel below the boxes, and the question
 * in the transcript.
 *
 * Nothing opens until a person allows it. The panel is where every mapping is
 * managed at any time - a pending one allowed, an open one disabled, any of
 * them removed - and each row says whether something answers on it, with the
 * same green and orange dots as the box rows, and which box it is on, as the
 * box rows' label chip. The question the agent's request put in the
 * conversation is drawn among the transcript's lines where it was asked, with
 * a button per option, and gives way to its outcome once answered.
 *
 * Stubbed: a real mapping needs an agent, a box and a person, and what the page
 * draws and sends given what the server holds is a fact about this page alone.
 * BoxPortsTest is the server half.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1200 } });

const AT = '2026-10-11T09:00:00Z';
const LATER = '2026-10-11T09:05:00Z';
const ASKED = '2026-10-11T09:02:00Z';

const EVENTS = [
  { id: 1, kind: 'USER', actor: 'Planner node', content: 'Serve the UI.', result: null, millis: null, at: AT },
  { id: 2, kind: 'AGENT', actor: 'Builder', content: 'It is up on 3000.', result: null, millis: null, at: LATER },
];

const port = (id, state, alive, extra = {}) => ({
  id,
  sessionBoxId: '7',
  boxName: 'remote',
  boxLabel: 'michjak-pc',
  port: Number(id) + 2999,
  reason: 'the dev UI',
  state,
  url: state === 'ENABLED' ? `http://localhost:4900${id}/` : null,
  note: null,
  requestedBy: 'Builder',
  createdAt: ASKED,
  decidedAt: null,
  decidedBy: null,
  alive,
  checkedAt: alive ? LATER : null,
  ...extra,
});

let ports = [port('1', 'ENABLED', true), port('2', 'PENDING', false), port('3', 'DISABLED', false)];
let request = {
  id: '41',
  kind: 'box.port',
  askedBy: 'Builder',
  question: 'Builder wants to expose port 3001 of box session 7 on remote: the dev UI',
  options: [
    { id: 'allow', label: 'Allow', style: 'primary' },
    { id: 'reject', label: 'Reject', style: 'danger' },
  ],
  chosen: null,
  chosenBy: null,
  chosenAt: null,
  outcome: null,
  createdAt: ASKED,
};

const sent = [];

const session = () => ({
  id: '9003',
  key: 'zz-ports-check',
  keyPrefix: 'zz',
  workspaceId: WORKSPACE,
  eventCount: EVENTS.length,
  createdAt: AT,
  lastEventAt: LATER,
  notes: [{ id: '11', note: 'Serving on 3000', writtenBy: 'Builder', writtenAt: AT }],
});

const answer = (route, data) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  for (const mutation of ['enableBoxPort', 'disableBoxPort', 'deleteBoxPort', 'answerRequest']) {
    if (body.includes(`${mutation}(`)) {
      const variables = JSON.parse(body).variables ?? {};
      sent.push({ mutation, ...variables });
      if (mutation === 'answerRequest') {
        request = { ...request, chosen: variables.option, chosenBy: 'alice', outcome: 'Allowed - http://localhost:49002/' };
        return answer(route, { answerRequest: request });
      }
      if (mutation === 'deleteBoxPort') return answer(route, { deleteBoxPort: variables.id });
      const one = ports.find((each) => each.id === variables.id);
      return answer(route, { [mutation]: one });
    }
  }
  if (body.includes('sessionBoxPorts')) return answer(route, { sessionBoxPorts: ports });
  if (body.includes('sessionRequests')) return answer(route, { sessionRequests: [request] });
  if (body.includes('sessionTodos')) return answer(route, { sessionTodos: [] });
  if (body.includes('sessionBoxes')) return answer(route, { sessionBoxes: [] });
  if (body.includes('sessionScratchpads')) return answer(route, { sessionScratchpads: [] });
  if (body.includes('llmSessionWriting')) return answer(route, { llmSessionWriting: null });
  if (body.includes('llmSessionEvents')) {
    return answer(route, { llmSessionEvents: { totalElements: EVENTS.length, totalPages: 1, content: EVENTS } });
  }
  if (body.includes('llmSession(')) return answer(route, { llmSession: session() });
  return route.continue();
});

await page.goto(`${BASE}/workspace/${WORKSPACE}/sessions/9003`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-session-port]', { timeout: 20_000 }).catch(() => {});

/* Directly below the boxes and above the to-do list, in the same column. */
const placed = await page.evaluate(() => {
  const boxes = document.querySelector('[data-session-boxes]')?.getBoundingClientRect();
  const ports = document.querySelector('[data-session-ports]')?.getBoundingClientRect();
  const todos = document.querySelector('[data-session-todos]')?.getBoundingClientRect();
  return boxes && ports && todos
    ? {
        belowBoxes: ports.top >= boxes.bottom - 1,
        aboveTodos: ports.bottom <= todos.top + 1,
        sameColumn: Math.abs(ports.left - boxes.left) < 1,
      }
    : null;
});
record(
  placed?.belowBoxes === true && placed.aboveTodos && placed.sameColumn,
  `the Ports panel sits below Boxes and above To-do, in the same column (${JSON.stringify(placed)})`,
);

const rows = await page.evaluate(() =>
  [...document.querySelectorAll('[data-session-port]')].map((row) => ({
    id: row.getAttribute('data-session-port'),
    state: row.getAttribute('data-session-port-state'),
    dot: getComputedStyle(row.querySelector('[data-session-port-dot]')).backgroundColor,
    label: row.querySelector('[data-session-port-label]')?.textContent?.trim() ?? null,
    url: row.querySelector('[data-session-port-url]')?.textContent?.trim() ?? null,
    stateLabel: row.querySelector('[data-session-port-state-label]')?.textContent?.trim() ?? null,
    enable: row.querySelector('[data-session-port-enable]')?.textContent?.trim() ?? null,
    disable: row.querySelector('[data-session-port-disable]') !== null,
    remove: row.querySelector('[data-session-port-delete]') !== null,
  })),
);
const green = rows.find((row) => row.id === '1')?.dot;
const orange = rows.find((row) => row.id === '2')?.dot;
record(rows.length === 3, `every mapping is a row (${rows.length})`);
record(green === 'rgb(63, 185, 80)' || (green !== undefined && green !== orange), `an answering port's dot is green (${green})`);
record(orange !== undefined && orange !== green && rows.find((row) => row.id === '3')?.dot === orange, `one not answering is orange (${orange})`);
record(rows.every((row) => row.label === 'michjak-pc'), `each row carries its box's label as a chip (${rows.map((row) => row.label).join(', ')})`);
record(rows[0]?.url === 'http://localhost:49001/', `an open port shows where it answers (${rows[0]?.url})`);
record(rows[1]?.stateLabel === 'Waiting for approval' && rows[1]?.enable === 'Allow', `a pending one waits, with Allow (${rows[1]?.stateLabel} / ${rows[1]?.enable})`);
record(rows[0]?.disable === true && rows[0]?.enable === null, 'an open one offers Disable, not Enable');
record(rows[2]?.enable === 'Enable' && rows.every((row) => row.remove), 'a disabled one offers Enable, and every one Delete');

await page.click('[data-session-port="2"] [data-session-port-enable]');
await page.waitForTimeout(400);
await page.click('[data-session-port="1"] [data-session-port-disable]');
await page.waitForTimeout(400);
await page.click('[data-session-port="3"] [data-session-port-delete]');
await page.waitForTimeout(400);
record(
  JSON.stringify(sent.map((one) => `${one.mutation}:${one.id}`)) === JSON.stringify(['enableBoxPort:2', 'disableBoxPort:1', 'deleteBoxPort:3']),
  `the three actions send their mutations (${JSON.stringify(sent.map((one) => `${one.mutation}:${one.id}`))})`,
);

/* The question, among the lines where it was asked: after the first, before the second. */
const question = await page.evaluate(() => {
  const card = document.querySelector('[data-interaction="41"]');
  if (card === null) return null;
  const lines = [...document.querySelectorAll('[class*="_transcript_"] [data-interaction], [class*="_transcript_"] [class*="_event_"]')];
  return {
    options: [...card.querySelectorAll('[data-interaction-option]')].map((one) => one.textContent?.trim()),
    text: card.querySelector('p')?.textContent ?? '',
    before: card.compareDocumentPosition(document.body.querySelector('[class*="_transcript_"]')?.lastElementChild ?? card),
    count: lines.length,
  };
});
record(question !== null && question.options.join('/') === 'Allow/Reject', `the question is in the transcript with its options (${question?.options?.join('/')})`);
const order = await page.evaluate(() => {
  const transcript = document.querySelector('[class*="_transcript_"]');
  const text = transcript?.textContent ?? '';
  return { serve: text.indexOf('Serve the UI.'), asked: text.indexOf('wants to expose port 3001'), up: text.indexOf('It is up on 3000.') };
});
record(order.serve >= 0 && order.serve < order.asked && order.asked < order.up, `it is drawn where it was asked, between the lines around it (${JSON.stringify(order)})`);

sent.length = 0;
await page.click('[data-interaction="41"] [data-interaction-option="allow"]');
await page.waitForTimeout(500);
record(sent[0]?.mutation === 'answerRequest' && sent[0]?.option === 'allow', `Allow answers the question (${JSON.stringify(sent[0])})`);
const outcome = (await page.locator('[data-interaction="41"] [data-interaction-outcome]').innerText().catch(() => '')).trim();
record(outcome.startsWith('Allowed - http://localhost:49002/'), `and its buttons give way to the outcome (${outcome})`);

await finish(browser);
