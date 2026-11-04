/**
 * A diagram's history, opened from its editor.
 *
 * Every save keeps the drawing it replaced, so a diagram can be put back to
 * any version: History lists them with the live one on top, a row opens as the
 * server's picture of that version, and Restore - asked first - writes it back
 * as a save of its own. The canvas takes the restored drawing in, and the
 * server stores it.
 *
 * Measured off what is drawn - the rows in the list, the picture's size, the
 * boxes on the canvas - and off what the server stores.
 */
import { WORKSPACE, BASE, open, record, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1600, height: 1000 } });

const drawing = (...labels) =>
  JSON.stringify({
    nodes: labels.map((label, at) => ({ id: `n${at}`, kind: 'box', label, x: at * 240, y: 0, w: 160, h: 60 })),
    edges: labels.slice(1).map((_, at) => ({ id: `e${at}`, from: `n${at}`, to: `n${at + 1}`, kind: 'arrow', color: '#aa3300', width: 3 })),
  });
const { createDiagram } = await graphql(
  'mutation ($w: ID!, $n: String!, $d: String) { createDiagram(workspaceId: $w, name: $n, document: $d) { id } }',
  { w: WORKSPACE, n: `zzHistory ${Date.now()}`, d: drawing('First') },
);
const id = createDiagram.id;
const save = (document) => graphql('mutation ($id: ID!, $d: String!) { saveDiagram(id: $id, document: $d) { revision } }', { id, d: document });
const stored = async () => JSON.parse((await graphql('query ($id: ID!) { diagram(id: $id) { document } }', { id })).diagram.document);
const onCanvas = () => page.locator('.react-flow__node').count();

try {
  // Changed twice, each a version of its own.
  await save(drawing('First', 'Second'));
  await save(drawing('First', 'Second', 'Third'));

  await page.goto(`${BASE}/workspace/${WORKSPACE}/explore/diagrams/${id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('.react-flow__node[data-id="n2"]').waitFor({ timeout: 20_000 });
  record((await onCanvas()) === 3, `the editor opens on the newest drawing (${await onCanvas()} boxes)`);

  await page.getByTestId('diagram-history').click();
  await page.getByTestId('diagram-history-dialog').waitFor({ state: 'visible' });
  const rows = page.getByTestId('diagram-version');
  await rows.first().waitFor({ timeout: 10_000 });
  const keys = await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-version')));
  record(keys.length === 3 && keys[0] === 'current', `the list holds the live version and the two it replaced (${keys.join(', ')})`);

  // The oldest opens as its picture, drawn at a size.
  await rows.last().click();
  const picture = page.getByTestId('diagram-version-picture');
  await picture.waitFor({ state: 'visible', timeout: 10_000 });
  await page.waitForFunction(() => {
    const img = document.querySelector('[data-testid="diagram-version-picture"]');
    return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
  });
  const shown = await picture.boundingBox();
  record(shown !== null && shown.width > 40 && shown.height > 20, `the version is drawn (${Math.round(shown?.width ?? 0)} x ${Math.round(shown?.height ?? 0)})`);

  // Restored, after the question.
  await page.getByTestId('diagram-version-restore').click();
  await page.getByRole('dialog').getByRole('button', { name: /^Restore$|^Przywróć$/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('.react-flow__node').length === 1, null, { timeout: 10_000 });
  record((await onCanvas()) === 1, 'the canvas takes the restored drawing in');

  const after = await stored();
  record(
    after.nodes.length === 1 && after.nodes[0].label === 'First' && after.edges.length === 0,
    `the server stores the first version (${after.nodes.map((one) => one.label).join(', ')})`,
  );

  // The restore is a version of its own: the drawing it replaced is now in the list, and the live one says it was restored.
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="diagram-version"]').length === 4, null, { timeout: 10_000 }).catch(() => undefined);
  const doors = await rows.evaluateAll((all) => all.map((one) => one.getAttribute('data-door')));
  record(doors.length === 4 && doors[0] === 'RESTORE', `the restore is itself undoable (${doors.join(', ')})`);
  await page.getByTestId('diagram-history-close').click();
} finally {
  await graphql('mutation ($id: ID!) { deleteDiagram(id: $id) }', { id }).catch(() => undefined);
}

await finish(browser);
