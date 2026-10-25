/**
 * How long a diagram node's notes may be is an Admin Setting: a row under
 * Limits, 5000 to begin with, and what is set there is the cap the diagram
 * editor's counter counts to and its notes stop at.
 *
 * Changes an installation-wide number, so it runs alone, and puts it back.
 * Makes its own diagram and removes it.
 */
import { BASE, WORKSPACE, open, record, finish } from './suite/harness.mjs';

const KEY = 'diagram.note.characters';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });
const one = async () => (await graphql('query { tunables { key value configured set } }', {})).tunables.find((held) => held.key === KEY);
const was = await one();
record(was !== undefined && was.configured === 5000, `the server lists the note cap, 5000 unless configured otherwise (${JSON.stringify(was)})`);

await page.goto(`${BASE}/admin/settings#limits`, { waitUntil: 'domcontentloaded' });
const box = page.locator(`[id="tunable-${KEY}"]`);
const there = await box.waitFor({ timeout: 20_000 }).then(() => true).catch(() => false);
const label = (await page.locator(`[data-tunable="${KEY}"]`).textContent().catch(() => '')) ?? '';
record(there && label.includes("How long a diagram node's notes may be"), `Admin Settings has a row for it under Limits (${label})`);

// Set from the page, and the editor counts to it.
await box.fill('120');
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
record((await one())?.value === 120, 'saving 120 stores it');

const { createDiagram: made } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzCap ${Date.now()}`, d: JSON.stringify({ nodes: [{ id: 'n', kind: 'box', label: 'Capped', x: 0, y: 0, w: 160, h: 60 }], edges: [] }) },
);
await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${made.id}?node=n`, { waitUntil: 'domcontentloaded' });
const notes = page.getByTestId('diagram-node-notes');
await notes.waitFor({ timeout: 20_000 }).catch(() => undefined);
await notes.fill('y'.repeat(200));
const counter = (await page.getByTestId('diagram-notes-counter').textContent().catch(() => '')) ?? '';
record((await notes.inputValue()).length === 120 && counter.replace(/\s/g, '') === '120/120', `the editor's notes stop at the number set (${counter})`);

// And the server holds the same line whatever a page sends.
const refused = await page.evaluate(async (id) => {
  const answer = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: 'mutation ($id: ID!, $d: String!) { saveDiagram(id: $id, document: $d) { id } }',
      variables: { id, d: JSON.stringify({ nodes: [{ id: 'n', label: 'Capped', notes: 'z'.repeat(121) }], edges: [] }) },
    }),
  });
  return answer.json();
}, made.id);
record(refused.errors?.[0]?.extensions?.code === 'DiagramNotesTooLong', `a save past it is refused by the server (${JSON.stringify(refused.errors?.[0]?.extensions)})`);

await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id: made.id });
await graphql('mutation ($key: String!, $value: Int) { setTunable(key: $key, value: $value) { value } }', { key: KEY, value: was?.set ? was.value : null });
record((await one())?.value === was?.value, 'the number is left as it was found');
await finish(browser);
