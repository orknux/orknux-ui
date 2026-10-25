/**
 * A new agent starts the server's specialised tools at Offer, and the form
 * draws them so.
 *
 * Asked for: rating, the picture tools, MIDI, the less basic readers and every
 * orknux_ tool start at Offer rather than Always - found once a tool limit is
 * set. The server says which with `startsOffered`; what is measured here is the
 * page. In a workspace that keeps its built-ins fixed the rows used to be read-
 * only and drawn Always whatever was stored, so a tool at Offer would have read
 * Always: there they cycle Offer and Always, never Hide, and finish_answer -
 * which the server carries there - stays fixed.
 *
 * Makes its own agent and deletes it; puts the workspace's switch back.
 */
import { BASE, WORKSPACE, open, record, drawn, finish } from './suite/harness.mjs';

const { browser, page, graphql } = await open({ viewport: { width: 1500, height: 1100 } });

const unsafeWas = (await graphql(`query ($w: ID!) { workspace(id: $w) { unsafeBuiltInTools } }`, { w: WORKSPACE }))
  .workspace.unsafeBuiltInTools;
const allowUnsafe = (allowed) =>
  graphql(`mutation ($w: ID!, $a: Boolean!) { setWorkspaceUnsafeBuiltInTools(workspaceId: $w, allowed: $a) { id } }`, {
    w: WORKSPACE,
    a: allowed,
  });
await allowUnsafe(false);

const builtIn = (await graphql(`{ builtInTools { name startsOffered } }`)).builtInTools;
const offered = new Set(builtIn.filter((one) => one.startsOffered).map((one) => one.name));
record(
  ['rate_session', 'picture_view', 'midi_read', 'xml_query', 'orknux_news'].every((name) => offered.has(name)) &&
    !offered.has('pdf_read') && !offered.has('note_to_self'),
  'the server says which start at Offer: rating, pictures, MIDI, the less basic readers and orknux_, not pdf_read or the notes',
);

const agent = (await graphql(
  `mutation($w: ID!, $n: String!) { createAgent(input: { workspaceId: $w, name: $n, type: LLM }) { id requiredTools } }`,
  { w: WORKSPACE, n: `zz tool offer start ${Date.now()}` },
)).createAgent;
record(
  !agent.requiredTools.includes('picture_view') && agent.requiredTools.includes('pdf_read'),
  'a new agent holds picture_view at Offer and pdf_read Always',
);

await page.goto(`${BASE}/workspace/${WORKSPACE}/agents/${agent.id}/settings`, { waitUntil: 'domcontentloaded' });
record(await drawn(page, "the agent's page"), "the agent's page is on screen");
const button = (tool) => page.locator(`[data-grant-name="${tool}"] [data-tool-state]`).first();
await button('picture_view').waitFor({ timeout: 20_000 }).catch(() => undefined);
await page.waitForTimeout(1500);
const state = (tool) => button(tool).getAttribute('data-tool-state');
const fixed = async (tool) => (await button(tool).getAttribute('data-tool-fixed')) !== null;

record(
  (await state('picture_view')) === 'offer' && (await state('rate_session')) === 'offer' && (await state('orknux_news')) === 'offer',
  `picture_view, rate_session and orknux_news read Offer (${await state('picture_view')}, ${await state('rate_session')}, ${await state('orknux_news')})`,
);
record((await state('pdf_read')) === 'always', `pdf_read reads Always (${await state('pdf_read')})`);
record(
  !(await fixed('picture_view')) && (await fixed('finish_answer')),
  'with the built-ins kept fixed, picture_view can still be marked and finish_answer cannot',
);

await button('picture_view').click();
const marked = await state('picture_view');
await button('picture_view').click();
const back = await state('picture_view');
record(marked === 'always' && back === 'offer', `a press marks it Always, the next puts it back to Offer, never Hide (${marked} -> ${back})`);
await button('picture_view').click();
await page.getByRole('button', { name: /^Save/ }).first().click();
await page.waitForTimeout(2000);
const saved = (await graphql(`query($id: ID!) { agent(id: $id) { tools requiredTools } }`, { id: agent.id })).agent;
record(
  saved.requiredTools.includes('picture_view') && saved.tools.includes('picture_view') && !saved.requiredTools.includes('midi_read'),
  'Save stores picture_view Always and leaves midi_read at Offer',
);

await graphql(`mutation($id: ID!) { deleteAgent(id: $id) }`, { id: agent.id }).catch(() => undefined);
await allowUnsafe(unsafeWas).catch(() => undefined);
await finish(browser);
