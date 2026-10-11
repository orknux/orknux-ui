/**
 * The session page's right column carries what the agent is keeping for itself:
 * its to-do list, under the boxes, and its notes under that.
 *
 * Both are the agent's own working state - the plan it lays out with todo_add
 * and ticks off with todo_complete, and the lines it writes with note_to_self -
 * and both are read-only here. What is asserted is what is drawn: the panels
 * sit in that order down the column, the to-dos keep the agent's order with the
 * open ones first, a done one is marked done and struck through, a note on an
 * item is under it, the notes are in the order the agent is handed them, and a
 * session with nothing in either says so rather than drawing an empty card.
 *
 * Stubbed rather than produced: a real list needs a model that plans, and what
 * the panel draws given what the server holds is a fact about this page alone.
 * SessionTodoAPITest is the other half - that the agent's tools leave behind
 * what these queries answer.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const { browser, page } = await open({ viewport: { width: 1440, height: 1000 } });

const AT = '2026-10-11T09:00:00Z';

const EVENTS = [
  { id: 1, kind: 'USER', actor: 'Planner node', content: 'Fix the build.', result: null, millis: null, at: AT },
];

/** In the agent's order: 2 was moved to the front, and 1 is done. */
const FULL_TODOS = [
  { id: 2, text: 'Write the fix', note: null, done: false },
  { id: 1, text: 'Read the issue', note: 'It is the SQLite leg', done: true },
  { id: 3, text: 'Run the suite', note: 'Postgres and SQLite', done: false },
];

const FULL_NOTES = [
  { id: '11', note: 'Steps 1-3 done', writtenBy: 'Planner', writtenAt: AT },
  { id: '12', note: 'The third test is the flaky one', writtenBy: 'Planner', writtenAt: AT },
];

let todos = FULL_TODOS;
let notes = FULL_NOTES;

const session = () => ({
  id: '9002',
  key: 'zz-todos-check',
  keyPrefix: 'zz',
  workspaceId: WORKSPACE,
  eventCount: EVENTS.length,
  createdAt: AT,
  lastEventAt: AT,
  notes,
});

const answer = (route, data) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data }) });

await page.route('**/graphql', async (route) => {
  const body = route.request().postData() ?? '';
  if (body.includes('sessionTodos')) return answer(route, { sessionTodos: todos });
  if (body.includes('sessionBoxes')) return answer(route, { sessionBoxes: [] });
  if (body.includes('sessionScratchpads')) return answer(route, { sessionScratchpads: [] });
  if (body.includes('llmSessionEvents')) {
    return answer(route, { llmSessionEvents: { totalElements: EVENTS.length, totalPages: 1, content: EVENTS } });
  }
  if (body.includes('llmSession(')) return answer(route, { llmSession: session() });
  return route.continue();
});

const URL = `${BASE}/workspace/${WORKSPACE}/sessions/9002`;
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-session-todo]', { timeout: 20_000 }).catch(() => {});

const boxes = await page.$('[data-session-boxes]');
const todoPanel = await page.$('[data-session-todos]');
const notePanel = await page.$('[data-session-notes]');
record(todoPanel !== null, 'the session page draws a to-do panel');
record(notePanel !== null, 'and a notes panel');

if (boxes && todoPanel && notePanel) {
  const b = await boxes.boundingBox();
  const t = await todoPanel.boundingBox();
  const n = await notePanel.boundingBox();
  record(t.y > b.y + b.height, `the to-do panel is below the boxes (${Math.round(t.y)} > ${Math.round(b.y + b.height)})`);
  record(n.y > t.y + t.height, `the notes panel is below the to-dos (${Math.round(n.y)} > ${Math.round(t.y + t.height)})`);
  record(Math.abs(t.x - b.x) < 1 && Math.abs(t.width - b.width) < 1, 'and in the same column, as wide as the boxes');
}

const items = await page.$$eval('[data-session-todo]', (all) =>
  all.map((one) => ({
    id: one.getAttribute('data-session-todo'),
    done: one.getAttribute('data-session-todo-done') === 'true',
    text: one.querySelector('[data-session-todo-text]')?.textContent?.trim() ?? '',
    note: one.querySelector('[data-session-todo-note]')?.textContent?.trim() ?? '',
    ticked: one.querySelector('[data-session-todo-mark] img') !== null,
    struck: getComputedStyle(one.querySelector('[data-session-todo-text]') ?? one).textDecorationLine,
    noteBelow:
      one.querySelector('[data-session-todo-note]') === null
        ? null
        : one.querySelector('[data-session-todo-note]').getBoundingClientRect().top >=
          one.querySelector('[data-session-todo-text]').getBoundingClientRect().bottom - 1,
  })),
);

record(
  items.map((one) => one.text).join(' | ') === 'Write the fix | Run the suite | Read the issue',
  `open items in the agent's order, then the done one (${items.map((one) => one.text).join(' | ')})`,
);
const done = items.find((one) => one.id === '1');
record(done?.done === true && done.ticked, 'the done item is ticked');
record(done?.struck === 'line-through', `and struck through (${done?.struck})`);
const open1 = items.find((one) => one.id === '2');
record(open1 !== undefined && !open1.ticked && open1.struck !== 'line-through', 'an open item is neither ticked nor struck');
const noted = items.find((one) => one.id === '3');
record(noted?.note === 'Postgres and SQLite' && noted.noteBelow === true, `an item's note is drawn under it (${noted?.note})`);
record(open1?.note === '', 'an item with no note draws none');

/* An open item's box has to be seen: 3:1 against what is behind it, the bar for anything that is not text. */
const contrast = await page.evaluate(() => {
  const mark = document.querySelector('[data-session-todo-done="false"] [data-session-todo-mark]');
  if (mark === null) return null;
  const rgb = (value) => (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
  let behind = mark.parentElement;
  while (behind !== null && (rgb(getComputedStyle(behind).backgroundColor)[3] ?? 1) === 0) behind = behind.parentElement;
  const lum = ([r, g, b]) => {
    const one = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * one(r) + 0.7152 * one(g) + 0.0722 * one(b);
  };
  const a = lum(rgb(getComputedStyle(mark).borderTopColor));
  const b = lum(rgb(getComputedStyle(behind ?? document.body).backgroundColor));
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10;
});
record(contrast !== null && contrast >= 3, `an open item's box stands out from the panel (${contrast}:1)`);

const drawnNotes = await page.$$eval('[data-session-note-text]', (all) => all.map((one) => one.textContent?.trim()));
record(
  drawnNotes.join(' | ') === 'Steps 1-3 done | The third test is the flaky one',
  `the notes, oldest first as the agent is handed them (${drawnNotes.join(' | ')})`,
);

/* Each panel's list scrolls inside its panel rather than growing it off the page. */
const scrolling = await page.evaluate(() =>
  [...document.querySelectorAll('[data-session-todos] ul, [data-session-notes] ul, [data-session-boxes] ul')].map((list) => {
    const style = getComputedStyle(list);
    return { overflow: style.overflowY, max: style.maxHeight };
  }),
);
record(
  scrolling.length > 0 && scrolling.every((one) => one.overflow === 'auto' && one.max !== 'none'),
  `a panel's list is capped and scrolls (${JSON.stringify(scrolling)})`,
);

// A session the agent planned nothing in, and wrote nothing down in.
todos = [];
notes = [];
await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('[data-session-todos]', { timeout: 20_000 }).catch(() => {});
await page.waitForTimeout(500);
const emptyTodos = (await page.$eval('[data-session-todos]', (one) => one.textContent).catch(() => '')) ?? '';
const emptyNotes = (await page.$eval('[data-session-notes]', (one) => one.textContent).catch(() => '')) ?? '';
record(emptyTodos.includes('None in this session yet.'), `an empty to-do list says so (${emptyTodos})`);
record(emptyNotes.includes('None in this session yet.'), `no notes says so (${emptyNotes})`);
record((await page.$$('[data-session-todo]')).length === 0, 'and draws no items');

await finish(browser);
