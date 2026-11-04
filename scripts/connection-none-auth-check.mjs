/**
 * A connection's page draws only what the connection can use.
 *
 * Reported from a screenshot: an HTTP connection with Auth Type None still
 * offered an API Token box, and a URL Override holding the very address in the
 * URL box above it. The new-connection dialog never drew the token under None;
 * the page did, and an override beside an editable URL is a second box for one
 * address. Measured is what is in the DOM:
 *
 * - under None, with nothing stored, no token field; choosing a kind of auth
 *   brings it, and going back to None takes it away;
 * - a token already stored under None stays in view, so it can be cleared;
 * - no URL Override beside a URL the workspace can edit, unless one is set.
 */
import { BASE, WORKSPACE, open, record, finish, chooseOption } from './suite/harness.mjs';

const PREFIX = 'zzConnectionNoneAuth';
const { browser, page, graphql } = await open({ viewport: { width: 1440, height: 1000 } });

const listed = async () =>
  (await graphql(`query ($w: ID!) { workspaceConnections(workspaceId: $w) { id name } }`, { w: WORKSPACE })).workspaceConnections;
async function sweep() {
  for (const old of (await listed()).filter((one) => one.name.startsWith(PREFIX))) {
    await graphql(`mutation ($id: ID!) { disconnectWorkspaceConnection(id: $id) }`, { id: old.id }).catch(() => undefined);
  }
}
await sweep();
const make = async ({ urlOverride, ...extra }) => {
  const made = (
    await graphql(`mutation ($i: CreateWorkspaceConnectionInput!) { createWorkspaceConnection(input: $i) { id } }`, {
      i: { workspaceId: WORKSPACE, name: `${PREFIX} ${Date.now()}`, type: 'HTTP', url: 'http://prometheus.example.invalid:9090', authType: 'NONE', ...extra },
    })
  ).createWorkspaceConnection;
  // The override is not among what a connection is made with; it is set after.
  if (urlOverride) {
    await graphql(`mutation ($id: ID!, $i: UpdateWorkspaceConnectionInput!) { updateWorkspaceConnection(id: $id, input: $i) { id } }`, {
      id: made.id,
      i: { urlOverride },
    });
  }
  return made;
};

const at = async (connection) => {
  await page.goto(`${BASE}/workspace/${WORKSPACE}/integrations/connections/${connection.id}`, { waitUntil: 'domcontentloaded' });
  await page.locator('#connection-auth').waitFor({ timeout: 20_000 });
  await page.waitForTimeout(400);
};
const token = () => page.locator('#connection-secret, #connection-secret-variable').count();
const override = () => page.locator('#connection-url-override').count();

const plain = await make({});
await at(plain);
record((await token()) === 0, 'under None, with nothing stored, there is no token field');
record((await override()) === 0, 'and no URL Override beside the URL it can edit');
await chooseOption(page, '#connection-auth', 'BEARER_TOKEN');
await page.waitForTimeout(300);
record((await token()) > 0, 'choosing Bearer brings the token field');
await chooseOption(page, '#connection-auth', 'NONE');
await page.waitForTimeout(300);
record((await token()) === 0, 'and None takes it away again');

const stored = await make({ secret: 'left-over-token' });
await at(stored);
record((await token()) > 0, 'a token stored under None stays in view, so it can be cleared');

const overridden = await make({ urlOverride: 'http://elsewhere.example.invalid' });
await at(overridden);
record((await override()) === 1, 'an override already set stays in view, so it can be cleared');

await sweep();
await finish(browser);
