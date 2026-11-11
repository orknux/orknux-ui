/**
 * Stands in for the editors' kept questions, for checks that must not ask a
 * model. An editor puts a question with a POST to its item's `asks` and reads
 * the answer from `/api/editor-asks/{id}`; `answer(body)` is handed what was
 * sent - `messages`, `readOnly`, `modelId` - and gives back what the model
 * said, `{ answer, changed?, compacted? }`. Where it says `changed`, the
 * editor reads the item again from the server, so a check that answers
 * `changed: true` saves the change there first, as a model would have. A
 * promise that never settles holds the answer for good, which is how a check
 * looks at a turn still being written.
 */
const PATHS = {
  document: '**/api/design/documents/*/asks',
  sheet: '**/api/design/sheets/*/asks',
  wireframe: '**/api/design/wireframes/*/asks',
  diagram: '**/api/explore/diagrams/*/asks',
};

let made = 0;

export async function standInForEditorAsks(page, kind, answer) {
  const answers = new Map();
  await page.route(PATHS[kind], async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    made += 1;
    const id = `stand-in-${kind}-${made}`;
    const body = route.request().postDataJSON() ?? {};
    answers.set(id, Promise.resolve().then(() => answer(body)));
    return route.fulfill({ json: { id, status: 'WAITING' } });
  });
  await page.route('**/api/editor-asks/**', async (route) => {
    const id = new URL(route.request().url()).pathname.split('/').pop();
    const held = answers.get(id);
    if (held === undefined) return route.fallback();
    const said = await held;
    return route.fulfill({ json: { id, status: 'ANSWERED', changed: false, compacted: null, ...said } });
  });
}

/** The document's chat, as checks written before the other editors kept their questions call it. */
export async function standInForDocumentAsks(page, answer) {
  return standInForEditorAsks(page, 'document', answer);
}
